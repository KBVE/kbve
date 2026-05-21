-- migrate:up

DO $$
BEGIN
    IF to_regprocedure('inventory.service_listing_settle(uuid, uuid, bigint, uuid)') IS NULL THEN
        RAISE EXCEPTION 'missing inventory.service_listing_settle(uuid, uuid, bigint, uuid) — apply 6.0 foundation first';
    END IF;
    IF to_regprocedure('inventory.service_listing_unlock(uuid, uuid, bigint, text)') IS NULL THEN
        RAISE EXCEPTION 'missing inventory.service_listing_unlock(uuid, uuid, bigint, text) — apply 6.0 foundation first';
    END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS wallet_bid_one_won_per_listing_uq
    ON wallet.bid (listing_id)
    WHERE status = 'won';

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
            USING ERRCODE = 'P1009';
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
            USING ERRCODE = 'P1009';
    END IF;

    IF v_bidder = v_seller THEN
        RAISE EXCEPTION 'seller cannot settle listing % to self', p_listing_id
            USING ERRCODE = 'P1013';
    END IF;
    PERFORM wallet.assert_user_account(v_bidder);
    IF v_listing_row.current_bid IS DISTINCT FROM v_amount
       OR v_listing_row.current_bid_account IS DISTINCT FROM v_bidder THEN
        RAISE EXCEPTION 'listing % current bid cache mismatch (cache=%/%, bid=%/%)',
            p_listing_id,
            v_listing_row.current_bid, v_listing_row.current_bid_account,
            v_amount, v_bidder
            USING ERRCODE = 'P1002';
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

    IF v_listing_row.item_id IS NOT NULL THEN
        v_buyer_item_id := inventory.service_listing_settle(
            v_seller, v_listing_row.item_id, p_listing_id, v_bidder
        );
    END IF;

    DECLARE
        v_updated_listing_id BIGINT;
    BEGIN
        UPDATE wallet.listing
           SET status = 'sold',
               settled_at = v_now,
               buyer_account = v_bidder,
               current_bid = NULL,
               current_bid_account = NULL,
               current_bid_id = NULL
         WHERE id = p_listing_id
           AND status = 'active'
        RETURNING id INTO v_updated_listing_id;
        IF v_updated_listing_id IS NULL THEN
            RAISE EXCEPTION 'listing % no longer active at final settle update', p_listing_id
                USING ERRCODE = 'P1002';
        END IF;
    END;

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

ALTER FUNCTION wallet.service_settle_listing(BIGINT, BIGINT, TEXT) OWNER TO service_role;
REVOKE ALL ON FUNCTION wallet.service_settle_listing(BIGINT, BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION wallet.service_settle_listing(BIGINT, BIGINT, TEXT) TO service_role;
COMMENT ON FUNCTION wallet.service_settle_listing(BIGINT, BIGINT, TEXT) IS
    'INTERNAL marketplace helper. Invoked by place_bid, buy_now, and expire_listings. Self-locks the listing row. Validates listing status=active+currency=khash+no won bid+matching current_bid_id, flips winning bid to won, distributes funds, calls inventory.service_listing_settle to transfer the escrowed item to the buyer (Phase 6.1a; only when listing.item_id IS NOT NULL), then flips listing to sold under a status-guarded update.';

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
            IF v_listing_row.item_id IS NOT NULL THEN
                DECLARE
                    v_item_state inventory.item_state;
                    v_item_owner UUID;
                BEGIN
                    SELECT state, owner_account
                      INTO v_item_state, v_item_owner
                      FROM inventory.item
                     WHERE id = v_listing_row.item_id;
                    IF v_item_state = 'listing_escrow' THEN
                        PERFORM inventory.service_listing_unlock(
                            p_seller_account, v_listing_row.item_id, p_listing_id,
                            COALESCE(p_reason, 'listing_cancelled_repair')
                        );
                    ELSIF v_item_state = 'held' AND v_item_owner = p_seller_account THEN
                        NULL;
                    ELSE
                        RAISE EXCEPTION
                            'cancel repair refused: item % in unsafe state (state=%, owner=%)',
                            v_listing_row.item_id, v_item_state, v_item_owner
                            USING ERRCODE = 'P1002';
                    END IF;
                END;
            END IF;
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

    IF v_listing_row.item_id IS NOT NULL THEN
        PERFORM inventory.service_listing_unlock(
            p_seller_account, v_listing_row.item_id, p_listing_id,
            COALESCE(p_reason, 'listing_cancelled')
        );
    END IF;

    DECLARE
        v_updated_listing_id BIGINT;
    BEGIN
        UPDATE wallet.listing
           SET status = 'cancelled',
               settled_at = v_now,
               buyer_account = NULL,
               current_bid = NULL,
               current_bid_account = NULL,
               current_bid_id = NULL
         WHERE id = p_listing_id
           AND status = 'active'
        RETURNING id INTO v_updated_listing_id;
        IF v_updated_listing_id IS NULL THEN
            RAISE EXCEPTION 'listing % no longer active at final cancel update', p_listing_id
                USING ERRCODE = 'P1002';
        END IF;
    END;

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

ALTER FUNCTION wallet.service_cancel_listing(BIGINT, UUID, TEXT) OWNER TO service_role;
REVOKE ALL ON FUNCTION wallet.service_cancel_listing(BIGINT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION wallet.service_cancel_listing(BIGINT, UUID, TEXT) TO service_role;
COMMENT ON FUNCTION wallet.service_cancel_listing(BIGINT, UUID, TEXT) IS
    'SERVICE marketplace RPC. Seller-driven cancel. Refunds the active bid (if any) and flips status to cancelled. Idempotent on already-cancelled — re-cancel attempts an inventory unlock repair when item_id IS NOT NULL. Repair branch inspects the item state explicitly: listing_escrow triggers a real unlock, held+owned-by-seller is a no-op, anything else raises P1002. No blind error-swallowing. Phase 6.1a: calls inventory.service_listing_unlock when listing.item_id IS NOT NULL.';

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
            IF v_item_id IS NOT NULL THEN
                PERFORM inventory.service_listing_unlock(
                    v_seller, v_item_id, v_listing_id, 'listing_expired_no_bids'
                );
            END IF;

            DECLARE
                v_updated_listing_id BIGINT;
            BEGIN
                UPDATE wallet.listing
                   SET status = 'expired',
                       settled_at = v_now,
                       buyer_account = NULL,
                       current_bid = NULL,
                       current_bid_account = NULL,
                       current_bid_id = NULL
                 WHERE id = v_listing_id
                   AND status = 'active'
                RETURNING id INTO v_updated_listing_id;
                IF v_updated_listing_id IS NULL THEN
                    RAISE EXCEPTION 'listing % no longer active at expire update', v_listing_id
                        USING ERRCODE = 'P1002';
                END IF;
            END;

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
GRANT  EXECUTE ON FUNCTION wallet.service_expire_listings(INTEGER) TO service_role;
COMMENT ON FUNCTION wallet.service_expire_listings(INTEGER) IS
    'SERVICE marketplace RPC. pg_cron-driven sweep of active KHASH listings past expires_at. Bid-bearing rows settle through service_settle_listing (inventory hand-off included). No-bid rows flip to expired and (Phase 6.1a) call inventory.service_listing_unlock to release the item back to the seller. Bounded to p_limit (default 100, clamped [1, 1000]) — p_limit caps TRANSACTION SIZE not just perf, because each settled listing touches bids + ledger + balance + inventory.item + audit_log.';

NOTIFY pgrst, 'reload schema';

-- migrate:down
DO $$
BEGIN
    IF current_setting('app.allow_marketplace_unsafe_down', true)
       IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION
            'refusing destructive marketplace rollback: set app.allow_marketplace_unsafe_down=on to proceed';
    END IF;
END
$$;

DROP INDEX IF EXISTS wallet.wallet_bid_one_won_per_listing_uq;

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
    DECLARE
        v_updated_listing_id BIGINT;
    BEGIN
        UPDATE wallet.listing
           SET status = 'sold', settled_at = v_now, buyer_account = v_bidder,
               current_bid = NULL, current_bid_account = NULL, current_bid_id = NULL
         WHERE id = p_listing_id
           AND status = 'active'
        RETURNING id INTO v_updated_listing_id;
        IF v_updated_listing_id IS NULL THEN
            RAISE EXCEPTION 'listing % no longer active at rollback settle update', p_listing_id
                USING ERRCODE = 'P1002';
        END IF;
    END;
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
ALTER FUNCTION wallet.service_settle_listing(BIGINT, BIGINT, TEXT) OWNER TO service_role;
REVOKE ALL ON FUNCTION wallet.service_settle_listing(BIGINT, BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION wallet.service_settle_listing(BIGINT, BIGINT, TEXT) TO service_role;

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
    DECLARE
        v_updated_listing_id BIGINT;
    BEGIN
        UPDATE wallet.listing
           SET status = 'cancelled', settled_at = v_now,
               buyer_account = NULL,
               current_bid = NULL, current_bid_account = NULL, current_bid_id = NULL
         WHERE id = p_listing_id
           AND status = 'active'
        RETURNING id INTO v_updated_listing_id;
        IF v_updated_listing_id IS NULL THEN
            RAISE EXCEPTION 'listing % no longer active at rollback cancel update', p_listing_id
                USING ERRCODE = 'P1002';
        END IF;
    END;
    INSERT INTO wallet.audit_log (action, target_type, target_id, metadata, reason)
    VALUES ('marketplace.listing_cancel', 'listing', p_listing_id::TEXT,
        jsonb_build_object('seller_account', p_seller_account, 'refunded_bid_id', v_refund_id),
        COALESCE(p_reason, 'seller cancelled listing'));
END;
$$;
ALTER FUNCTION wallet.service_cancel_listing(BIGINT, UUID, TEXT) OWNER TO service_role;
REVOKE ALL ON FUNCTION wallet.service_cancel_listing(BIGINT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION wallet.service_cancel_listing(BIGINT, UUID, TEXT) TO service_role;

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
            DECLARE
                v_updated_listing_id BIGINT;
            BEGIN
                UPDATE wallet.listing
                   SET status = 'expired', settled_at = v_now,
                       buyer_account = NULL,
                       current_bid = NULL, current_bid_account = NULL, current_bid_id = NULL
                 WHERE id = v_listing_id
                   AND status = 'active'
                RETURNING id INTO v_updated_listing_id;
                IF v_updated_listing_id IS NULL THEN
                    RAISE EXCEPTION 'listing % no longer active at rollback expire update', v_listing_id
                        USING ERRCODE = 'P1002';
                END IF;
            END;
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
ALTER FUNCTION wallet.service_expire_listings(INTEGER) OWNER TO service_role;
REVOKE ALL ON FUNCTION wallet.service_expire_listings(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION wallet.service_expire_listings(INTEGER) TO service_role;

NOTIFY pgrst, 'reload schema';
