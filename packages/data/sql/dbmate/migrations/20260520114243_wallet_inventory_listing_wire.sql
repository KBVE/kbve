-- migrate:up
-- ============================================================================
-- WALLET ↔ INVENTORY LISTING WIRE — foundation (Phase 6.1a)
--
-- Lands:
--   1. inventory.service_split_for_listing — split a HELD stackable row
--      directly into a NEW listing_escrow row + a smaller held source.
--      Combines "split + lock" so the partial-unique invariant on
--      held-stackable rows is never violated (the new row leaves the
--      partial index immediately because it's in listing_escrow).
--   2. wallet.listing.item_id column + active-uniqueness + CHECK so
--      active listings MUST reference an inventory.item row. Existing
--      legacy non-active rows keep working because the CHECK only
--      fires for status='active'.
--   3. wallet.service_create_listing_with_item — new authoritative
--      listing creator that takes (p_item_id, p_qty). When p_qty is
--      NULL or equals the source row qty, the whole row is locked via
--      inventory.service_listing_lock. Otherwise it splits via
--      inventory.service_split_for_listing.
--   4. public.proxy_market_create_listing_with_item — authenticated
--      wrapper. Enforces inventory.is_2fa_required_for_listing aal2
--      gate + the high_value_khash_threshold gate.
--
-- The legacy wallet.service_create_listing(UUID, JSONB, ...) +
-- proxy_market_create_listing(JSONB, ...) STAY in place. axum + Astro
-- migrate to the *_with_item variants in Phase 6.1b. The legacy
-- functions get dropped in 6.1c once all callers move over.
--
-- Settle / cancel / expire / buy_now hooks land in the sibling
-- migration 20260520114244_wallet_listing_settle_inventory.sql.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. inventory.service_split_for_listing
--    Atomically: src.qty -= p_qty, INSERT new row in 'listing_escrow'
--    with the same kind/ref/source as src. src stays 'held' and
--    inside the partial unique index; the new row sits in
--    listing_escrow so it never collides with the held-stackable
--    invariant. Caller (wallet) then INSERTs wallet.listing with
--    item_id = returned new id.
--
--    p_qty MUST be strictly less than src.qty — a whole-row "split"
--    is a no-op the caller should handle via service_listing_lock.
-- ---------------------------------------------------------------------------

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

    UPDATE inventory.item
       SET qty = qty - p_qty, updated_at = now()
     WHERE id = p_src_item_id;

    INSERT INTO inventory.item (
        owner_account, kind, ref, qty, nbt, state, source, source_ref
    ) VALUES (
        v_src.owner_account, v_src.kind, v_src.ref, p_qty,
        '{}'::jsonb, 'listing_escrow', v_src.source,
        jsonb_build_object(
            'split_from',        v_src.id::text,
            'parent_source_ref', v_src.source_ref
        )
    )
    RETURNING id INTO v_new_id;

    -- New row was minted directly into listing_escrow via a "virtual"
    -- transit_in -> listing_escrow transition. Carries split metadata
    -- so the audit stream can reconcile both halves.
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

-- ---------------------------------------------------------------------------
-- 2. wallet.listing.item_id column + active-uniqueness + CHECK
--    Active listings MUST carry item_id. Legacy non-active rows keep
--    item_id NULL.
-- ---------------------------------------------------------------------------

ALTER TABLE wallet.listing
    ADD COLUMN item_id UUID
        REFERENCES inventory.item(id) ON DELETE NO ACTION;

-- Hard cut. Cancel every pre-existing ACTIVE listing — none of them
-- have item_id (column was just added), and going forward every
-- listing MUST flow through the inventory ledger via the
-- *_with_item path. Production has no listings yet; this handles
-- dev / test fixtures so the CHECK below can be plain VALID.
DO $$
DECLARE
    v_cancelled_count INT;
    v_refunded_count  INT;
BEGIN
    -- Refund any active bids on the about-to-be-cancelled listings.
    -- No ledger work here — legacy market never went live so there
    -- shouldn't be real escrowed khash. If there is, the audit_log
    -- row makes it visible for manual reconciliation.
    UPDATE wallet.bid
       SET status     = 'refunded',
           settled_at = COALESCE(settled_at, now())
     WHERE listing_id IN (
         SELECT id FROM wallet.listing
          WHERE status = 'active' AND item_id IS NULL
     )
       AND status = 'active';
    GET DIAGNOSTICS v_refunded_count = ROW_COUNT;

    UPDATE wallet.listing
       SET status              = 'cancelled',
           settled_at          = COALESCE(settled_at, now()),
           current_bid         = NULL,
           current_bid_account = NULL,
           current_bid_id      = NULL
     WHERE status = 'active'
       AND item_id IS NULL;
    GET DIAGNOSTICS v_cancelled_count = ROW_COUNT;

    IF v_cancelled_count > 0 OR v_refunded_count > 0 THEN
        INSERT INTO wallet.audit_log (action, target_type, target_id, metadata)
        VALUES (
            'marketplace.legacy_cleanup',
            'migration',
            '20260520114243_wallet_inventory_listing_wire',
            jsonb_build_object(
                'cancelled_listings', v_cancelled_count,
                'refunded_bids',      v_refunded_count,
                'reason',             'pre-inventory-ledger active listings cleared'
            )
        );
    END IF;
END
$$;

-- VALID CHECK: every active listing MUST now carry item_id. Legacy
-- service_create_listing(UUID, JSONB, ...) callers fail loudly on
-- INSERT — that's intentional and forces the 6.1b axum/Astro switch
-- to the *_with_item variants. Pre-existing non-active rows
-- (cancelled / expired / sold) keep item_id NULL untouched.
ALTER TABLE wallet.listing
    ADD CONSTRAINT wallet_listing_active_item_id_chk
        CHECK (status <> 'active' OR item_id IS NOT NULL);

CREATE UNIQUE INDEX wallet_listing_active_item_uq
    ON wallet.listing (item_id)
    WHERE status = 'active' AND item_id IS NOT NULL;

COMMENT ON COLUMN wallet.listing.item_id IS
    'inventory.item.id of the listed row. NULL only allowed on legacy non-active listings; new active listings MUST reference an inventory.item. Active-listing uniqueness ensures one open listing per item.';

-- ---------------------------------------------------------------------------
-- 3. wallet.service_create_listing_with_item
--    New authoritative listing creator. Takes (p_src_item_id, p_qty).
--    p_qty NULL or = src.qty: lock the whole source row.
--    p_qty < src.qty:        split via service_split_for_listing.
--    Stores back-compat item_ref JSONB derived from the inventory row.
-- ---------------------------------------------------------------------------

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
    IF p_qty IS NOT NULL AND p_qty <= 0 THEN
        RAISE EXCEPTION 'qty must be positive' USING ERRCODE = '22023';
    END IF;

    -- Replay shortcut.
    SELECT id INTO v_existing_id
      FROM wallet.listing
     WHERE seller_account = p_seller_account
       AND idempotency_key = p_idempotency_key;
    IF v_existing_id IS NOT NULL THEN
        RETURN v_existing_id;
    END IF;

    -- Lock + validate the source row. We hold the row lock through
    -- both the optional split and the listing INSERT so a concurrent
    -- caller can't race the same source.
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

    -- Decide whole-row vs split. NULL qty or qty matching source =
    -- whole row. Otherwise must split (and src must be stackable +
    -- have strictly more qty than requested).
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

    -- Back-compat item_ref derived from the listed row.
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

    -- Whole-row path needs the explicit lock RPC. The split path
    -- already flipped the new row to listing_escrow.
    IF NOT v_was_split THEN
        PERFORM inventory.service_listing_lock(p_seller_account, v_listed_id, v_listing_id);
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

-- ---------------------------------------------------------------------------
-- 4. public.proxy_market_create_listing_with_item
--    Authenticated wrapper. Enforces inventory.is_2fa_required_for_listing
--    aal2 gate + the high_value_khash_threshold check before calling
--    the wallet service.
-- ---------------------------------------------------------------------------

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

    -- 2FA gate: if the account opted into require_2fa_for_listing,
    -- the JWT must carry aal=aal2.
    IF inventory.is_2fa_required_for_listing(v_seller)
       AND v_aal IS DISTINCT FROM 'aal2' THEN
        RAISE EXCEPTION 'mfa_required for listing on account %', v_seller
            USING ERRCODE = 'INV30';
    END IF;

    -- High-value gate. Compare max(buy_now_price, min_bid) against
    -- the configured threshold. threshold = 0 means "not configured".
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
            RAISE EXCEPTION 'mfa_required for high-value listing (price=%, threshold=%) on account %',
                v_max_price, v_threshold, v_seller USING ERRCODE = 'INV30';
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

NOTIFY pgrst, 'reload schema';

-- migrate:down

DROP FUNCTION IF EXISTS public.proxy_market_create_listing_with_item(UUID, BIGINT, BIGINT, BIGINT, TIMESTAMPTZ, UUID);
DROP FUNCTION IF EXISTS wallet.service_create_listing_with_item(UUID, UUID, BIGINT, wallet.currency_kind, BIGINT, BIGINT, TIMESTAMPTZ, UUID);

DROP INDEX IF EXISTS wallet.wallet_listing_active_item_uq;
ALTER TABLE wallet.listing DROP CONSTRAINT IF EXISTS wallet_listing_active_item_id_chk;
ALTER TABLE wallet.listing DROP COLUMN IF EXISTS item_id;

DROP FUNCTION IF EXISTS inventory.service_split_for_listing(UUID, UUID, BIGINT);

NOTIFY pgrst, 'reload schema';
