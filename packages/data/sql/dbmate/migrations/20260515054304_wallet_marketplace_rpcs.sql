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
--     service_debit(buyer, khash, buy_now_price, 'market_buy')   -- buyer pays first
--     refund the current active bid (if any) — service_credit('market_buy')
--     insert winning bid + flip listing pointers
--     service_settle_listing(...) — credits seller (price - fee) + treasury (fee)
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
--   listing — (seller_account, idempotency_key) unique, looked up
--             on replay; same key from same seller → same listing_id.
--   bid     — (bidder_account, listing_id, idempotency_key) unique
--             (this order matches the actual index column order),
--             looked up scoped by listing so the same key reused on
--             a different listing creates a new bid.
--   ledger writes inside an RPC use deterministic uuid_v5 keys
--             derived from (uuid_ns_url(), descriptive name) so
--             retries collide cleanly at the wallet.ledger unique.
--
-- Deployment note:
--   This migration widens wallet.bid's bidder idempotency unique. Once
--   any client reuses a key across different listings, the migration
--   down-path (which would narrow it back) WILL fail. Treat as
--   forward-only after the first production run.

-- ============================================================================
-- Required Phase 1 invariants
--
-- This migration depends on the schema shipped in PR #10976. Specifically:
--   wallet_listing_seller_idempotency_uq          (seller_account, idempotency_key)
--   wallet_listing_active_item_instance_uq        partial: instance_id WHERE active
--   wallet_bid_bidder_idempotency_uq              REPLACED below with
--                                                 (bidder_account, listing_id, idempotency_key)
--   wallet_bid_listing_active_uq                  partial: listing_id WHERE active
--   wallet_account_treasury_label_uq              partial: label WHERE kind='treasury'
--   listing_current_bid_state_chk + listing_current_bid_id_fk → wallet.bid(id)
--   listing_active_bid_fields_chk                  non-active rows clear current_bid*
-- ============================================================================

-- ============================================================================
-- Enum preflight
--
-- The marketplace RPCs hardcode several enum labels (bid_status,
-- listing_status, source_kind, currency_kind). Fail the migration
-- early if any label is missing rather than discovering it at runtime.
-- ============================================================================
DO $$
DECLARE
    v_missing TEXT;
BEGIN
    FOR v_missing IN
        SELECT label FROM (VALUES
            ('wallet.bid_status:active'),
            ('wallet.bid_status:outbid'),
            ('wallet.bid_status:won'),
            ('wallet.bid_status:refunded'),
            ('wallet.listing_status:active'),
            ('wallet.listing_status:sold'),
            ('wallet.listing_status:cancelled'),
            ('wallet.listing_status:expired'),
            ('wallet.currency_kind:khash'),
            ('wallet.source_kind:market_buy'),
            ('wallet.source_kind:market_sell'),
            ('wallet.source_kind:market_fee')
        ) AS req(label)
         WHERE NOT EXISTS (
             SELECT 1 FROM pg_type t
               JOIN pg_namespace n ON n.oid = t.typnamespace
               JOIN pg_enum e ON e.enumtypid = t.oid
              WHERE n.nspname = split_part(split_part(req.label, ':', 1), '.', 1)
                AND t.typname = split_part(split_part(req.label, ':', 1), '.', 2)
                AND e.enumlabel = split_part(req.label, ':', 2)
         )
    LOOP
        RAISE EXCEPTION 'enum preflight: missing required label %', v_missing;
    END LOOP;
END;
$$;

-- ============================================================================
-- Widen the bid idempotency unique to include listing_id.
--
-- Phase 1 shipped (bidder_account, idempotency_key) globally unique. That
-- conflicts with the Phase 2 service_place_bid / service_buy_now replay
-- semantics, which look up by (bidder, listing, key) and want clients
-- to be able to reuse a key across different listings safely.
--
-- Preflight: refuse to widen if existing rows would violate the new
-- shape. The old narrower constraint should already prevent this, but
-- a dirty INSERT bypassing the index (none should exist) would surface
-- here rather than at index creation time.
-- ============================================================================

DO $$
DECLARE
    v_dupes BIGINT;
BEGIN
    SELECT COUNT(*) INTO v_dupes FROM (
        SELECT 1 FROM wallet.bid
         GROUP BY bidder_account, listing_id, idempotency_key
        HAVING COUNT(*) > 1
    ) d;
    IF v_dupes > 0 THEN
        RAISE EXCEPTION 'widen bid idempotency: % duplicate (bidder, listing, key) groups exist; resolve before applying',
            v_dupes USING ERRCODE = '23505';
    END IF;
END;
$$;

-- The old index lives in wallet schema (PG places indexes in the same
-- schema as their table). Schema-qualified DROP is unambiguous; we
-- intentionally do not run an unqualified fallback because that would
-- depend on search_path and could surprise callers.
DROP INDEX IF EXISTS wallet.wallet_bid_bidder_idempotency_uq;

-- New index is created in wallet schema because the target table is
-- wallet.bid (PG indexes inherit their schema from the table).
CREATE UNIQUE INDEX IF NOT EXISTS wallet_bid_bidder_listing_idempotency_uq
    ON wallet.bid (bidder_account, listing_id, idempotency_key);

DO $$
BEGIN
    IF to_regclass('wallet.wallet_bid_bidder_listing_idempotency_uq') IS NULL THEN
        RAISE EXCEPTION 'expected wallet.wallet_bid_bidder_listing_idempotency_uq but it is missing from wallet schema';
    END IF;
END;
$$;

-- ============================================================================
-- Marketplace domain errors (custom SQLSTATEs)
--
-- Phase 3+ clients can map these to typed errors without parsing
-- message strings. We use class P1xxx — P-class is PostgreSQL's
-- user-defined SQLSTATE namespace, kept distinct from built-in classes.
--
--   P1001 — listing_not_found
--   P1002 — listing_not_active
--   P1003 — listing_expired
--   P1004 — bid_too_low
--   P1005 — own_listing_forbidden
--   P1006 — bid_exceeds_buy_now_price (use service_buy_now instead)
--   P1007 — auction_only / buy_now_only mismatch
--   P1008 — settlement_drift (winning_bid_id != listing.current_bid_id)
--   P1009 — account_not_user (actor is not kind='user')
-- ============================================================================

-- Fee rate is 1% on the gross amount. Kept as a single helper so the
-- rate can move without hunting for magic /100 expressions. PL/pgSQL
-- so we can RAISE on negative inputs — clamp-to-zero would hide
-- misuse in a financial helper.
CREATE OR REPLACE FUNCTION wallet.marketplace_fee(p_amount BIGINT)
RETURNS BIGINT
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$
BEGIN
    IF p_amount IS NULL OR p_amount < 0 THEN
        RAISE EXCEPTION 'marketplace_fee requires non-negative amount, got %', p_amount
            USING ERRCODE = '22023';
    END IF;
    RETURN p_amount / 100;
END;
$$;
REVOKE ALL ON FUNCTION wallet.marketplace_fee(BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wallet.marketplace_fee(BIGINT) TO service_role;
ALTER FUNCTION wallet.marketplace_fee(BIGINT) OWNER TO service_role;
COMMENT ON FUNCTION wallet.marketplace_fee(BIGINT) IS
    'Returns the treasury fee for a settled marketplace amount. Currently 1% (floor). Change here to move the rate.';

-- ============================================================================
-- HELPER: treasury account lookup
--
-- STABLE only because the row never moves; Postgres may avoid repeated
-- execution within a single statement, but this is not a session cache.
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
-- HELPER: assert_user_account
--
-- Marketplace actors must be wallet.account kind='user'. Treasury,
-- system, escrow, and guild accounts cannot create listings or place
-- bids — that path is reserved for service-internal flows.
-- ============================================================================

CREATE OR REPLACE FUNCTION wallet.assert_user_account(p_account UUID)
RETURNS VOID
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM wallet.account
         WHERE id = p_account AND kind = 'user'
    ) THEN
        RAISE EXCEPTION 'account % is not a user account', p_account
            USING ERRCODE = 'P1009';
    END IF;
END;
$$;
REVOKE ALL ON FUNCTION wallet.assert_user_account(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wallet.assert_user_account(UUID) TO service_role;
ALTER FUNCTION wallet.assert_user_account(UUID) OWNER TO service_role;
COMMENT ON FUNCTION wallet.assert_user_account(UUID) IS
    'INTERNAL marketplace helper. Raises P1009 if the supplied account is not kind=user.';

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

    PERFORM wallet.assert_user_account(p_seller_account);

    -- Service-layer validation. Table CHECKs are belt-and-suspenders;
    -- raising at the RPC layer surfaces clean domain errors before the
    -- INSERT roundtrip.
    IF v_currency <> 'khash'::wallet.currency_kind THEN
        RAISE EXCEPTION 'marketplace v1 only supports khash' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(p_item_ref) <> 'object' OR p_item_ref = '{}'::jsonb THEN
        RAISE EXCEPTION 'item_ref must be a non-empty JSON object' USING ERRCODE = '22023';
    END IF;
    -- Required item_ref shape: kind + id. Phase 1 schema also stores
    -- item_ref->>'instance_id' as a generated column for the active-
    -- listing uniqueness index; that's expected, not required.
    IF NOT (
        p_item_ref ? 'kind'
        AND p_item_ref ? 'id'
        AND jsonb_typeof(p_item_ref->'kind') = 'string'
        AND jsonb_typeof(p_item_ref->'id')   IN ('string', 'number')
    ) THEN
        RAISE EXCEPTION 'item_ref requires string kind and string|number id' USING ERRCODE = '22023';
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
COMMENT ON FUNCTION wallet.service_create_listing(UUID, JSONB, wallet.currency_kind, BIGINT, BIGINT, TIMESTAMPTZ, UUID) IS
    'SERVICE marketplace RPC. Creates a listing for kind=user seller. Idempotent on (seller_account, idempotency_key). Validates currency=khash, item_ref shape, price invariants, future expires_at.';

-- ============================================================================
-- INTERNAL HELPER: refund the current active bid (if any)
--
-- Self-locks the listing row via SELECT ... FOR UPDATE so direct
-- service_role callers get the same isolation as the top-level RPCs.
-- Inner callers that already hold the listing lock pay zero extra cost
-- (re-locking inside the same transaction is a no-op).
--
-- Credits the prior bidder their bid amount via service_credit,
-- transitions the bid to 'outbid' (place_bid path) or 'refunded'
-- (cancel/expire path), and writes a marketplace audit row.
--
-- Returns the prior bid id, or NULL if the listing had no active bid.
-- Raises P1001 if the listing itself doesn't exist; raises P1008 if
-- the listing's current_bid pointer disagrees with the active bid row
-- (drift).
-- ============================================================================

CREATE OR REPLACE FUNCTION wallet.refund_active_bid(
    p_listing_id BIGINT,
    p_next_status wallet.bid_status,  -- 'outbid' | 'refunded'
    p_reason     TEXT
)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_bid_id              BIGINT;
    v_bidder              UUID;
    v_amount              BIGINT;
    v_refund_ledger_id    BIGINT;
    v_audit_action        TEXT;
    v_listing_has_pointer BOOLEAN;
    v_now                 TIMESTAMPTZ := transaction_timestamp();
BEGIN
    IF p_next_status NOT IN ('outbid', 'refunded') THEN
        RAISE EXCEPTION 'refund_active_bid requires outbid or refunded'
            USING ERRCODE = '22023';
    END IF;

    -- Self-lock the listing row so direct service_role callers get the
    -- same isolation that the top-level RPCs already have. Re-locking
    -- inside an enclosing transaction is a no-op.
    SELECT current_bid_id IS NOT NULL
      INTO v_listing_has_pointer
      FROM wallet.listing WHERE id = p_listing_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'listing % not found', p_listing_id USING ERRCODE = 'P1001';
    END IF;
    IF NOT v_listing_has_pointer THEN
        RETURN NULL;
    END IF;

    SELECT b.id, b.bidder_account, b.amount
      INTO v_bid_id, v_bidder, v_amount
      FROM wallet.listing l
      JOIN wallet.bid b ON b.id = l.current_bid_id
     WHERE l.id = p_listing_id
       AND b.status = 'active'
       AND b.amount = l.current_bid
       AND b.bidder_account = l.current_bid_account
     FOR UPDATE OF b;

    IF v_bid_id IS NULL THEN
        RAISE EXCEPTION 'listing % current_bid pointer disagrees with active bid; settlement drift',
            p_listing_id USING ERRCODE = 'P1008';
    END IF;

    v_refund_ledger_id := wallet.service_credit(
        v_bidder,
        'khash'::wallet.currency_kind,
        v_amount,
        'market_buy'::wallet.source_kind,
        p_reason,
        'bid',
        v_bid_id,
        extensions.uuid_generate_v5(
            extensions.uuid_ns_url(),
            'marketplace.bid.refund:' || v_bid_id::TEXT
        )
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
-- Note: PG does NOT grant function EXECUTE implicitly to the owner;
-- explicit service_role grant is required so the top-level RPCs
-- (which run as service_role via SECURITY DEFINER) can chain in.
-- Narrowing further (e.g., a dedicated wallet_internal role) is
-- tracked as a follow-up — the current posture is service_role-only
-- + self-locking helpers + audit trail.
COMMENT ON FUNCTION wallet.refund_active_bid(BIGINT, wallet.bid_status, TEXT) IS
    'INTERNAL marketplace helper. service_role-callable; self-locks the listing. Do not wrap from public proxies.';

-- ============================================================================
-- INTERNAL HELPER: distribute funds on settlement
--
-- Credits seller (price - fee) and treasury (fee). Returns (fee, net).
-- Caller must already hold the FOR UPDATE lock on the listing.
-- ============================================================================

-- Defensive: earlier draft returned only (fee, net). Drop so CREATE OR
-- REPLACE doesn't error on changed RETURNS TABLE shape.
DROP FUNCTION IF EXISTS wallet.distribute_settlement(BIGINT, UUID, BIGINT);

CREATE OR REPLACE FUNCTION wallet.distribute_settlement(
    p_listing_id BIGINT,
    p_seller     UUID,
    p_amount     BIGINT
)
RETURNS TABLE (
    fee              BIGINT,
    net              BIGINT,
    seller_ledger_id BIGINT,
    fee_ledger_id    BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_fee              BIGINT;
    v_net              BIGINT;
    v_treasury         UUID;
    v_seller_ledger_id BIGINT;
    v_fee_ledger_id    BIGINT := NULL;
BEGIN
    -- Defensive: callers already guard this, but distribute_settlement is
    -- service_role-callable directly. Block bad inputs at the boundary.
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'settlement amount must be positive' USING ERRCODE = '22023';
    END IF;
    IF p_seller IS NULL THEN
        RAISE EXCEPTION 'p_seller is required' USING ERRCODE = '22004';
    END IF;
    PERFORM wallet.assert_user_account(p_seller);

    v_fee := wallet.marketplace_fee(p_amount);
    v_net := p_amount - v_fee;
    v_treasury := wallet.treasury_account_id();

    -- Deterministic ledger idempotency keys for internal writes —
    -- listing+bid+action identifies the operation uniquely. Replay/debug
    -- correlation is easier than gen_random_uuid().
    v_seller_ledger_id := wallet.service_credit(
        p_seller,
        'khash'::wallet.currency_kind,
        v_net,
        'market_sell'::wallet.source_kind,
        'marketplace settlement (seller)',
        'listing',
        p_listing_id,
        extensions.uuid_generate_v5(
            extensions.uuid_ns_url(),
            'marketplace.settlement.seller:' || p_listing_id::TEXT
        )
    );

    IF v_fee > 0 THEN
        v_fee_ledger_id := wallet.service_credit(
            v_treasury,
            'khash'::wallet.currency_kind,
            v_fee,
            'market_fee'::wallet.source_kind,
            'marketplace fee (1%)',
            'listing',
            p_listing_id,
            extensions.uuid_generate_v5(
                extensions.uuid_ns_url(),
                'marketplace.settlement.fee:' || p_listing_id::TEXT
            )
        );
    END IF;

    fee := v_fee;
    net := v_net;
    seller_ledger_id := v_seller_ledger_id;
    fee_ledger_id := v_fee_ledger_id;
    RETURN NEXT;
END;
$$;
ALTER FUNCTION wallet.distribute_settlement(BIGINT, UUID, BIGINT) OWNER TO service_role;
REVOKE ALL ON FUNCTION wallet.distribute_settlement(BIGINT, UUID, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wallet.distribute_settlement(BIGINT, UUID, BIGINT) TO service_role;
COMMENT ON FUNCTION wallet.distribute_settlement(BIGINT, UUID, BIGINT) IS
    'INTERNAL marketplace helper. service_role-callable. Splits a settled amount into (net, fee) via two service_credit calls. Reached via service_settle_listing owner-chain. Narrower role posture (wallet_internal-only) tracked as a follow-up.';

-- ============================================================================
-- service_settle_listing
--
-- Marks the winning bid 'won', distributes funds, marks listing 'sold'
-- with buyer_account = winning_bid.bidder. Caller MUST hold FOR UPDATE
-- on the listing row already. p_winning_bid_id allows the caller to
-- assert the expected bid; pass NULL to look up the active bid.
-- ============================================================================

-- Defensive: earlier draft shipped as 2-arg (no reason).
DROP FUNCTION IF EXISTS wallet.service_settle_listing(BIGINT, BIGINT);

CREATE OR REPLACE FUNCTION wallet.service_settle_listing(
    p_listing_id     BIGINT,
    p_winning_bid_id BIGINT,        -- NULL = look up via listing.current_bid_id
    p_reason         TEXT DEFAULT NULL  -- 'bid_reached_buy_now' | 'buy_now' | 'expired_with_bid'
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_listing_row      wallet.listing%ROWTYPE;
    v_seller           UUID;
    v_bid_id           BIGINT;
    v_bidder           UUID;
    v_amount           BIGINT;
    v_now              TIMESTAMPTZ := transaction_timestamp();
    v_fee              BIGINT;
    v_net              BIGINT;
    v_seller_ledger_id BIGINT;
    v_fee_ledger_id    BIGINT;
BEGIN
    -- All ledger writes (bid 'won', seller credit, treasury credit) and
    -- the listing status flip occur in one DB transaction. Any
    -- exception rolls back escrow, refunds, settlement credits, status
    -- changes, and audit rows together.

    -- Self-locking: external callers may invoke this directly. Inner
    -- callers (service_place_bid, service_buy_now, service_expire_listings)
    -- have already taken FOR UPDATE on the listing — re-locking is a
    -- no-op within the same transaction.
    SELECT * INTO v_listing_row
      FROM wallet.listing WHERE id = p_listing_id FOR UPDATE;
    IF v_listing_row.id IS NULL THEN
        RAISE EXCEPTION 'listing % not found', p_listing_id USING ERRCODE = 'P1001';
    END IF;
    IF v_listing_row.currency <> 'khash'::wallet.currency_kind THEN
        RAISE EXCEPTION 'listing % currency % is not khash; v1 unsupported',
            p_listing_id, v_listing_row.currency USING ERRCODE = '22023';
    END IF;
    IF v_listing_row.status <> 'active' THEN
        RAISE EXCEPTION 'listing % not active (status=%); cannot settle',
            p_listing_id, v_listing_row.status USING ERRCODE = 'P1002';
    END IF;
    IF EXISTS (
        SELECT 1 FROM wallet.bid
         WHERE listing_id = p_listing_id AND status = 'won'
    ) THEN
        RAISE EXCEPTION 'listing % already has a winning bid', p_listing_id
            USING ERRCODE = 'P1002';
    END IF;
    v_seller := v_listing_row.seller_account;

    IF v_listing_row.current_bid_id IS NULL THEN
        RAISE EXCEPTION 'no active bid to settle for listing %', p_listing_id
            USING ERRCODE = '23503';
    END IF;
    IF p_winning_bid_id IS NOT NULL
       AND p_winning_bid_id <> v_listing_row.current_bid_id THEN
        RAISE EXCEPTION 'winning bid % is not current bid % for listing %',
            p_winning_bid_id, v_listing_row.current_bid_id, p_listing_id
            USING ERRCODE = 'P1008';
    END IF;

    SELECT id, bidder_account, amount
      INTO v_bid_id, v_bidder, v_amount
      FROM wallet.bid
     WHERE id = v_listing_row.current_bid_id
       AND listing_id = p_listing_id
       AND status = 'active'
     FOR UPDATE;

    IF v_bid_id IS NULL THEN
        RAISE EXCEPTION 'no active bid to settle for listing %', p_listing_id
            USING ERRCODE = '23503';
    END IF;

    -- Conditional update: status must still be 'active' to flip. If
    -- a concurrent path already won the bid, surface the conflict
    -- instead of silently overwriting. Use a separate variable so a
    -- NULL RETURNING doesn't wipe the original bid id from the error
    -- message.
    DECLARE
        v_updated_bid_id BIGINT;
    BEGIN
        UPDATE wallet.bid
           SET status = 'won',
               settled_at = v_now
         WHERE id = v_bid_id AND status = 'active'
         RETURNING id INTO v_updated_bid_id;
        IF v_updated_bid_id IS NULL THEN
            RAISE EXCEPTION 'bid % no longer active; concurrent settle suspected', v_bid_id
                USING ERRCODE = 'P1002';
        END IF;
    END;

    SELECT d.fee, d.net, d.seller_ledger_id, d.fee_ledger_id
      INTO v_fee, v_net, v_seller_ledger_id, v_fee_ledger_id
      FROM wallet.distribute_settlement(p_listing_id, v_seller, v_amount) d;

    UPDATE wallet.listing
       SET status = 'sold',
           settled_at = v_now,
           buyer_account = v_bidder,
           current_bid = NULL,
           current_bid_account = NULL,
           current_bid_id = NULL
     WHERE id = p_listing_id;

    INSERT INTO wallet.audit_log (action, target_type, target_id, metadata, reason)
    VALUES (
        'marketplace.listing_settle', 'listing', p_listing_id::TEXT,
        jsonb_build_object(
            'winning_bid_id', v_bid_id,
            'buyer_account', v_bidder,
            'amount', v_amount,
            'fee', v_fee,
            'seller_net', v_net,
            'seller_ledger_id', v_seller_ledger_id,
            'fee_ledger_id', v_fee_ledger_id,
            'settlement_reason', COALESCE(p_reason, 'unspecified'),
            'settled_at', v_now
        ),
        p_reason
    );
END;
$$;
ALTER FUNCTION wallet.service_settle_listing(BIGINT, BIGINT, TEXT) OWNER TO service_role;
REVOKE ALL ON FUNCTION wallet.service_settle_listing(BIGINT, BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wallet.service_settle_listing(BIGINT, BIGINT, TEXT) TO service_role;
COMMENT ON FUNCTION wallet.service_settle_listing(BIGINT, BIGINT, TEXT) IS
    'INTERNAL marketplace helper. service_role-callable. Invoked by place_bid (buy-now short-circuit), buy_now, and expire_listings via SECURITY DEFINER owner chain. Self-locks the listing row. Validates: listing status=active, currency=khash, no existing won bid, p_winning_bid_id matches listing.current_bid_id, winning bid status=active. Settlement reason recorded in audit metadata. Narrower role posture tracked as a follow-up.';

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

    PERFORM wallet.assert_user_account(p_bidder_account);

    -- Replay lookup scoped by listing too: the same bidder reusing the
    -- same idempotency_key across different listings would otherwise
    -- return an unrelated old bid id.
    SELECT id INTO v_existing_bid
      FROM wallet.bid
     WHERE bidder_account = p_bidder_account
       AND idempotency_key = p_idempotency_key
       AND listing_id = p_listing_id;
    IF v_existing_bid IS NOT NULL THEN
        RETURN v_existing_bid;
    END IF;

    -- Lock the listing for the lifetime of this transaction.
    SELECT * INTO v_listing_row
      FROM wallet.listing WHERE id = p_listing_id FOR UPDATE;

    IF v_listing_row.id IS NULL THEN
        RAISE EXCEPTION 'listing % not found', p_listing_id USING ERRCODE = 'P1001';
    END IF;
    IF v_listing_row.currency <> 'khash'::wallet.currency_kind THEN
        RAISE EXCEPTION 'listing % currency % is not khash; v1 unsupported',
            p_listing_id, v_listing_row.currency USING ERRCODE = '22023';
    END IF;
    IF v_listing_row.status <> 'active' THEN
        RAISE EXCEPTION 'listing % not active (status=%)',
            p_listing_id, v_listing_row.status USING ERRCODE = 'P1002';
    END IF;
    IF v_listing_row.expires_at <= v_now THEN
        RAISE EXCEPTION 'listing % has expired', p_listing_id USING ERRCODE = 'P1003';
    END IF;
    IF v_listing_row.seller_account = p_bidder_account THEN
        RAISE EXCEPTION 'seller cannot bid on own listing' USING ERRCODE = 'P1005';
    END IF;
    IF v_listing_row.min_bid IS NULL THEN
        RAISE EXCEPTION 'listing % is buy-now only', p_listing_id USING ERRCODE = 'P1007';
    END IF;
    IF p_amount < v_listing_row.min_bid THEN
        RAISE EXCEPTION 'amount % below min_bid %', p_amount, v_listing_row.min_bid
            USING ERRCODE = 'P1004';
    END IF;
    IF v_listing_row.current_bid IS NOT NULL AND p_amount <= v_listing_row.current_bid THEN
        RAISE EXCEPTION 'amount % must exceed current_bid %',
            p_amount, v_listing_row.current_bid USING ERRCODE = 'P1004';
    END IF;
    -- Reject bids above buy_now_price; the buyer should use buy_now
    -- instead so they don't overpay. Equality is allowed so this RPC
    -- can still short-circuit to settle below.
    IF v_listing_row.buy_now_price IS NOT NULL
       AND p_amount > v_listing_row.buy_now_price THEN
        RAISE EXCEPTION 'amount % exceeds buy_now_price %; use buy_now instead',
            p_amount, v_listing_row.buy_now_price USING ERRCODE = 'P1006';
    END IF;

    -- Escrow the bidder's funds. Deterministic key derived from the
    -- caller-supplied idempotency_key so a retry of the outer RPC
    -- without first reaching the bid-row replay shortcut still
    -- collides cleanly at the ledger layer.
    v_escrow_ledger_id := wallet.service_debit(
        p_bidder_account,
        'khash'::wallet.currency_kind,
        p_amount,
        'market_buy'::wallet.source_kind,
        'marketplace bid escrow',
        'listing',
        p_listing_id,
        extensions.uuid_generate_v5(
            extensions.uuid_ns_url(),
            'marketplace.bid.escrow:' ||
            p_listing_id::TEXT || ':' ||
            p_bidder_account::TEXT || ':' ||
            p_idempotency_key::TEXT
        )
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
        PERFORM wallet.service_settle_listing(
            p_listing_id, v_new_bid_id, 'bid_reached_buy_now'
        );
    END IF;

    RETURN v_new_bid_id;
END;
$$;
ALTER FUNCTION wallet.service_place_bid(BIGINT, UUID, BIGINT, UUID) OWNER TO service_role;
REVOKE ALL ON FUNCTION wallet.service_place_bid(BIGINT, UUID, BIGINT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wallet.service_place_bid(BIGINT, UUID, BIGINT, UUID) TO service_role;
COMMENT ON FUNCTION wallet.service_place_bid(BIGINT, UUID, BIGINT, UUID) IS
    'SERVICE marketplace RPC. Places a bid on behalf of kind=user bidder. Idempotent on (bidder_account, listing_id, idempotency_key). Escrows bidder funds, refunds prior active bid, short-circuits to settle when amount = buy_now_price.';

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

    PERFORM wallet.assert_user_account(p_buyer_account);

    -- Replay lookup scoped by listing too.
    SELECT id INTO v_existing_bid
      FROM wallet.bid
     WHERE bidder_account = p_buyer_account
       AND idempotency_key = p_idempotency_key
       AND listing_id = p_listing_id;
    IF v_existing_bid IS NOT NULL THEN
        RETURN v_existing_bid;
    END IF;

    SELECT * INTO v_listing_row
      FROM wallet.listing WHERE id = p_listing_id FOR UPDATE;

    IF v_listing_row.id IS NULL THEN
        RAISE EXCEPTION 'listing % not found', p_listing_id USING ERRCODE = 'P1001';
    END IF;
    IF v_listing_row.currency <> 'khash'::wallet.currency_kind THEN
        RAISE EXCEPTION 'listing % currency % is not khash; v1 unsupported',
            p_listing_id, v_listing_row.currency USING ERRCODE = '22023';
    END IF;
    IF v_listing_row.status <> 'active' THEN
        RAISE EXCEPTION 'listing % not active (status=%)',
            p_listing_id, v_listing_row.status USING ERRCODE = 'P1002';
    END IF;
    IF v_listing_row.expires_at <= v_now THEN
        RAISE EXCEPTION 'listing % has expired', p_listing_id USING ERRCODE = 'P1003';
    END IF;
    IF v_listing_row.seller_account = p_buyer_account THEN
        RAISE EXCEPTION 'seller cannot buy own listing' USING ERRCODE = 'P1005';
    END IF;
    IF v_listing_row.buy_now_price IS NULL THEN
        RAISE EXCEPTION 'listing % is auction-only', p_listing_id USING ERRCODE = 'P1007';
    END IF;

    -- Debit buyer FIRST, then refund the prior active bid. Reordering
    -- (was refund→debit) keeps the audit trail "buyer paid, prior
    -- bidder refunded" in causal order and surfaces a debit failure
    -- before we touch the prior bidder's balance.
    v_escrow_ledger_id := wallet.service_debit(
        p_buyer_account,
        'khash'::wallet.currency_kind,
        v_listing_row.buy_now_price,
        'market_buy'::wallet.source_kind,
        'marketplace buy-now',
        'listing',
        p_listing_id,
        extensions.uuid_generate_v5(
            extensions.uuid_ns_url(),
            'marketplace.buy_now.escrow:' ||
            p_listing_id::TEXT || ':' ||
            p_buyer_account::TEXT || ':' ||
            p_idempotency_key::TEXT
        )
    );

    PERFORM wallet.refund_active_bid(p_listing_id, 'outbid', 'outbid by buy-now');

    INSERT INTO wallet.bid (
        listing_id, bidder_account, amount, escrow_ledger_id, idempotency_key
    ) VALUES (
        p_listing_id, p_buyer_account, v_listing_row.buy_now_price,
        v_escrow_ledger_id, p_idempotency_key
    ) RETURNING id INTO v_new_bid_id;

    -- Set the listing's live-bid pointers so service_settle_listing's
    -- p_winning_bid_id assertion lines up with current_bid_id.
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

    PERFORM wallet.service_settle_listing(p_listing_id, v_new_bid_id, 'buy_now');

    RETURN v_new_bid_id;
END;
$$;
ALTER FUNCTION wallet.service_buy_now(BIGINT, UUID, UUID) OWNER TO service_role;
REVOKE ALL ON FUNCTION wallet.service_buy_now(BIGINT, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wallet.service_buy_now(BIGINT, UUID, UUID) TO service_role;
COMMENT ON FUNCTION wallet.service_buy_now(BIGINT, UUID, UUID) IS
    'SERVICE marketplace RPC. Buy-now purchase for kind=user buyer. Idempotent on (buyer_account, idempotency_key, listing_id). Debits buyer first, then refunds the prior active bid, then settles. Settlement reason = "buy_now".';

-- ============================================================================
-- service_cancel_listing
--
-- Seller-driven cancel. Refunds any active bid back to its bidder
-- (status='refunded'), marks the listing 'cancelled'. The auth.uid
-- check happens in the Phase 3 public proxy; here we just enforce
-- that the supplied seller_account actually owns the listing so an
-- mis-routed service call cannot cancel arbitrary listings.
-- ============================================================================

-- Defensive: earlier draft shipped with a p_idempotency_key UUID arg.
DROP FUNCTION IF EXISTS wallet.service_cancel_listing(BIGINT, UUID, TEXT, UUID);

CREATE OR REPLACE FUNCTION wallet.service_cancel_listing(
    p_listing_id      BIGINT,
    p_seller_account  UUID,
    p_reason          TEXT
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

    PERFORM wallet.assert_user_account(p_seller_account);

    SELECT * INTO v_listing_row
      FROM wallet.listing WHERE id = p_listing_id FOR UPDATE;

    IF v_listing_row.id IS NULL THEN
        RAISE EXCEPTION 'listing % not found', p_listing_id USING ERRCODE = 'P1001';
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
            p_listing_id, v_listing_row.status USING ERRCODE = 'P1002';
    END IF;
    IF v_listing_row.expires_at <= v_now THEN
        RAISE EXCEPTION 'listing % has expired and cannot be cancelled', p_listing_id
            USING ERRCODE = 'P1003';
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
        COALESCE(p_reason, 'seller cancelled listing')
    );
END;
$$;
ALTER FUNCTION wallet.service_cancel_listing(BIGINT, UUID, TEXT) OWNER TO service_role;
REVOKE ALL ON FUNCTION wallet.service_cancel_listing(BIGINT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wallet.service_cancel_listing(BIGINT, UUID, TEXT) TO service_role;
COMMENT ON FUNCTION wallet.service_cancel_listing(BIGINT, UUID, TEXT) IS
    'SERVICE marketplace RPC. Seller-driven cancel for an active listing. Refunds the active bid (if any) and flips status to cancelled. Idempotent on already-cancelled. Rejects after expires_at to prevent racing the expire-sweep.';

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

-- Defensive: earlier drafts shipped without p_limit and with
-- RETURNS BIGINT. Drop both so the new RETURNS TABLE shape can land
-- cleanly on a dirty DB.
DROP FUNCTION IF EXISTS wallet.service_expire_listings();
DROP FUNCTION IF EXISTS wallet.service_expire_listings(INTEGER);

CREATE OR REPLACE FUNCTION wallet.service_expire_listings(
    p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (total BIGINT, settled BIGINT, expired BIGINT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_now             TIMESTAMPTZ := transaction_timestamp();
    v_listing_id      BIGINT;
    v_current_bid_id  BIGINT;
    v_total           BIGINT := 0;
    v_settled         BIGINT := 0;
    v_expired         BIGINT := 0;
    v_limit           INTEGER := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 1000);
BEGIN
    -- Cron-job hygiene: time out fast instead of stalling under a
    -- pathological lock. Both settings are transaction-local.
    PERFORM set_config('lock_timeout', '2s', true);
    PERFORM set_config('statement_timeout', '30s', true);

    -- Transaction-scoped advisory lock SERIALIZES sweep workers — the
    -- loser returns a (0, 0, 0) row immediately. SKIP LOCKED below is
    -- therefore redundant against parallel cron runs (the advisory
    -- lock has already excluded them) but it still protects against
    -- contention from any non-cron caller of service_settle_listing
    -- holding a listing lock.
    IF NOT pg_try_advisory_xact_lock(
        hashtextextended('wallet.service_expire_listings', 0)
    ) THEN
        total := 0; settled := 0; expired := 0;
        RETURN NEXT;
        RETURN;
    END IF;

    FOR v_listing_id, v_current_bid_id IN
        SELECT id, current_bid_id
          FROM wallet.listing
         WHERE status = 'active'
           AND currency = 'khash'::wallet.currency_kind  -- v1: skip foreign currency
           AND expires_at <= v_now
         ORDER BY expires_at, id
         LIMIT v_limit
         FOR UPDATE SKIP LOCKED
    LOOP
        IF v_current_bid_id IS NOT NULL THEN
            -- Settle deterministically against the listing's pointer
            -- rather than relying on settle to look the active bid up.
            PERFORM wallet.service_settle_listing(
                v_listing_id, v_current_bid_id, 'expired_with_bid'
            );
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

    total := v_total;
    settled := v_settled;
    expired := v_expired;
    RETURN NEXT;
END;
$$;
ALTER FUNCTION wallet.service_expire_listings(INTEGER) OWNER TO service_role;
REVOKE ALL ON FUNCTION wallet.service_expire_listings(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wallet.service_expire_listings(INTEGER) TO service_role;
-- pg_cron runs jobs as the scheduling role (postgres). Document the
-- exec contract with an explicit grant.
GRANT EXECUTE ON FUNCTION wallet.service_expire_listings(INTEGER) TO postgres;

COMMENT ON FUNCTION wallet.service_expire_listings(INTEGER) IS
    'SERVICE marketplace RPC. Sweeps active listings whose expires_at has passed. Settles winning bid if any (settlement_reason=expired_with_bid), otherwise marks expired. Bounded to p_limit rows (default 100, clamped [1, 1000]). Returns (total, settled, expired) row. Writes one summary audit row per non-empty sweep. pg_try_advisory_xact_lock makes overlapping cron runs no-op for the loser. lock_timeout=2s + statement_timeout=30s applied transaction-locally.';

-- pg_cron schedule — guarded by extension presence so local dev passes.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule(jobid)
          FROM cron.job WHERE jobname = 'marketplace-expire-listings';
        PERFORM cron.schedule(
            'marketplace-expire-listings',
            '*/15 * * * *',
            $cron$SELECT * FROM wallet.service_expire_listings(100);$cron$
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

DROP FUNCTION IF EXISTS wallet.service_expire_listings(INTEGER);
DROP FUNCTION IF EXISTS wallet.service_cancel_listing(BIGINT, UUID, TEXT);
DROP FUNCTION IF EXISTS wallet.service_buy_now(BIGINT, UUID, UUID);
DROP FUNCTION IF EXISTS wallet.service_place_bid(BIGINT, UUID, BIGINT, UUID);
DROP FUNCTION IF EXISTS wallet.service_settle_listing(BIGINT, BIGINT, TEXT);
DROP FUNCTION IF EXISTS wallet.distribute_settlement(BIGINT, UUID, BIGINT);
DROP FUNCTION IF EXISTS wallet.refund_active_bid(BIGINT, wallet.bid_status, TEXT);
DROP FUNCTION IF EXISTS wallet.service_create_listing(UUID, JSONB, wallet.currency_kind, BIGINT, BIGINT, TIMESTAMPTZ, UUID);
DROP FUNCTION IF EXISTS wallet.assert_user_account(UUID);
DROP FUNCTION IF EXISTS wallet.treasury_account_id();
DROP FUNCTION IF EXISTS wallet.marketplace_fee(BIGINT);

-- Restore the Phase 1 shape of the bid idempotency unique. Rollback
-- intentionally narrows; pre-existing rows may violate the narrower
-- unique, in which case rollback fails — that's the right signal that
-- the DB is past the point of free reversal.
DROP INDEX IF EXISTS wallet.wallet_bid_bidder_listing_idempotency_uq;
CREATE UNIQUE INDEX IF NOT EXISTS wallet_bid_bidder_idempotency_uq
    ON wallet.bid (bidder_account, idempotency_key);

DO $$
BEGIN
    IF to_regclass('wallet.wallet_bid_bidder_idempotency_uq') IS NULL THEN
        RAISE EXCEPTION 'rollback expected wallet.wallet_bid_bidder_idempotency_uq but it is missing from wallet schema';
    END IF;
END;
$$;
