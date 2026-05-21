-- migrate:up

DO $$
DECLARE
    v_label TEXT;
BEGIN
    FOR v_label IN
        SELECT req.label FROM (VALUES
            ('inventory.item_state:held'),
            ('inventory.item_state:listing_escrow'),
            ('wallet.listing_status:active'),
            ('wallet.listing_status:sold'),
            ('wallet.listing_status:cancelled'),
            ('wallet.listing_status:expired'),
            ('wallet.bid_status:active'),
            ('wallet.bid_status:won'),
            ('wallet.currency_kind:khash')
        ) AS req(label)
         WHERE NOT EXISTS (
            SELECT 1
              FROM pg_type t
              JOIN pg_namespace n ON n.oid = t.typnamespace
              JOIN pg_enum e ON e.enumtypid = t.oid
             WHERE n.nspname = split_part(split_part(req.label, ':', 1), '.', 1)
               AND t.typname = split_part(split_part(req.label, ':', 1), '.', 2)
               AND e.enumlabel = split_part(req.label, ':', 2)
         )
    LOOP
        RAISE EXCEPTION 'enum preflight: missing required label %', v_label;
    END LOOP;
END
$$;

DO $$
BEGIN
    IF to_regprocedure('inventory.service_listing_lock(uuid, uuid, bigint)') IS NULL THEN
        RAISE EXCEPTION 'missing inventory.service_listing_lock(uuid, uuid, bigint) — apply 6.0 foundation first';
    END IF;
    IF to_regprocedure('inventory.caller_jwt_aal()') IS NULL THEN
        RAISE EXCEPTION 'missing inventory.caller_jwt_aal() — apply 6.0 foundation first';
    END IF;
    IF to_regprocedure('inventory.is_2fa_required_for_listing(uuid)') IS NULL THEN
        RAISE EXCEPTION 'missing inventory.is_2fa_required_for_listing(uuid) — apply 6.0 foundation first';
    END IF;
    IF to_regprocedure('private.proxy_market_caller_account()') IS NULL THEN
        RAISE EXCEPTION 'missing private.proxy_market_caller_account() — wallet marketplace proxies migration must be applied first';
    END IF;
END
$$;

CREATE OR REPLACE FUNCTION inventory.service_split_for_listing(
    p_seller_account UUID,
    p_src_item_id    UUID,
    p_qty            BIGINT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_src    inventory.item%ROWTYPE;
    v_new_id UUID;
BEGIN
    IF p_seller_account IS NULL OR p_src_item_id IS NULL THEN
        RAISE EXCEPTION 'seller_account, src_item_id are required' USING ERRCODE = '22004';
    END IF;
    IF p_qty IS NULL OR p_qty <= 0 THEN
        RAISE EXCEPTION 'qty must be positive' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_src
      FROM inventory.item
     WHERE id = p_src_item_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'item % not found', p_src_item_id USING ERRCODE = 'INV10';
    END IF;
    IF v_src.owner_account <> p_seller_account THEN
        RAISE EXCEPTION 'item % not owned by seller', p_src_item_id USING ERRCODE = 'INV11';
    END IF;
    IF v_src.state <> 'held' THEN
        RAISE EXCEPTION 'item % not in held state (state=%)',
            p_src_item_id, v_src.state USING ERRCODE = 'INV12';
    END IF;
    IF NOT v_src.is_stackable THEN
        RAISE EXCEPTION 'item % is instanced; cannot split', p_src_item_id
            USING ERRCODE = 'INV15';
    END IF;
    IF v_src.qty <= p_qty THEN
        RAISE EXCEPTION 'split qty % must be strictly less than source qty %',
            p_qty, v_src.qty USING ERRCODE = 'INV13';
    END IF;

    DECLARE
        v_updated_src_id UUID;
    BEGIN
        UPDATE inventory.item
           SET qty = qty - p_qty, updated_at = now()
         WHERE id = p_src_item_id
           AND owner_account = p_seller_account
           AND state = 'held'
           AND is_stackable
           AND qty > p_qty
        RETURNING id INTO v_updated_src_id;
        IF v_updated_src_id IS NULL THEN
            RAISE EXCEPTION 'split source % invariant violated between lock and update', p_src_item_id
                USING ERRCODE = 'INV12';
        END IF;
    END;

    INSERT INTO inventory.item (
        owner_account, kind, ref, qty, nbt, state, source, source_ref
    ) VALUES (
        v_src.owner_account, v_src.kind, v_src.ref, p_qty,
        v_src.nbt, 'listing_escrow', v_src.source,
        jsonb_build_object(
            'split_from',        v_src.id::text,
            'parent_source_ref', v_src.source_ref
        )
    )
    RETURNING id INTO v_new_id;

    INSERT INTO inventory.transition (item_id, from_state, to_state, actor, reason, metadata)
    VALUES (v_new_id, 'transit_in', 'listing_escrow', 'wallet',
            'split_for_listing',
            jsonb_build_object(
                'split_from',     v_src.id::text,
                'seller_account', p_seller_account,
                'qty',            p_qty,
                'previous_src_qty', v_src.qty,
                'new_src_qty',    v_src.qty - p_qty
            ));

    RETURN v_new_id;
END;
$$;

ALTER FUNCTION inventory.service_split_for_listing(UUID, UUID, BIGINT) OWNER TO service_role;
REVOKE ALL ON FUNCTION inventory.service_split_for_listing(UUID, UUID, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION inventory.service_split_for_listing(UUID, UUID, BIGINT) TO service_role;
COMMENT ON FUNCTION inventory.service_split_for_listing(UUID, UUID, BIGINT) IS
    'Atomic split-for-listing helper. Splits a HELD stackable row, producing a new row directly in listing_escrow state (never held). Used by wallet.service_create_listing_with_item when a partial-stack listing is requested. Returns the new row id, which the caller must INSERT into wallet.listing.item_id. Refuses instanced rows and refuses whole-row splits (caller should service_listing_lock the source directly in that case).';

ALTER TABLE wallet.listing
    ADD COLUMN item_id UUID
        REFERENCES inventory.item(id) ON DELETE NO ACTION;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
          FROM wallet.listing l
          JOIN wallet.bid     b ON b.listing_id = l.id
         WHERE l.status = 'active'
           AND l.item_id IS NULL
           AND b.status = 'active'
    ) THEN
        RAISE EXCEPTION
            'legacy active listings with active bids exist; reconcile escrow manually before re-running 20260520114243';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM wallet.listing l
         WHERE l.status = 'active'
           AND l.item_id IS NULL
           AND l.current_bid_id IS NOT NULL
           AND NOT EXISTS (
               SELECT 1
                 FROM wallet.bid b
                WHERE b.id = l.current_bid_id
                  AND b.listing_id = l.id
                  AND b.status = 'active'
           )
    ) THEN
        RAISE EXCEPTION
            'legacy active listings with stale current_bid_id pointers exist; manual reconciliation required';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM wallet.listing l
          JOIN wallet.bid b
            ON b.id = l.current_bid_id
           AND b.listing_id = l.id
           AND b.status = 'active'
         WHERE l.status = 'active'
           AND l.item_id IS NULL
           AND (
                l.current_bid IS DISTINCT FROM b.amount
                OR l.current_bid_account IS DISTINCT FROM b.bidder_account
           )
    ) THEN
        RAISE EXCEPTION
            'legacy active listings with current_bid cache mismatch exist; manual reconciliation required';
    END IF;
END
$$;

WITH cancelled AS (
    UPDATE wallet.listing
       SET status              = 'cancelled',
           settled_at          = COALESCE(settled_at, now()),
           buyer_account       = NULL,
           current_bid         = NULL,
           current_bid_account = NULL,
           current_bid_id      = NULL
     WHERE status = 'active'
       AND item_id IS NULL
    RETURNING id, seller_account
)
INSERT INTO wallet.audit_log (action, target_type, target_id, metadata)
SELECT
    'marketplace.legacy_cleanup',
    'listing',
    id::TEXT,
    jsonb_build_object(
        'seller_account', seller_account,
        'migration',      '20260520114243_wallet_inventory_listing_wire',
        'reason',         'pre-inventory-ledger active listing cleared'
    )
FROM cancelled;

ALTER TABLE wallet.listing
    ADD CONSTRAINT wallet_listing_active_item_id_chk
        CHECK (status <> 'active' OR item_id IS NOT NULL);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
          FROM wallet.listing
         WHERE status = 'active'
           AND item_id IS NOT NULL
         GROUP BY item_id
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION
            'duplicate active item-backed listings exist; manual reconciliation required before creating wallet_listing_active_item_uq';
    END IF;
END
$$;

CREATE UNIQUE INDEX wallet_listing_active_item_uq
    ON wallet.listing (item_id)
    WHERE status = 'active' AND item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS wallet_listing_active_khash_expiry_idx
    ON wallet.listing (expires_at, id)
    WHERE status = 'active'
      AND currency = 'khash'::wallet.currency_kind;

COMMENT ON COLUMN wallet.listing.item_id IS
    'inventory.item.id of the listed row. NULL only allowed on legacy non-active listings; new active listings MUST reference an inventory.item. Active-listing uniqueness ensures one open listing per item.';

CREATE OR REPLACE FUNCTION wallet.service_create_listing_with_item(
    p_seller_account  UUID,
    p_src_item_id     UUID,
    p_qty             BIGINT,
    p_currency        wallet.currency_kind,
    p_buy_now_price   BIGINT,
    p_min_bid         BIGINT,
    p_expires_at      TIMESTAMPTZ,
    p_idempotency_key UUID
)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_src         inventory.item%ROWTYPE;
    v_currency    wallet.currency_kind := COALESCE(p_currency, 'khash'::wallet.currency_kind);
    v_now         TIMESTAMPTZ := transaction_timestamp();
    v_existing_id BIGINT;
    v_existing_item_id     UUID;
    v_existing_buy_now     BIGINT;
    v_existing_min_bid     BIGINT;
    v_existing_expires_at  TIMESTAMPTZ;
    v_existing_qty         BIGINT;
    v_listing_id  BIGINT;
    v_listing_qty BIGINT;
    v_listed_id   UUID;
    v_was_split   BOOLEAN := false;
    v_item_ref    JSONB;
BEGIN
    IF p_seller_account IS NULL OR p_src_item_id IS NULL OR p_idempotency_key IS NULL THEN
        RAISE EXCEPTION 'seller_account, src_item_id, idempotency_key are required'
            USING ERRCODE = '22004';
    END IF;

    PERFORM wallet.assert_user_account(p_seller_account);

    IF v_currency <> 'khash'::wallet.currency_kind THEN
        RAISE EXCEPTION 'marketplace v1 only supports khash' USING ERRCODE = 'P1010';
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
    IF p_expires_at > v_now + interval '30 days' THEN
        RAISE EXCEPTION 'expires_at exceeds 30-day maximum listing duration'
            USING ERRCODE = '22023';
    END IF;
    IF p_qty IS NOT NULL AND p_qty <= 0 THEN
        RAISE EXCEPTION 'qty must be positive' USING ERRCODE = '22023';
    END IF;

    SELECT l.id, l.item_id, l.buy_now_price, l.min_bid, l.expires_at,
           COALESCE((l.item_ref ->> 'qty')::BIGINT, 0)
      INTO v_existing_id, v_existing_item_id, v_existing_buy_now,
           v_existing_min_bid, v_existing_expires_at, v_existing_qty
      FROM wallet.listing l
     WHERE l.seller_account = p_seller_account
       AND l.idempotency_key = p_idempotency_key;
    IF v_existing_id IS NOT NULL THEN
        IF v_existing_buy_now    IS DISTINCT FROM p_buy_now_price
           OR v_existing_min_bid IS DISTINCT FROM p_min_bid
           OR v_existing_expires_at IS DISTINCT FROM p_expires_at THEN
            RAISE EXCEPTION 'idempotency_key % replay parameter mismatch on listing % (price/expiry differs)',
                p_idempotency_key, v_existing_id USING ERRCODE = 'P1012';
        END IF;
        IF p_qty IS NULL THEN
            IF v_existing_item_id IS DISTINCT FROM p_src_item_id THEN
                RAISE EXCEPTION 'idempotency_key % replay parameter mismatch on listing % (whole-row replay against split listing)',
                    p_idempotency_key, v_existing_id USING ERRCODE = 'P1012';
            END IF;
        ELSE
            IF v_existing_item_id IS DISTINCT FROM p_src_item_id
               AND NOT EXISTS (
                   SELECT 1 FROM inventory.item
                    WHERE id = v_existing_item_id
                      AND source_ref ->> 'split_from' = p_src_item_id::text
               ) THEN
                RAISE EXCEPTION 'idempotency_key % replay parameter mismatch on listing % (src_item_id differs)',
                    p_idempotency_key, v_existing_id USING ERRCODE = 'P1012';
            END IF;
            IF v_existing_qty IS DISTINCT FROM p_qty THEN
                RAISE EXCEPTION 'idempotency_key % replay parameter mismatch on listing % (qty differs)',
                    p_idempotency_key, v_existing_id USING ERRCODE = 'P1012';
            END IF;
        END IF;
        RETURN v_existing_id;
    END IF;

    SELECT * INTO v_src
      FROM inventory.item
     WHERE id = p_src_item_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'item % not found', p_src_item_id USING ERRCODE = 'INV10';
    END IF;
    IF v_src.owner_account <> p_seller_account THEN
        RAISE EXCEPTION 'item % not owned by seller', p_src_item_id USING ERRCODE = 'INV11';
    END IF;
    IF v_src.state <> 'held' THEN
        RAISE EXCEPTION 'item % not in held state (state=%)',
            p_src_item_id, v_src.state USING ERRCODE = 'INV12';
    END IF;

    IF p_qty IS NULL OR p_qty = v_src.qty THEN
        v_listing_qty := v_src.qty;
        v_listed_id   := v_src.id;
    ELSIF p_qty < v_src.qty THEN
        IF NOT v_src.is_stackable THEN
            RAISE EXCEPTION 'item % is instanced; partial listing not supported',
                p_src_item_id USING ERRCODE = 'INV15';
        END IF;
        v_listed_id := inventory.service_split_for_listing(
            p_seller_account, p_src_item_id, p_qty
        );
        v_listing_qty := p_qty;
        v_was_split := true;
    ELSE
        RAISE EXCEPTION 'qty % exceeds source qty %', p_qty, v_src.qty
            USING ERRCODE = 'INV13';
    END IF;

    v_item_ref := jsonb_build_object(
        'kind',        v_src.kind,
        'id',          v_src.ref,
        'qty',         v_listing_qty,
        'instance_id', v_listed_id::text,
        'nbt',         v_src.nbt
    );

    INSERT INTO wallet.listing (
        seller_account, item_id, item_ref, currency,
        buy_now_price, min_bid, expires_at, idempotency_key
    ) VALUES (
        p_seller_account, v_listed_id, v_item_ref, v_currency,
        p_buy_now_price, p_min_bid, p_expires_at, p_idempotency_key
    ) RETURNING id INTO v_listing_id;

    IF NOT v_was_split THEN
        PERFORM inventory.service_listing_lock(p_seller_account, v_listed_id, v_listing_id);
    ELSE
        UPDATE inventory.item
           SET source_ref = COALESCE(source_ref, '{}'::jsonb)
                            || jsonb_build_object(
                                   'listing_id',         v_listing_id,
                                   'listing_created_at', v_now
                               ),
               updated_at  = now()
         WHERE id = v_listed_id;
    END IF;

    INSERT INTO wallet.audit_log (action, target_type, target_id, metadata)
    VALUES (
        'marketplace.listing_create', 'listing', v_listing_id::TEXT,
        jsonb_build_object(
            'seller_account', p_seller_account,
            'src_item_id',    p_src_item_id,
            'item_id',        v_listed_id,
            'qty',            v_listing_qty,
            'was_split',      v_was_split,
            'buy_now_price',  p_buy_now_price,
            'min_bid',        p_min_bid,
            'expires_at',     p_expires_at
        )
    );

    RETURN v_listing_id;
END;
$$;

ALTER FUNCTION wallet.service_create_listing_with_item(UUID, UUID, BIGINT, wallet.currency_kind, BIGINT, BIGINT, TIMESTAMPTZ, UUID) OWNER TO service_role;
REVOKE ALL ON FUNCTION wallet.service_create_listing_with_item(UUID, UUID, BIGINT, wallet.currency_kind, BIGINT, BIGINT, TIMESTAMPTZ, UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION wallet.service_create_listing_with_item(UUID, UUID, BIGINT, wallet.currency_kind, BIGINT, BIGINT, TIMESTAMPTZ, UUID) TO service_role;
COMMENT ON FUNCTION wallet.service_create_listing_with_item(UUID, UUID, BIGINT, wallet.currency_kind, BIGINT, BIGINT, TIMESTAMPTZ, UUID) IS
    'SERVICE marketplace RPC. New authoritative listing creator. Takes (src_item_id, qty); qty NULL or = src.qty locks the whole row, qty < src.qty splits via inventory.service_split_for_listing. Successor to service_create_listing(UUID, JSONB, ...); legacy variant stays for axum/Astro back-compat until Phase 6.1c.';

CREATE OR REPLACE FUNCTION public.proxy_market_create_listing_with_item(
    p_src_item_id     UUID,
    p_qty             BIGINT,
    p_buy_now_price   BIGINT,
    p_min_bid         BIGINT,
    p_expires_at      TIMESTAMPTZ,
    p_idempotency_key UUID
)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_seller    UUID := private.proxy_market_caller_account();
    v_aal       TEXT := inventory.caller_jwt_aal();
    v_threshold BIGINT;
    v_max_price BIGINT;
BEGIN
    IF p_idempotency_key IS NULL THEN
        RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22004';
    END IF;
    IF p_src_item_id IS NULL THEN
        RAISE EXCEPTION 'src_item_id is required' USING ERRCODE = '22004';
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
    IF p_expires_at IS NULL OR p_expires_at <= statement_timestamp() THEN
        RAISE EXCEPTION 'expires_at must be in the future' USING ERRCODE = '22023';
    END IF;
    IF p_expires_at > statement_timestamp() + interval '30 days' THEN
        RAISE EXCEPTION 'expires_at exceeds 30-day maximum listing duration'
            USING ERRCODE = '22023';
    END IF;

    IF inventory.is_2fa_required_for_listing(v_seller)
       AND v_aal IS DISTINCT FROM 'aal2' THEN
        RAISE EXCEPTION 'mfa_required for listing' USING ERRCODE = 'INV30';
    END IF;

    SELECT high_value_khash_threshold INTO v_threshold
      FROM inventory.account_security
     WHERE account = v_seller;
    v_threshold := COALESCE(v_threshold, 0);

    IF v_threshold > 0 THEN
        v_max_price := GREATEST(
            COALESCE(p_buy_now_price, 0),
            COALESCE(p_min_bid, 0)
        );
        IF v_max_price >= v_threshold
           AND v_aal IS DISTINCT FROM 'aal2' THEN
            RAISE EXCEPTION 'mfa_required for high-value listing'
                USING ERRCODE = 'INV30';
        END IF;
    END IF;

    RETURN wallet.service_create_listing_with_item(
        v_seller, p_src_item_id, p_qty, 'khash'::wallet.currency_kind,
        p_buy_now_price, p_min_bid, p_expires_at, p_idempotency_key
    );
END;
$$;
ALTER FUNCTION public.proxy_market_create_listing_with_item(UUID, BIGINT, BIGINT, BIGINT, TIMESTAMPTZ, UUID) OWNER TO service_role;
REVOKE ALL ON FUNCTION public.proxy_market_create_listing_with_item(UUID, BIGINT, BIGINT, BIGINT, TIMESTAMPTZ, UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.proxy_market_create_listing_with_item(UUID, BIGINT, BIGINT, BIGINT, TIMESTAMPTZ, UUID) TO authenticated, service_role;
COMMENT ON FUNCTION public.proxy_market_create_listing_with_item(UUID, BIGINT, BIGINT, BIGINT, TIMESTAMPTZ, UUID) IS
    'PUBLIC marketplace proxy. Authenticated wrapper for wallet.service_create_listing_with_item. Enforces inventory.is_2fa_required_for_listing aal2 gate and the high_value_khash_threshold gate. p_qty NULL = list whole row; p_qty < src.qty = split-and-list.';

CREATE OR REPLACE FUNCTION public.proxy_market_create_listing(
    p_item_ref        JSONB,
    p_buy_now_price   BIGINT,
    p_min_bid         BIGINT,
    p_expires_at      TIMESTAMPTZ,
    p_idempotency_key UUID
)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION 'legacy listing RPC disabled; use proxy_market_create_listing_with_item'
        USING ERRCODE = 'P1011';
END;
$$;

ALTER FUNCTION public.proxy_market_create_listing(JSONB, BIGINT, BIGINT, TIMESTAMPTZ, UUID) OWNER TO service_role;
REVOKE ALL ON FUNCTION public.proxy_market_create_listing(JSONB, BIGINT, BIGINT, TIMESTAMPTZ, UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.proxy_market_create_listing(JSONB, BIGINT, BIGINT, TIMESTAMPTZ, UUID) TO authenticated, service_role;
COMMENT ON FUNCTION public.proxy_market_create_listing(JSONB, BIGINT, BIGINT, TIMESTAMPTZ, UUID) IS
    'DEPRECATED. Phase 6.1a stubbed this proxy to raise P1011 so axum/Astro see a clean migration error during the 6.1b cutover. Dropped entirely in Phase 6.1c.';

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

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM wallet.listing
         WHERE status = 'active' AND item_id IS NOT NULL
    ) THEN
        RAISE EXCEPTION
            'refusing to drop wallet.listing.item_id: % active item-backed listings still exist; cancel or settle them before rolling back',
            (SELECT count(*) FROM wallet.listing
              WHERE status = 'active' AND item_id IS NOT NULL);
    END IF;
END
$$;

DROP FUNCTION IF EXISTS public.proxy_market_create_listing_with_item(UUID, BIGINT, BIGINT, BIGINT, TIMESTAMPTZ, UUID);
DROP FUNCTION IF EXISTS wallet.service_create_listing_with_item(UUID, UUID, BIGINT, wallet.currency_kind, BIGINT, BIGINT, TIMESTAMPTZ, UUID);

DROP INDEX IF EXISTS wallet.wallet_listing_active_khash_expiry_idx;
DROP INDEX IF EXISTS wallet.wallet_listing_active_item_uq;
ALTER TABLE wallet.listing DROP CONSTRAINT IF EXISTS wallet_listing_active_item_id_chk;
ALTER TABLE wallet.listing DROP COLUMN IF EXISTS item_id;

DROP FUNCTION IF EXISTS inventory.service_split_for_listing(UUID, UUID, BIGINT);

DO $$
BEGIN
    IF current_setting('app.allow_legacy_marketplace_proxy_restore', true)
       IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION
            'refusing to restore legacy JSONB marketplace proxy: set app.allow_legacy_marketplace_proxy_restore=on to proceed (the P1011 stub stays in place)';
    END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.proxy_market_create_listing(
    p_item_ref        JSONB,
    p_buy_now_price   BIGINT,
    p_min_bid         BIGINT,
    p_expires_at      TIMESTAMPTZ,
    p_idempotency_key UUID
)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_seller UUID := private.proxy_market_caller_account();
BEGIN
    IF p_idempotency_key IS NULL THEN
        RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22004';
    END IF;
    IF p_item_ref IS NULL OR jsonb_typeof(p_item_ref) <> 'object' THEN
        RAISE EXCEPTION 'item_ref must be a JSON object' USING ERRCODE = '22023';
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
    IF p_expires_at IS NULL OR p_expires_at <= statement_timestamp() THEN
        RAISE EXCEPTION 'expires_at must be in the future' USING ERRCODE = '22023';
    END IF;
    RETURN wallet.service_create_listing(
        v_seller, p_item_ref, 'khash'::wallet.currency_kind,
        p_buy_now_price, p_min_bid, p_expires_at, p_idempotency_key
    );
END;
$$;
ALTER FUNCTION public.proxy_market_create_listing(JSONB, BIGINT, BIGINT, TIMESTAMPTZ, UUID) OWNER TO service_role;
REVOKE ALL ON FUNCTION public.proxy_market_create_listing(JSONB, BIGINT, BIGINT, TIMESTAMPTZ, UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.proxy_market_create_listing(JSONB, BIGINT, BIGINT, TIMESTAMPTZ, UUID) TO authenticated, service_role;
COMMENT ON FUNCTION public.proxy_market_create_listing(JSONB, BIGINT, BIGINT, TIMESTAMPTZ, UUID) IS
    'PUBLIC marketplace proxy. Authenticated create-listing wrapper. Resolves auth.uid() → seller wallet account, then calls wallet.service_create_listing with currency=khash.';

NOTIFY pgrst, 'reload schema';
