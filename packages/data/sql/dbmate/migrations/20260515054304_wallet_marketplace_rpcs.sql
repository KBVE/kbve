-- migrate:up

-- Phase 2 of the marketplace bootstrap: service-layer RPCs for the
-- create / bid / buy-now / cancel / settle / expire lifecycle, plus a
-- pg_cron schedule that drives the periodic expire sweep.
--
-- All functions are SECURITY DEFINER, service_role only, owned by
-- service_role, with search_path = ''. They are the authorization
-- boundary for the marketplace; Phase 3 public proxies wrap these
-- after applying auth.uid()-based ownership checks.
--
-- Money flow (khash-only in v1):
--
--   place_bid(listing, bidder, amount):
--     service_debit(bidder, khash, amount, 'market_buy')
--       → escrow_ledger_id stored on the new wallet.bid row
--     if prior active bid exists:
--       service_credit(prior_bidder, khash, prior_amount, 'market_buy')
--         → refund_ledger_id stored on the prior bid row; status='outbid'
--     if amount >= buy_now_price:
--       service_settle_listing(listing, the new bid) — short-circuit win
--
--   buy_now(listing, buyer):
--     refund the current active bid (if any) just like place_bid
--     service_debit(buyer, khash, buy_now_price, 'market_buy')
--     settle:
--       service_credit(seller, khash, price - fee, 'market_sell')
--       service_credit(treasury, khash, fee, 'market_fee')
--
--   cancel_listing(listing, seller):
--     refund the current active bid (if any) — service_credit('market_buy')
--     status='cancelled', settled_at = now()
--
--   settle_listing(listing, winning_bid):
--     mark bid 'won' (no refund_ledger_id; funds go to seller)
--     service_credit(seller, khash, winning_amount - fee, 'market_sell')
--     service_credit(treasury, khash, fee, 'market_fee')
--     mark listing 'sold', buyer_account = winning_bid.bidder_account
--
--   expire_listings():  -- pg_cron @ */15 * * * *
--     for each active listing with expires_at <= now():
--       if current_bid_id IS NOT NULL: settle_listing
--       else:                          mark 'expired'
--
-- Fee = floor(amount / 100) = 1%. Rounding favours the seller; for
-- small amounts the fee is 0 (acceptable).
--
-- Idempotency:
--   Each top-level RPC accepts a client-supplied idempotency_key. We
--   look up the existing row by (actor_account, idempotency_key) and
--   return its id if found. Intermediate ledger writes use freshly-
--   generated keys because they live inside the outer transaction:
--   if the outer call is a replay we never reach them; if not, the
--   wallet_bid_listing_active_uq / wallet_listing_seller_idempotency_uq
--   indexes still protect against double-spending.

-- ============================================================================
-- HELPER: treasury account id (cached at session level)
-- ============================================================================

CREATE OR REPLACE FUNCTION wallet.treasury_account_id()
RETURNS UUID
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_id UUID;
BEGIN
    SELECT id INTO v_id
      FROM wallet.account
     WHERE kind = 'treasury' AND label = 'kbve_treasury';
    IF v_id IS NULL THEN
        RAISE EXCEPTION 'kbve_treasury account missing' USING ERRCODE = '23503';
    END IF;
    RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION wallet.treasury_account_id() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wallet.treasury_account_id() TO service_role;
ALTER FUNCTION wallet.treasury_account_id() OWNER TO service_role;

-- ============================================================================
-- service_create_listing
-- ============================================================================

CREATE OR REPLACE FUNCTION wallet.service_create_listing(
    p_seller_account  UUID,
    p_item_ref        JSONB,
    p_currency        wallet.currency_kind,
    p_buy_now_price   BIGINT,
    p_min_bid         BIGINT,
    p_expires_at      TIMESTAMPTZ,
    p_idempotency_key UUID
)
RETURNS BIGINT  -- listing.id
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_existing_id BIGINT;
    v_listing_id  BIGINT;
    v_currency    wallet.currency_kind := COALESCE(p_currency, 'khash'::wallet.currency_kind);
    v_now         TIMESTAMPTZ := transaction_timestamp();
BEGIN
    IF p_seller_account IS NULL OR p_idempotency_key IS NULL OR p_item_ref IS NULL THEN
        RAISE EXCEPTION 'seller_account, item_ref, idempotency_key are required'
            USING ERRCODE = '22004';
    END IF;

    -- Service-layer validation. Table CHECKs are belt-and-suspenders;
    -- raising at the RPC layer surfaces clean domain errors before the
    -- INSERT roundtrip.
    IF v_currency <> 'khash'::wallet.currency_kind THEN
        RAISE EXCEPTION 'marketplace v1 only supports khash' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(p_item_ref) <> 'object' OR p_item_ref = '{}'::jsonb THEN
        RAISE EXCEPTION 'item_ref must be a non-empty JSON object' USING ERRCODE = '22023';
    END IF;
    IF p_buy_now_price IS NULL AND p_min_bid IS NULL THEN
        RAISE EXCEPTION 'listing requires buy_now_price or min_bid' USING ERRCODE = '22023';
    END IF;
    IF p_buy_now_price IS NOT NULL AND p_buy_now_price <= 0 THEN
        RAISE EXCEPTION 'buy_now_price must be positive' USING ERRCODE = '22023';
    END IF;
    IF p_min_bid IS NOT NULL AND p_min_bid <= 0 THEN
        RAISE EXCEPTION 'min_bid must be positive' USING ERRCODE = '22023';
    END IF;
    IF p_buy_now_price IS NOT NULL AND p_min_bid IS NOT NULL
       AND p_min_bid > p_buy_now_price THEN
        RAISE EXCEPTION 'min_bid cannot exceed buy_now_price' USING ERRCODE = '22023';
    END IF;
    IF p_expires_at IS NULL OR p_expires_at <= v_now THEN
        RAISE EXCEPTION 'expires_at must be in the future' USING ERRCODE = '22023';
    END IF;

    -- Replay shortcut.
    SELECT id INTO v_existing_id
      FROM wallet.listing
     WHERE seller_account = p_seller_account
       AND idempotency_key = p_idempotency_key;
    IF v_existing_id IS NOT NULL THEN
        RETURN v_existing_id;
    END IF;

    INSERT INTO wallet.listing (
        seller_account, item_ref, currency,
        buy_now_price, min_bid, expires_at, idempotency_key
    ) VALUES (
        p_seller_account, p_item_ref, v_currency,
        p_buy_now_price, p_min_bid, p_expires_at, p_idempotency_key
    ) RETURNING id INTO v_listing_id;

    INSERT INTO wallet.audit_log (action, target_type, target_id, metadata)
    VALUES (
        'marketplace.listing_create', 'listing', v_listing_id::TEXT,
        jsonb_build_object(
            'seller_account', p_seller_account,
            'buy_now_price', p_buy_now_price,
            'min_bid', p_min_bid,
            'expires_at', p_expires_at
        )
    );

    RETURN v_listing_id;
END;
$$;
ALTER FUNCTION wallet.service_create_listing(UUID, JSONB, wallet.currency_kind, BIGINT, BIGINT, TIMESTAMPTZ, UUID) OWNER TO service_role;
REVOKE ALL ON FUNCTION wallet.service_create_listing(UUID, JSONB, wallet.currency_kind, BIGINT, BIGINT, TIMESTAMPTZ, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wallet.service_create_listing(UUID, JSONB, wallet.currency_kind, BIGINT, BIGINT, TIMESTAMPTZ, UUID) TO service_role;

-- ============================================================================
-- INTERNAL HELPER: refund the current active bid (if any)
--
-- Locks the listing row and the active bid row, credits the prior bidder
-- their bid amount, marks the bid 'outbid' (status arg) or 'refunded'
-- (when called from cancel/expire). Returns the prior bid id (NULL if
-- there was none). Caller must already hold a lock on the listing.
-- ============================================================================

CREATE OR REPLACE FUNCTION wallet.refund_active_bid(
    p_listing_id BIGINT,
    p_next_status wallet.bid_status,  -- 'outbid' | 'refunded'
    p_reason     TEXT
)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_bid_id           BIGINT;
    v_bidder           UUID;
    v_amount           BIGINT;
    v_refund_ledger_id BIGINT;
    v_audit_action     TEXT;
    v_now              TIMESTAMPTZ := transaction_timestamp();
BEGIN
    IF p_next_status NOT IN ('outbid', 'refunded') THEN
        RAISE EXCEPTION 'refund_active_bid requires outbid or refunded'
            USING ERRCODE = '22023';
    END IF;

    -- Source-of-truth join: only refund the bid the listing actually
    -- points at. Catches drift between listing.current_bid_id and the
    -- active bid row.
    SELECT b.id, b.bidder_account, b.amount
      INTO v_bid_id, v_bidder, v_amount
      FROM wallet.listing l
      JOIN wallet.bid b ON b.id = l.current_bid_id
     WHERE l.id = p_listing_id AND b.status = 'active'
     FOR UPDATE OF b;

    IF v_bid_id IS NULL THEN
        RETURN NULL;
    END IF;

    v_refund_ledger_id := wallet.service_credit(
        v_bidder,
        'khash'::wallet.currency_kind,
        v_amount,
        'market_buy'::wallet.source_kind,
        p_reason,
        'bid',
        v_bid_id,
        extensions.gen_random_uuid()
    );

    UPDATE wallet.bid
       SET status = p_next_status,
           settled_at = v_now,
           refund_ledger_id = v_refund_ledger_id
     WHERE id = v_bid_id;

    v_audit_action := CASE p_next_status
        WHEN 'outbid'   THEN 'marketplace.bid_outbid_refund'
        WHEN 'refunded' THEN 'marketplace.bid_cancel_refund'
    END;

    INSERT INTO wallet.audit_log (action, target_type, target_id, metadata, reason)
    VALUES (
        v_audit_action, 'bid', v_bid_id::TEXT,
        jsonb_build_object(
            'listing_id', p_listing_id,
            'bidder_account', v_bidder,
            'amount', v_amount,
            'refund_ledger_id', v_refund_ledger_id,
            'refunded_at', v_now
        ),
        p_reason
    );

    RETURN v_bid_id;
END;
$$;
ALTER FUNCTION wallet.refund_active_bid(BIGINT, wallet.bid_status, TEXT) OWNER TO service_role;
REVOKE ALL ON FUNCTION wallet.refund_active_bid(BIGINT, wallet.bid_status, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wallet.refund_active_bid(BIGINT, wallet.bid_status, TEXT) TO service_role;
COMMENT ON FUNCTION wallet.refund_active_bid(BIGINT, wallet.bid_status, TEXT) IS
    'INTERNAL marketplace helper. Caller must already hold FOR UPDATE on the listing row. Do not wrap from public proxies.';

-- ============================================================================
-- INTERNAL HELPER: distribute funds on settlement
--
-- Credits seller (price - fee) and treasury (fee). Returns (fee, net).
-- Caller must already hold the FOR UPDATE lock on the listing.
-- ============================================================================

CREATE OR REPLACE FUNCTION wallet.distribute_settlement(
    p_listing_id BIGINT,
    p_seller     UUID,
    p_amount     BIGINT
)
RETURNS TABLE (fee BIGINT, net BIGINT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_fee      BIGINT := p_amount / 100;
    v_net      BIGINT := p_amount - (p_amount / 100);
    v_treasury UUID   := wallet.treasury_account_id();
BEGIN
    PERFORM wallet.service_credit(
        p_seller,
        'khash'::wallet.currency_kind,
        v_net,
        'market_sell'::wallet.source_kind,
        'marketplace settlement (seller)',
        'listing',
        p_listing_id,
        extensions.gen_random_uuid()
    );

    IF v_fee > 0 THEN
        PERFORM wallet.service_credit(
            v_treasury,
            'khash'::wallet.currency_kind,
            v_fee,
            'market_fee'::wallet.source_kind,
            'marketplace fee (1%)',
            'listing',
            p_listing_id,
            extensions.gen_random_uuid()
        );
    END IF;

    fee := v_fee;
    net := v_net;
    RETURN NEXT;
END;
$$;
ALTER FUNCTION wallet.distribute_settlement(BIGINT, UUID, BIGINT) OWNER TO service_role;
REVOKE ALL ON FUNCTION wallet.distribute_settlement(BIGINT, UUID, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wallet.distribute_settlement(BIGINT, UUID, BIGINT) TO service_role;
COMMENT ON FUNCTION wallet.distribute_settlement(BIGINT, UUID, BIGINT) IS
    'INTERNAL marketplace helper. Splits a settled amount into (net, fee) via two service_credit calls. Do not wrap from public proxies.';

-- ============================================================================
-- service_settle_listing
--
-- Marks the winning bid 'won', distributes funds, marks listing 'sold'
-- with buyer_account = winning_bid.bidder. Caller MUST hold FOR UPDATE
-- on the listing row already. p_winning_bid_id allows the caller to
-- assert the expected bid; pass NULL to look up the active bid.
-- ============================================================================

CREATE OR REPLACE FUNCTION wallet.service_settle_listing(
    p_listing_id     BIGINT,
    p_winning_bid_id BIGINT  -- NULL = look up via listing.current_bid_id
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_listing_row wallet.listing%ROWTYPE;
    v_seller      UUID;
    v_bid_id      BIGINT;
    v_bidder      UUID;
    v_amount      BIGINT;
    v_now         TIMESTAMPTZ := transaction_timestamp();
    v_fee         BIGINT;
    v_net         BIGINT;
BEGIN
    -- Self-locking: external callers may invoke this directly. Inner
    -- callers (service_place_bid, service_buy_now, service_expire_listings)
    -- have already taken FOR UPDATE on the listing — re-locking is a
    -- no-op within the same transaction.
    SELECT * INTO v_listing_row
      FROM wallet.listing WHERE id = p_listing_id FOR UPDATE;
    IF v_listing_row.id IS NULL THEN
        RAISE EXCEPTION 'listing % not found', p_listing_id USING ERRCODE = '23503';
    END IF;
    IF v_listing_row.status <> 'active' THEN
        RAISE EXCEPTION 'listing % not active (status=%); cannot settle',
            p_listing_id, v_listing_row.status USING ERRCODE = '22023';
    END IF;
    v_seller := v_listing_row.seller_account;

    IF p_winning_bid_id IS NULL THEN
        -- Resolve via the denormalized pointer so settlement aligns
        -- with the listing's current_bid_id source of truth.
        IF v_listing_row.current_bid_id IS NULL THEN
            RAISE EXCEPTION 'no active bid to settle for listing %', p_listing_id
                USING ERRCODE = '23503';
        END IF;
        SELECT id, bidder_account, amount
          INTO v_bid_id, v_bidder, v_amount
          FROM wallet.bid
         WHERE id = v_listing_row.current_bid_id
           AND listing_id = p_listing_id
           AND status = 'active'
         FOR UPDATE;
    ELSE
        SELECT id, bidder_account, amount
          INTO v_bid_id, v_bidder, v_amount
          FROM wallet.bid
         WHERE id = p_winning_bid_id
           AND listing_id = p_listing_id
           AND status = 'active'
         FOR UPDATE;
    END IF;

    IF v_bid_id IS NULL THEN
        RAISE EXCEPTION 'no active bid to settle for listing %', p_listing_id
            USING ERRCODE = '23503';
    END IF;

    UPDATE wallet.bid
       SET status = 'won',
           settled_at = v_now
     WHERE id = v_bid_id;

    -- Statement_timestamp keeps the rest of the wallet schema's
    -- statement_timestamp(); we use transaction_timestamp() locally
    -- so all marketplace writes in this txn share one logical time.

    SELECT d.fee, d.net INTO v_fee, v_net
      FROM wallet.distribute_settlement(p_listing_id, v_seller, v_amount) d;

    UPDATE wallet.listing
       SET status = 'sold',
           settled_at = v_now,
           buyer_account = v_bidder,
           current_bid = NULL,
           current_bid_account = NULL,
           current_bid_id = NULL
     WHERE id = p_listing_id;

    INSERT INTO wallet.audit_log (action, target_type, target_id, metadata)
    VALUES (
        'marketplace.listing_settle', 'listing', p_listing_id::TEXT,
        jsonb_build_object(
            'winning_bid_id', v_bid_id,
            'buyer_account', v_bidder,
            'amount', v_amount,
            'fee', v_fee,
            'seller_net', v_net,
            'settled_at', v_now
        )
    );
END;
$$;
ALTER FUNCTION wallet.service_settle_listing(BIGINT, BIGINT) OWNER TO service_role;
REVOKE ALL ON FUNCTION wallet.service_settle_listing(BIGINT, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wallet.service_settle_listing(BIGINT, BIGINT) TO service_role;
COMMENT ON FUNCTION wallet.service_settle_listing(BIGINT, BIGINT) IS
    'INTERNAL marketplace helper invoked by place_bid (buy-now short-circuit), buy_now, and expire_listings. Self-locks the listing row and validates status=active + winning bid status=active.';

-- ============================================================================
-- service_place_bid
-- ============================================================================

CREATE OR REPLACE FUNCTION wallet.service_place_bid(
    p_listing_id      BIGINT,
    p_bidder_account  UUID,
    p_amount          BIGINT,
    p_idempotency_key UUID
)
RETURNS BIGINT  -- bid.id
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_existing_bid     BIGINT;
    v_listing_row      wallet.listing%ROWTYPE;
    v_now              TIMESTAMPTZ := transaction_timestamp();
    v_escrow_ledger_id BIGINT;
    v_new_bid_id       BIGINT;
BEGIN
    IF p_listing_id IS NULL OR p_bidder_account IS NULL
       OR p_amount IS NULL OR p_idempotency_key IS NULL THEN
        RAISE EXCEPTION 'listing_id, bidder_account, amount, idempotency_key are required'
            USING ERRCODE = '22004';
    END IF;
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'amount must be positive' USING ERRCODE = '22023';
    END IF;

    SELECT id INTO v_existing_bid
      FROM wallet.bid
     WHERE bidder_account = p_bidder_account
       AND idempotency_key = p_idempotency_key;
    IF v_existing_bid IS NOT NULL THEN
        RETURN v_existing_bid;
    END IF;

    -- Lock the listing for the lifetime of this transaction.
    SELECT * INTO v_listing_row
      FROM wallet.listing WHERE id = p_listing_id FOR UPDATE;

    IF v_listing_row.id IS NULL THEN
        RAISE EXCEPTION 'listing % not found', p_listing_id USING ERRCODE = '23503';
    END IF;
    IF v_listing_row.status <> 'active' THEN
        RAISE EXCEPTION 'listing % not active (status=%)',
            p_listing_id, v_listing_row.status USING ERRCODE = '22023';
    END IF;
    IF v_listing_row.expires_at <= v_now THEN
        RAISE EXCEPTION 'listing % has expired', p_listing_id USING ERRCODE = '22023';
    END IF;
    IF v_listing_row.seller_account = p_bidder_account THEN
        RAISE EXCEPTION 'seller cannot bid on own listing' USING ERRCODE = '42501';
    END IF;
    IF v_listing_row.min_bid IS NULL THEN
        RAISE EXCEPTION 'listing % is buy-now only', p_listing_id USING ERRCODE = '22023';
    END IF;
    IF p_amount < v_listing_row.min_bid THEN
        RAISE EXCEPTION 'amount % below min_bid %', p_amount, v_listing_row.min_bid
            USING ERRCODE = '22023';
    END IF;
    IF v_listing_row.current_bid IS NOT NULL AND p_amount <= v_listing_row.current_bid THEN
        RAISE EXCEPTION 'amount % must exceed current_bid %',
            p_amount, v_listing_row.current_bid USING ERRCODE = '22023';
    END IF;
    -- Reject bids above buy_now_price; the buyer should use buy_now
    -- instead so they don't overpay. Equality is allowed so this RPC
    -- can still short-circuit to settle below.
    IF v_listing_row.buy_now_price IS NOT NULL
       AND p_amount > v_listing_row.buy_now_price THEN
        RAISE EXCEPTION 'amount % exceeds buy_now_price %; use buy_now instead',
            p_amount, v_listing_row.buy_now_price USING ERRCODE = '22023';
    END IF;

    -- Escrow the bidder's funds.
    v_escrow_ledger_id := wallet.service_debit(
        p_bidder_account,
        'khash'::wallet.currency_kind,
        p_amount,
        'market_buy'::wallet.source_kind,
        'marketplace bid escrow',
        'listing',
        p_listing_id,
        extensions.gen_random_uuid()
    );

    -- Refund the prior active bid (if any).
    PERFORM wallet.refund_active_bid(p_listing_id, 'outbid', 'outbid by higher bid');

    -- Insert the new active bid.
    INSERT INTO wallet.bid (
        listing_id, bidder_account, amount, escrow_ledger_id, idempotency_key
    ) VALUES (
        p_listing_id, p_bidder_account, p_amount, v_escrow_ledger_id, p_idempotency_key
    ) RETURNING id INTO v_new_bid_id;

    -- Update the listing with the new live-bid pointers.
    UPDATE wallet.listing
       SET current_bid = p_amount,
           current_bid_account = p_bidder_account,
           current_bid_id = v_new_bid_id
     WHERE id = p_listing_id;

    INSERT INTO wallet.audit_log (action, target_type, target_id, metadata)
    VALUES (
        'marketplace.bid_place', 'bid', v_new_bid_id::TEXT,
        jsonb_build_object(
            'listing_id', p_listing_id,
            'bidder_account', p_bidder_account,
            'amount', p_amount,
            'escrow_ledger_id', v_escrow_ledger_id
        )
    );

    -- Short-circuit if this bid equals buy_now_price (we rejected
    -- amount > buy_now_price above).
    IF v_listing_row.buy_now_price IS NOT NULL AND p_amount >= v_listing_row.buy_now_price THEN
        PERFORM wallet.service_settle_listing(p_listing_id, v_new_bid_id);
    END IF;

    RETURN v_new_bid_id;
END;
$$;
ALTER FUNCTION wallet.service_place_bid(BIGINT, UUID, BIGINT, UUID) OWNER TO service_role;
REVOKE ALL ON FUNCTION wallet.service_place_bid(BIGINT, UUID, BIGINT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wallet.service_place_bid(BIGINT, UUID, BIGINT, UUID) TO service_role;

-- ============================================================================
-- service_buy_now
-- ============================================================================

CREATE OR REPLACE FUNCTION wallet.service_buy_now(
    p_listing_id      BIGINT,
    p_buyer_account   UUID,
    p_idempotency_key UUID
)
RETURNS BIGINT  -- bid.id (the buyer's winning bid row)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_existing_bid     BIGINT;
    v_listing_row      wallet.listing%ROWTYPE;
    v_now              TIMESTAMPTZ := transaction_timestamp();
    v_escrow_ledger_id BIGINT;
    v_new_bid_id       BIGINT;
BEGIN
    IF p_listing_id IS NULL OR p_buyer_account IS NULL OR p_idempotency_key IS NULL THEN
        RAISE EXCEPTION 'listing_id, buyer_account, idempotency_key are required'
            USING ERRCODE = '22004';
    END IF;

    SELECT id INTO v_existing_bid
      FROM wallet.bid
     WHERE bidder_account = p_buyer_account
       AND idempotency_key = p_idempotency_key;
    IF v_existing_bid IS NOT NULL THEN
        RETURN v_existing_bid;
    END IF;

    SELECT * INTO v_listing_row
      FROM wallet.listing WHERE id = p_listing_id FOR UPDATE;

    IF v_listing_row.id IS NULL THEN
        RAISE EXCEPTION 'listing % not found', p_listing_id USING ERRCODE = '23503';
    END IF;
    IF v_listing_row.status <> 'active' THEN
        RAISE EXCEPTION 'listing % not active (status=%)',
            p_listing_id, v_listing_row.status USING ERRCODE = '22023';
    END IF;
    IF v_listing_row.expires_at <= v_now THEN
        RAISE EXCEPTION 'listing % has expired', p_listing_id USING ERRCODE = '22023';
    END IF;
    IF v_listing_row.seller_account = p_buyer_account THEN
        RAISE EXCEPTION 'seller cannot buy own listing' USING ERRCODE = '42501';
    END IF;
    IF v_listing_row.buy_now_price IS NULL THEN
        RAISE EXCEPTION 'listing % is auction-only', p_listing_id USING ERRCODE = '22023';
    END IF;

    -- Refund any existing active bid; the buy-now buyer wins immediately.
    PERFORM wallet.refund_active_bid(p_listing_id, 'outbid', 'outbid by buy-now');

    v_escrow_ledger_id := wallet.service_debit(
        p_buyer_account,
        'khash'::wallet.currency_kind,
        v_listing_row.buy_now_price,
        'market_buy'::wallet.source_kind,
        'marketplace buy-now',
        'listing',
        p_listing_id,
        extensions.gen_random_uuid()
    );

    INSERT INTO wallet.bid (
        listing_id, bidder_account, amount, escrow_ledger_id, idempotency_key
    ) VALUES (
        p_listing_id, p_buyer_account, v_listing_row.buy_now_price,
        v_escrow_ledger_id, p_idempotency_key
    ) RETURNING id INTO v_new_bid_id;

    -- Settle immediately. service_settle_listing will UPDATE the
    -- listing → 'sold' and clear the live-bid pointers (we don't need
    -- to set them since we're settling in the same transaction).
    UPDATE wallet.listing
       SET current_bid = v_listing_row.buy_now_price,
           current_bid_account = p_buyer_account,
           current_bid_id = v_new_bid_id
     WHERE id = p_listing_id;

    INSERT INTO wallet.audit_log (action, target_type, target_id, metadata)
    VALUES (
        'marketplace.buy_now', 'bid', v_new_bid_id::TEXT,
        jsonb_build_object(
            'listing_id', p_listing_id,
            'buyer_account', p_buyer_account,
            'amount', v_listing_row.buy_now_price,
            'escrow_ledger_id', v_escrow_ledger_id
        )
    );

    PERFORM wallet.service_settle_listing(p_listing_id, v_new_bid_id);

    RETURN v_new_bid_id;
END;
$$;
ALTER FUNCTION wallet.service_buy_now(BIGINT, UUID, UUID) OWNER TO service_role;
REVOKE ALL ON FUNCTION wallet.service_buy_now(BIGINT, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wallet.service_buy_now(BIGINT, UUID, UUID) TO service_role;

-- ============================================================================
-- service_cancel_listing
--
-- Seller-driven cancel. Refunds any active bid back to its bidder
-- (status='refunded'), marks the listing 'cancelled'. The auth.uid
-- check happens in the Phase 3 public proxy; here we just enforce
-- that the supplied seller_account actually owns the listing so an
-- mis-routed service call cannot cancel arbitrary listings.
-- ============================================================================

CREATE OR REPLACE FUNCTION wallet.service_cancel_listing(
    p_listing_id      BIGINT,
    p_seller_account  UUID,
    p_reason          TEXT,
    p_idempotency_key UUID  -- accepted for symmetry; not yet used for replay
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_listing_row wallet.listing%ROWTYPE;
    v_now         TIMESTAMPTZ := transaction_timestamp();
    v_refund_id   BIGINT;
BEGIN
    IF p_listing_id IS NULL OR p_seller_account IS NULL THEN
        RAISE EXCEPTION 'listing_id, seller_account are required' USING ERRCODE = '22004';
    END IF;

    SELECT * INTO v_listing_row
      FROM wallet.listing WHERE id = p_listing_id FOR UPDATE;

    IF v_listing_row.id IS NULL THEN
        RAISE EXCEPTION 'listing % not found', p_listing_id USING ERRCODE = '23503';
    END IF;
    IF v_listing_row.seller_account <> p_seller_account THEN
        RAISE EXCEPTION 'seller_account does not own listing %', p_listing_id
            USING ERRCODE = '42501';
    END IF;
    IF v_listing_row.status <> 'active' THEN
        -- Idempotent: re-cancel of a cancelled listing is a no-op.
        IF v_listing_row.status = 'cancelled' THEN
            RETURN;
        END IF;
        RAISE EXCEPTION 'listing % not active (status=%)',
            p_listing_id, v_listing_row.status USING ERRCODE = '22023';
    END IF;
    -- Reject cancel once the deadline has passed. Even if cron has
    -- not swept yet, the seller cannot undo an auction settlement by
    -- racing the expire-sweep.
    IF v_listing_row.expires_at <= v_now THEN
        RAISE EXCEPTION 'listing % has expired and cannot be cancelled', p_listing_id
            USING ERRCODE = '22023';
    END IF;

    v_refund_id := wallet.refund_active_bid(
        p_listing_id, 'refunded', COALESCE(p_reason, 'seller cancelled listing')
    );

    UPDATE wallet.listing
       SET status = 'cancelled',
           settled_at = v_now,
           current_bid = NULL,
           current_bid_account = NULL,
           current_bid_id = NULL
     WHERE id = p_listing_id;

    INSERT INTO wallet.audit_log (action, target_type, target_id, metadata, reason)
    VALUES (
        'marketplace.listing_cancel', 'listing', p_listing_id::TEXT,
        jsonb_build_object(
            'seller_account', p_seller_account,
            'refunded_bid_id', v_refund_id
        ),
        p_reason
    );
END;
$$;
ALTER FUNCTION wallet.service_cancel_listing(BIGINT, UUID, TEXT, UUID) OWNER TO service_role;
REVOKE ALL ON FUNCTION wallet.service_cancel_listing(BIGINT, UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wallet.service_cancel_listing(BIGINT, UUID, TEXT, UUID) TO service_role;

-- ============================================================================
-- service_expire_listings — pg_cron-driven sweep
--
-- Walks active listings whose deadline has passed and either settles
-- the winning bid (if any) or marks the listing 'expired' (no bids).
-- One summary audit row per non-empty sweep. Returns the number of
-- listings touched.
--
-- Uses FOR UPDATE SKIP LOCKED so multiple cron runs can share work
-- safely. Bounded to 100 listings per call to keep the transaction
-- small; the cron schedule runs every 15min so backlog clears quickly.
-- ============================================================================

CREATE OR REPLACE FUNCTION wallet.service_expire_listings()
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_now             TIMESTAMPTZ := transaction_timestamp();
    v_listing_id      BIGINT;
    v_current_bid_id  BIGINT;
    v_total           BIGINT := 0;
    v_settled         BIGINT := 0;
    v_expired         BIGINT := 0;
BEGIN
    -- Transaction-scoped advisory lock. Overlapping cron runs become a
    -- no-op for the loser instead of racing on row locks + emitting
    -- a redundant audit row. SKIP LOCKED below would also be safe, but
    -- the advisory lock keeps audit traffic clean.
    IF NOT pg_try_advisory_xact_lock(
        hashtextextended('wallet.service_expire_listings', 0)
    ) THEN
        RETURN 0;
    END IF;

    FOR v_listing_id, v_current_bid_id IN
        SELECT id, current_bid_id
          FROM wallet.listing
         WHERE status = 'active' AND expires_at <= v_now
         ORDER BY expires_at, id
         LIMIT 100
         FOR UPDATE SKIP LOCKED
    LOOP
        IF v_current_bid_id IS NOT NULL THEN
            -- Settle deterministically against the listing's pointer
            -- rather than relying on settle to look the active bid up.
            PERFORM wallet.service_settle_listing(v_listing_id, v_current_bid_id);
            v_settled := v_settled + 1;
        ELSE
            UPDATE wallet.listing
               SET status = 'expired',
                   settled_at = v_now,
                   current_bid = NULL,
                   current_bid_account = NULL,
                   current_bid_id = NULL
             WHERE id = v_listing_id;
            v_expired := v_expired + 1;
        END IF;
        v_total := v_total + 1;
    END LOOP;

    IF v_total > 0 THEN
        INSERT INTO wallet.audit_log (action, target_type, target_id, metadata)
        VALUES (
            'marketplace.expire_sweep', 'listing', 'batch',
            jsonb_build_object(
                'total', v_total,
                'settled', v_settled,
                'expired', v_expired,
                'cutoff_at', v_now,
                'swept_at', v_now
            )
        );
    END IF;

    RETURN v_total;
END;
$$;
ALTER FUNCTION wallet.service_expire_listings() OWNER TO service_role;
REVOKE ALL ON FUNCTION wallet.service_expire_listings() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wallet.service_expire_listings() TO service_role;
-- pg_cron runs jobs as the scheduling role (postgres). Document the
-- exec contract with an explicit grant.
GRANT EXECUTE ON FUNCTION wallet.service_expire_listings() TO postgres;

COMMENT ON FUNCTION wallet.service_expire_listings() IS
    'Sweeps active listings whose expires_at has passed. Settles winning bid if any, otherwise marks expired. Bounded to 100 rows/call. Writes one summary audit row per non-empty sweep.';

-- pg_cron schedule — guarded by extension presence so local dev passes.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule(jobid)
          FROM cron.job WHERE jobname = 'marketplace-expire-listings';
        PERFORM cron.schedule(
            'marketplace-expire-listings',
            '*/15 * * * *',
            $cron$SELECT wallet.service_expire_listings();$cron$
        );
    ELSE
        RAISE NOTICE 'pg_cron not installed; skipping marketplace-expire-listings schedule registration';
    END IF;
END;
$$;

-- migrate:down

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule(jobid)
          FROM cron.job WHERE jobname = 'marketplace-expire-listings';
    END IF;
END;
$$;

DROP FUNCTION IF EXISTS wallet.service_expire_listings();
DROP FUNCTION IF EXISTS wallet.service_cancel_listing(BIGINT, UUID, TEXT, UUID);
DROP FUNCTION IF EXISTS wallet.service_buy_now(BIGINT, UUID, UUID);
DROP FUNCTION IF EXISTS wallet.service_place_bid(BIGINT, UUID, BIGINT, UUID);
DROP FUNCTION IF EXISTS wallet.service_settle_listing(BIGINT, BIGINT);
DROP FUNCTION IF EXISTS wallet.distribute_settlement(BIGINT, UUID, BIGINT);
DROP FUNCTION IF EXISTS wallet.refund_active_bid(BIGINT, wallet.bid_status, TEXT);
DROP FUNCTION IF EXISTS wallet.service_create_listing(UUID, JSONB, wallet.currency_kind, BIGINT, BIGINT, TIMESTAMPTZ, UUID);
DROP FUNCTION IF EXISTS wallet.treasury_account_id();
