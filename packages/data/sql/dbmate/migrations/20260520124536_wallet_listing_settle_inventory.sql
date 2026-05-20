-- migrate:up
-- ============================================================================
-- WALLET LISTING ↔ INVENTORY SETTLE/CANCEL/EXPIRE HOOKS — Phase 6.1a
--
-- The foundation migration (20260520114243_wallet_inventory_listing_wire)
-- locks an inventory.item into listing_escrow when a listing is created
-- via service_create_listing_with_item, but the legacy
-- service_settle_listing / service_cancel_listing / service_expire_listings
-- functions never RELEASE the escrowed row. That leaves the item stuck
-- in listing_escrow forever after a sale, cancel, or expiry.
--
-- This migration rewrites those three functions (CREATE OR REPLACE,
-- same signatures) and adds calls into inventory.service_listing_*
-- when wallet.listing.item_id IS NOT NULL:
--
--   * settle (auction-won / buy-now / expire-with-bid):
--       wallet.service_settle_listing → inventory.service_listing_settle
--       transfers the item to the winning bidder.
--   * cancel (seller-initiated):
--       wallet.service_cancel_listing → inventory.service_listing_unlock
--       returns the item to held.
--   * expire (no bids):
--       wallet.service_expire_listings → inventory.service_listing_unlock
--       returns the item to the seller.
--   * buy-now path inherits the settle hook (service_buy_now calls
--     service_settle_listing internally).
--
-- Legacy listings with item_id IS NULL skip the inventory hook entirely.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- wallet.service_settle_listing — settle + transfer item to buyer
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION wallet.service_settle_listing(
    p_listing_id     BIGINT,
    p_winning_bid_id BIGINT,
    p_reason         TEXT DEFAULT NULL
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
    v_buyer_item_id    UUID;
BEGIN
    SELECT * INTO v_listing_row
      FROM wallet.listing WHERE id = p_listing_id FOR UPDATE;
    IF v_listing_row.id IS NULL THEN
        RAISE EXCEPTION 'listing % not found', p_listing_id USING ERRCODE = 'P1001';
    END IF;
    IF v_listing_row.currency <> 'khash'::wallet.currency_kind THEN
        RAISE EXCEPTION 'listing % currency % is not khash; v1 unsupported',
            p_listing_id, v_listing_row.currency USING ERRCODE = 'P1010';
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
      FROM wallet.distribute_settlement(p_listing_id, v_seller, v_amount, v_bid_id) d;

    UPDATE wallet.listing
       SET status = 'sold',
           settled_at = v_now,
           buyer_account = v_bidder,
           current_bid = NULL,
           current_bid_account = NULL,
           current_bid_id = NULL
     WHERE id = p_listing_id;

    -- Phase 6.1a: hand the escrowed inventory row to the buyer.
    IF v_listing_row.item_id IS NOT NULL THEN
        v_buyer_item_id := inventory.service_listing_settle(
            v_seller, v_listing_row.item_id, p_listing_id, v_bidder
        );
    END IF;

    INSERT INTO wallet.audit_log (action, target_type, target_id, metadata, reason)
    VALUES (
        'marketplace.listing_settle', 'listing', p_listing_id::TEXT,
        jsonb_build_object(
            'winning_bid_id',     v_bid_id,
            'buyer_account',      v_bidder,
            'amount',             v_amount,
            'fee',                v_fee,
            'seller_net',         v_net,
            'seller_ledger_id',   v_seller_ledger_id,
            'fee_ledger_id',      v_fee_ledger_id,
            'settlement_reason',  COALESCE(p_reason, 'unspecified'),
            'inventory_item_id',  v_listing_row.item_id,
            'buyer_item_id',      v_buyer_item_id,
            'settled_at',         v_now
        ),
        p_reason
    );
END;
$$;

COMMENT ON FUNCTION wallet.service_settle_listing(BIGINT, BIGINT, TEXT) IS
    'INTERNAL marketplace helper. Invoked by place_bid, buy_now, and expire_listings. Self-locks the listing row. Validates listing status=active+currency=khash+no won bid+matching current_bid_id, flips winning bid to won, distributes funds, and (Phase 6.1a) calls inventory.service_listing_settle to transfer the escrowed item to the buyer when listing.item_id IS NOT NULL.';

-- ---------------------------------------------------------------------------
-- wallet.service_cancel_listing — refund + release item to seller
-- ---------------------------------------------------------------------------

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

    -- Phase 6.1a: release the escrowed inventory row back to seller.
    IF v_listing_row.item_id IS NOT NULL THEN
        PERFORM inventory.service_listing_unlock(
            p_seller_account, v_listing_row.item_id, p_listing_id,
            COALESCE(p_reason, 'listing_cancelled')
        );
    END IF;

    INSERT INTO wallet.audit_log (action, target_type, target_id, metadata, reason)
    VALUES (
        'marketplace.listing_cancel', 'listing', p_listing_id::TEXT,
        jsonb_build_object(
            'seller_account',    p_seller_account,
            'refunded_bid_id',   v_refund_id,
            'inventory_item_id', v_listing_row.item_id
        ),
        COALESCE(p_reason, 'seller cancelled listing')
    );
END;
$$;

COMMENT ON FUNCTION wallet.service_cancel_listing(BIGINT, UUID, TEXT) IS
    'SERVICE marketplace RPC. Seller-driven cancel. Refunds the active bid (if any) and flips status to cancelled. Idempotent on already-cancelled. Phase 6.1a: also calls inventory.service_listing_unlock when listing.item_id IS NOT NULL.';

-- ---------------------------------------------------------------------------
-- wallet.service_expire_listings — sweep + release items on no-bid expiry
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION wallet.service_expire_listings(
    p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (total BIGINT, settled BIGINT, expired BIGINT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_now             TIMESTAMPTZ := transaction_timestamp();
    v_listing_id      BIGINT;
    v_current_bid_id  BIGINT;
    v_seller          UUID;
    v_item_id         UUID;
    v_total           BIGINT := 0;
    v_settled         BIGINT := 0;
    v_expired         BIGINT := 0;
    v_limit           INTEGER := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 1000);
BEGIN
    PERFORM set_config('lock_timeout', '2s', true);
    PERFORM set_config('statement_timeout', '30s', true);

    IF NOT pg_try_advisory_xact_lock(
        hashtextextended('wallet.service_expire_listings', 0)
    ) THEN
        total := 0; settled := 0; expired := 0;
        RETURN NEXT;
        RETURN;
    END IF;

    -- Cursor now also pulls seller_account + item_id so the no-bid
    -- branch can call inventory.service_listing_unlock without a
    -- second lookup.
    FOR v_listing_id, v_current_bid_id, v_seller, v_item_id IN
        SELECT id, current_bid_id, seller_account, item_id
          FROM wallet.listing
         WHERE status = 'active'
           AND currency = 'khash'::wallet.currency_kind
           AND expires_at <= v_now
         ORDER BY expires_at, id
         LIMIT v_limit
         FOR UPDATE SKIP LOCKED
    LOOP
        IF v_current_bid_id IS NOT NULL THEN
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

            IF v_item_id IS NOT NULL THEN
                PERFORM inventory.service_listing_unlock(
                    v_seller, v_item_id, v_listing_id, 'listing_expired_no_bids'
                );
            END IF;

            v_expired := v_expired + 1;
        END IF;
        v_total := v_total + 1;
    END LOOP;

    DECLARE
        v_skipped_non_khash BIGINT;
    BEGIN
        SELECT COUNT(*) INTO v_skipped_non_khash
          FROM wallet.listing
         WHERE status = 'active'
           AND currency <> 'khash'::wallet.currency_kind
           AND expires_at <= v_now;

        IF v_skipped_non_khash > 0 THEN
            INSERT INTO wallet.audit_log (action, target_type, target_id, metadata)
            VALUES (
                'marketplace.expire_sweep_unsupported_currency',
                'listing', 'batch',
                jsonb_build_object(
                    'skipped_non_khash', v_skipped_non_khash,
                    'cutoff_at', v_now
                )
            );
        END IF;
    END;

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

COMMENT ON FUNCTION wallet.service_expire_listings(INTEGER) IS
    'SERVICE marketplace RPC. pg_cron-driven sweep of active KHASH listings past expires_at. Bid-bearing rows settle through service_settle_listing (inventory hand-off included). No-bid rows flip to expired and (Phase 6.1a) call inventory.service_listing_unlock to release the item back to the seller. Bounded to p_limit (default 100, clamped [1, 1000]).';

NOTIFY pgrst, 'reload schema';

-- migrate:down
-- ============================================================================
-- Revert the three functions to their pre-6.1a behaviour (no inventory
-- hooks). Inline so dbmate rollback leaves a working market layer even
-- if the foundation migration also rolls back.
-- ============================================================================

CREATE OR REPLACE FUNCTION wallet.service_settle_listing(
    p_listing_id     BIGINT,
    p_winning_bid_id BIGINT,
    p_reason         TEXT DEFAULT NULL
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
    SELECT * INTO v_listing_row
      FROM wallet.listing WHERE id = p_listing_id FOR UPDATE;
    IF v_listing_row.id IS NULL THEN
        RAISE EXCEPTION 'listing % not found', p_listing_id USING ERRCODE = 'P1001';
    END IF;
    IF v_listing_row.currency <> 'khash'::wallet.currency_kind THEN
        RAISE EXCEPTION 'listing % currency % is not khash; v1 unsupported',
            p_listing_id, v_listing_row.currency USING ERRCODE = 'P1010';
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
    DECLARE v_updated_bid_id BIGINT;
    BEGIN
        UPDATE wallet.bid SET status = 'won', settled_at = v_now
         WHERE id = v_bid_id AND status = 'active'
         RETURNING id INTO v_updated_bid_id;
        IF v_updated_bid_id IS NULL THEN
            RAISE EXCEPTION 'bid % no longer active; concurrent settle suspected', v_bid_id
                USING ERRCODE = 'P1002';
        END IF;
    END;
    SELECT d.fee, d.net, d.seller_ledger_id, d.fee_ledger_id
      INTO v_fee, v_net, v_seller_ledger_id, v_fee_ledger_id
      FROM wallet.distribute_settlement(p_listing_id, v_seller, v_amount, v_bid_id) d;
    UPDATE wallet.listing
       SET status = 'sold', settled_at = v_now, buyer_account = v_bidder,
           current_bid = NULL, current_bid_account = NULL, current_bid_id = NULL
     WHERE id = p_listing_id;
    INSERT INTO wallet.audit_log (action, target_type, target_id, metadata, reason)
    VALUES ('marketplace.listing_settle', 'listing', p_listing_id::TEXT,
        jsonb_build_object('winning_bid_id', v_bid_id, 'buyer_account', v_bidder,
            'amount', v_amount, 'fee', v_fee, 'seller_net', v_net,
            'seller_ledger_id', v_seller_ledger_id, 'fee_ledger_id', v_fee_ledger_id,
            'settlement_reason', COALESCE(p_reason, 'unspecified'),
            'settled_at', v_now),
        p_reason);
END;
$$;

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
    SELECT * INTO v_listing_row FROM wallet.listing WHERE id = p_listing_id FOR UPDATE;
    IF v_listing_row.id IS NULL THEN
        RAISE EXCEPTION 'listing % not found', p_listing_id USING ERRCODE = 'P1001';
    END IF;
    IF v_listing_row.seller_account <> p_seller_account THEN
        RAISE EXCEPTION 'seller_account does not own listing %', p_listing_id
            USING ERRCODE = '42501';
    END IF;
    IF v_listing_row.status <> 'active' THEN
        IF v_listing_row.status = 'cancelled' THEN RETURN; END IF;
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
       SET status = 'cancelled', settled_at = v_now,
           current_bid = NULL, current_bid_account = NULL, current_bid_id = NULL
     WHERE id = p_listing_id;
    INSERT INTO wallet.audit_log (action, target_type, target_id, metadata, reason)
    VALUES ('marketplace.listing_cancel', 'listing', p_listing_id::TEXT,
        jsonb_build_object('seller_account', p_seller_account, 'refunded_bid_id', v_refund_id),
        COALESCE(p_reason, 'seller cancelled listing'));
END;
$$;

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
    PERFORM set_config('lock_timeout', '2s', true);
    PERFORM set_config('statement_timeout', '30s', true);
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
         WHERE status = 'active' AND currency = 'khash'::wallet.currency_kind
           AND expires_at <= v_now
         ORDER BY expires_at, id LIMIT v_limit FOR UPDATE SKIP LOCKED
    LOOP
        IF v_current_bid_id IS NOT NULL THEN
            PERFORM wallet.service_settle_listing(
                v_listing_id, v_current_bid_id, 'expired_with_bid'
            );
            v_settled := v_settled + 1;
        ELSE
            UPDATE wallet.listing
               SET status = 'expired', settled_at = v_now,
                   current_bid = NULL, current_bid_account = NULL, current_bid_id = NULL
             WHERE id = v_listing_id;
            v_expired := v_expired + 1;
        END IF;
        v_total := v_total + 1;
    END LOOP;
    IF v_total > 0 THEN
        INSERT INTO wallet.audit_log (action, target_type, target_id, metadata)
        VALUES ('marketplace.expire_sweep', 'listing', 'batch',
            jsonb_build_object('total', v_total, 'settled', v_settled,
                'expired', v_expired, 'cutoff_at', v_now, 'swept_at', v_now));
    END IF;
    total := v_total; settled := v_settled; expired := v_expired;
    RETURN NEXT;
END;
$$;

NOTIFY pgrst, 'reload schema';
