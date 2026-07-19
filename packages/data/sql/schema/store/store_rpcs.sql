-- ============================================================================
-- STORE RPCs — service-layer mutators + public proxies.
--
-- Reference mirror of the collapsed dbmate migrations:
--   ../../dbmate/migrations/20260708120000_store_schema_init.sql
--   ../../dbmate/migrations/20260709170000_store_topup_pod.sql
--   ../../dbmate/migrations/20260709180000_store_privilege_hardening.sql
-- Hand-authored review surface — do not run directly against the database;
-- promote changes into a new dbmate migration when ready. Depends on
-- store_core (schema/tables/enum) and the wallet schema (service_debit /
-- service_credit / account). The order_event append-only trigger and the
-- product slug-immutable trigger functions live in store_core beside the tables
-- they guard.
--
-- Ownership (privilege hardening): the 'OWNER TO service_role' lines below
-- mirror what the init/topup migrations write. The privilege-hardening migration
-- then reassigns EVERY store function AND every public/private proxy_store_*
-- function to the NOLOGIN role store_api_owner (see the PRIVILEGE MODEL section
-- in store_core.sql). service_role keeps only its EXECUTE grants on the RPCs.
--
-- Caller helper (private, PostgREST never exposes):
--   private.proxy_store_caller_account
--
-- Service functions (service_role only):
--   store.service_buy / store.service_buy_physical
--   store.service_upsert_product / store.service_set_product_status
--   store.service_upsert_variant / store.service_set_variant_status
--   store.service_advance_order / store.service_refund_order
--   store.service_list_orders
--   store.service_apply_topup
--   store.service_ack_pod_submission / store.service_update_pod_status
--   store.service_order_for_pod
--
-- Public proxies (mc-style schema-not-exposed pattern):
--   public.proxy_store_catalog_readonly       — anon|authenticated|service_role
--   public.proxy_store_product_detail_readonly — anon|authenticated|service_role
--   public.proxy_store_buy                     — authenticated|service_role
--   public.proxy_store_buy_physical            — authenticated|service_role
--   public.proxy_store_my_entitlements_readonly — authenticated|service_role
--   public.proxy_store_my_orders_readonly      — authenticated|service_role
-- ============================================================================

-- ============================================================================
-- private.proxy_store_caller_account — auth.uid() -> wallet.account.id
--   Raises 28000 on anon, WLT01 on missing account (Rust rw-pool fallback
--   re-runs the read so the lazy-provision trigger fires).
-- ============================================================================

CREATE OR REPLACE FUNCTION private.proxy_store_caller_account()
RETURNS UUID
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_user_id    UUID := auth.uid();
    v_account_id UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
    END IF;
    SELECT id INTO v_account_id
      FROM wallet.account
     WHERE kind = 'user' AND user_id = v_user_id;
    IF v_account_id IS NULL THEN
        RAISE EXCEPTION 'wallet_account_missing' USING ERRCODE = 'WLT01';
    END IF;
    RETURN v_account_id;
END;
$$;
ALTER FUNCTION private.proxy_store_caller_account() OWNER TO service_role;
REVOKE ALL ON FUNCTION private.proxy_store_caller_account() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.proxy_store_caller_account() TO service_role;

-- ============================================================================
-- Catalog / detail read proxies (anon-callable, STABLE).
-- ============================================================================

-- Keyset-paginated public catalog (anon). Avoids repeated unbounded sorted
-- reads. Matches store_product_active_idx (created_at DESC, product_id DESC).
CREATE FUNCTION public.proxy_store_catalog_readonly(
    p_limit             INTEGER     DEFAULT 50,
    p_before_created_at TIMESTAMPTZ DEFAULT NULL,
    p_before_product_id UUID        DEFAULT NULL
)
RETURNS TABLE (
    product_id    UUID,
    slug          TEXT,
    title         TEXT,
    description   TEXT,
    price         BIGINT,
    currency      wallet.currency_kind,
    fulfillment   TEXT,
    asset_ref     JSONB,
    variant_count BIGINT,
    created_at    TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    -- Keyset cursor is a (created_at, product_id) pair: reject a half-supplied
    -- cursor so a bad client can't produce inconsistent / repeated pages.
    IF (p_before_created_at IS NULL) <> (p_before_product_id IS NULL) THEN
        RAISE EXCEPTION 'cursor requires both before_created_at and before_product_id'
            USING ERRCODE = '22023';
    END IF;
    RETURN QUERY
    SELECT p.product_id, p.slug, p.title, p.description,
           p.price, p.currency, p.fulfillment, p.asset_ref,
           COALESCE(vc.n, 0) AS variant_count,
           p.created_at
      FROM store.product p
      LEFT JOIN LATERAL (
          SELECT count(*) AS n
            FROM store.product_variant v
           WHERE v.product_id = p.product_id AND v.status = 'active'
      ) vc ON TRUE
     WHERE p.status = 'active'
       AND (p_before_created_at IS NULL
            OR p.created_at < p_before_created_at
            OR (p.created_at = p_before_created_at AND p.product_id < p_before_product_id))
     ORDER BY p.created_at DESC, p.product_id DESC
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
END;
$$;
ALTER FUNCTION public.proxy_store_catalog_readonly(INTEGER, TIMESTAMPTZ, UUID) OWNER TO service_role;
ALTER FUNCTION public.proxy_store_catalog_readonly(INTEGER, TIMESTAMPTZ, UUID) ROWS 50;
REVOKE ALL ON FUNCTION public.proxy_store_catalog_readonly(INTEGER, TIMESTAMPTZ, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.proxy_store_catalog_readonly(INTEGER, TIMESTAMPTZ, UUID) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.proxy_store_product_detail_readonly(p_slug TEXT)
RETURNS TABLE (
    product_id   UUID,
    slug         TEXT,
    title        TEXT,
    description  TEXT,
    price        BIGINT,
    currency     wallet.currency_kind,
    fulfillment  TEXT,
    asset_ref    JSONB,
    created_at   TIMESTAMPTZ,
    variants     JSONB
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT p.product_id, p.slug, p.title, p.description,
           p.price, p.currency, p.fulfillment, p.asset_ref, p.created_at,
           COALESCE(
               (SELECT jsonb_agg(
                        jsonb_build_object(
                            'variant_id', v.variant_id,
                            'sku',        v.sku,
                            'attributes', v.attributes,
                            'price',      v.price,
                            'stock',      v.stock
                        )
                        ORDER BY v.created_at
                    )
                  -- Cap the embedded variant list so a product with a huge SKU
                  -- count can't produce an oversized single response.
                  FROM (SELECT vv.variant_id, vv.sku, vv.attributes, vv.price,
                               vv.stock, vv.created_at
                          FROM store.product_variant vv
                         WHERE vv.product_id = p.product_id AND vv.status = 'active'
                         ORDER BY vv.created_at
                         LIMIT 200) v),
               '[]'::jsonb
           ) AS variants
      FROM store.product p
     WHERE p.slug = p_slug AND p.status = 'active';
$$;
ALTER FUNCTION public.proxy_store_product_detail_readonly(TEXT) OWNER TO service_role;
REVOKE ALL ON FUNCTION public.proxy_store_product_detail_readonly(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.proxy_store_product_detail_readonly(TEXT) TO anon, authenticated, service_role;

-- ============================================================================
-- store.service_buy — atomic: debit credits + mint inventory.item.
--   Idempotent by ownership: if the caller already holds the product, returns
--   the existing item id without charging. Fresh purchases debit via
--   wallet.service_debit (raises 53100 insufficient_funds) then mint. The
--   debit ref_type embeds the slug so the wallet replay fingerprint is unique
--   per product — reusing an idempotency_key across products cannot mint a
--   second product for free.
-- ============================================================================

CREATE OR REPLACE FUNCTION store.service_buy(
    p_account         UUID,
    p_slug            TEXT,
    p_idempotency_key UUID
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_product         store.product%ROWTYPE;
    v_existing        UUID;
    v_receipt_product UUID;
    v_receipt_item    UUID;
    v_ledger_id       BIGINT;
    v_item_id         UUID;
    v_charged         BIGINT := 0;
    v_result_kind     TEXT := 'minted';
BEGIN
    IF p_account IS NULL OR p_slug IS NULL OR p_idempotency_key IS NULL THEN
        RAISE EXCEPTION 'account, slug and idempotency_key are required'
            USING ERRCODE = '22004';
    END IF;

    -- Two advisory locks in a canonical order (key BEFORE slug — same order in
    -- every call, so no deadlock). The key lock serializes concurrent requests
    -- sharing an idempotency_key even across different products, so the durable
    -- receipt is authoritative. The slug lock serializes same-product buys so the
    -- one-copy ownership guard is race-safe. Both held for the txn; the unique
    -- indexes are backstops.
    PERFORM pg_advisory_xact_lock(
        hashtextextended('store.service_buy.key:' || p_account::text || ':' || p_idempotency_key::text, 0)
    );
    PERFORM pg_advisory_xact_lock(
        hashtextextended('store.service_buy:' || p_account::text || ':' || p_slug, 0)
    );

    -- Resolve the product by slug at ANY status: a durable replay must return
    -- the recorded item even after the product was hidden/retired. Only a fresh
    -- purchase (below) requires an active product.
    SELECT * INTO v_product
      FROM store.product
     WHERE slug = p_slug;
    IF v_product.product_id IS NULL THEN
        RAISE EXCEPTION 'store product % not found', p_slug
            USING ERRCODE = 'P1001';
    END IF;

    -- Durable key idempotency: a recorded receipt returns the same item
    -- without re-charging, even if the item was later sold/transferred/
    -- consumed or the product was retired. Reusing a key for a DIFFERENT
    -- product is rejected. Checked BEFORE the active-status gate.
    SELECT product_id, item_id INTO v_receipt_product, v_receipt_item
      FROM store.purchase
     WHERE account_id = p_account AND idempotency_key = p_idempotency_key;
    IF FOUND THEN
        IF v_receipt_product <> v_product.product_id THEN
            RAISE EXCEPTION 'idempotency_key reused for a different product'
                USING ERRCODE = '40001';
        END IF;
        RETURN v_receipt_item;
    END IF;

    -- A NEW purchase requires an active product.
    IF v_product.status <> 'active' THEN
        RAISE EXCEPTION 'store product % not active', p_slug
            USING ERRCODE = 'P1001';
    END IF;

    -- Dupe guard: one copy per account. held or escrowed both count as owned.
    SELECT id INTO v_existing
      FROM inventory.item
     WHERE owner_account = p_account
       AND kind = 'store_product'
       AND ref = p_slug
       AND state IN ('held', 'listing_escrow')
     LIMIT 1;
    IF v_existing IS NOT NULL THEN
        -- Already owned: no debit, no mint. Recorded as a zero-charge
        -- 'already_owned' result so the receipt never misrepresents the catalog
        -- price as an amount paid.
        v_item_id     := v_existing;
        v_result_kind := 'already_owned';
        v_charged     := 0;
    ELSE
        -- Free products (price 0) skip the debit: wallet.service_debit rejects
        -- non-positive amounts. Paid products debit authoritatively.
        IF v_product.price > 0 THEN
            v_ledger_id := wallet.service_debit(
                p_account,
                v_product.currency,
                v_product.price,
                'purchase'::wallet.source_kind,
                'store purchase: ' || v_product.slug,
                'store_product:' || v_product.slug,
                NULL,
                p_idempotency_key
            );
            v_charged := v_product.price;
        END IF;

        INSERT INTO inventory.item (
            owner_account, kind, ref, qty, nbt, state, source, source_ref
        ) VALUES (
            p_account, 'store_product', v_product.slug, 1,
            jsonb_build_object(
                'product_id', v_product.product_id,
                'title',      v_product.title,
                'asset_ref',  v_product.asset_ref
            ),
            'held', 'store',
            jsonb_build_object(
                'product_id', v_product.product_id,
                'slug',       v_product.slug,
                'ledger_id',  v_ledger_id
            )
        )
        RETURNING id INTO v_item_id;

        INSERT INTO inventory.transition (item_id, from_state, to_state, actor, reason, metadata)
        VALUES (
            v_item_id, 'transit_in', 'held', 'store', 'store_purchase',
            jsonb_build_object(
                'product_id', v_product.product_id,
                'slug',       v_product.slug,
                'price',      v_product.price,
                'currency',   v_product.currency,
                'free',       (v_product.price = 0),
                'ledger_id',  v_ledger_id
            )
        );
    END IF;

    -- Record the durable receipt for this key (both fresh-mint and
    -- already-owned paths), so a later replay returns this exact item. price is
    -- the amount actually charged, not the catalog price.
    INSERT INTO store.purchase (
        account_id, product_id, item_id, price, currency, ledger_id, result_kind, idempotency_key
    ) VALUES (
        p_account, v_product.product_id, v_item_id, v_charged,
        v_product.currency, v_ledger_id, v_result_kind, p_idempotency_key
    )
    ON CONFLICT (account_id, idempotency_key) DO NOTHING;

    RETURN v_item_id;
END;
$$;
ALTER FUNCTION store.service_buy(UUID, TEXT, UUID) OWNER TO service_role;
REVOKE ALL ON FUNCTION store.service_buy(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION store.service_buy(UUID, TEXT, UUID) TO service_role;
COMMENT ON FUNCTION store.service_buy(UUID, TEXT, UUID) IS
    'INTERNAL store RPC. Debits credits (source_kind=purchase) and mints inventory.item(kind=store_product, ref=slug). Idempotent per (account, product) via the held/escrow ownership check; debit ref_type embeds slug so replay fingerprints are per-product.';

-- ============================================================================
-- public.proxy_store_buy — authenticated purchase wrapper.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.proxy_store_buy(
    p_slug            TEXT,
    p_idempotency_key UUID
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_account UUID := private.proxy_store_caller_account();
BEGIN
    IF p_slug IS NULL OR p_idempotency_key IS NULL THEN
        RAISE EXCEPTION 'slug and idempotency_key are required' USING ERRCODE = '22004';
    END IF;
    RETURN store.service_buy(v_account, p_slug, p_idempotency_key);
END;
$$;
ALTER FUNCTION public.proxy_store_buy(TEXT, UUID) OWNER TO service_role;
REVOKE ALL ON FUNCTION public.proxy_store_buy(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proxy_store_buy(TEXT, UUID) TO authenticated, service_role;
COMMENT ON FUNCTION public.proxy_store_buy(TEXT, UUID) IS
    'PUBLIC store proxy. Authenticated buy wrapper. Resolves auth.uid() -> wallet account, then calls store.service_buy. Returns the minted inventory.item id.';

-- ============================================================================
-- public.proxy_store_my_entitlements_readonly — caller's owned products.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.proxy_store_my_entitlements_readonly()
RETURNS TABLE (
    item_id     UUID,
    slug        TEXT,
    product_id  UUID,
    title       TEXT,
    granted_at  TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_account UUID := private.proxy_store_caller_account();
BEGIN
    RETURN QUERY
    SELECT i.id,
           i.ref AS slug,
           (i.nbt->>'product_id')::uuid AS product_id,
           i.nbt->>'title' AS title,
           i.created_at AS granted_at
      FROM inventory.item i
     WHERE i.owner_account = v_account
       AND i.kind = 'store_product'
       AND i.state IN ('held', 'listing_escrow')
     ORDER BY i.created_at DESC, i.id DESC;
END;
$$;
ALTER FUNCTION public.proxy_store_my_entitlements_readonly() OWNER TO service_role;
ALTER FUNCTION public.proxy_store_my_entitlements_readonly() ROWS 50;
REVOKE ALL ON FUNCTION public.proxy_store_my_entitlements_readonly() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proxy_store_my_entitlements_readonly() TO authenticated, service_role;
COMMENT ON FUNCTION public.proxy_store_my_entitlements_readonly() IS
    'PUBLIC store proxy. Caller-scoped (auth.uid()) list of owned store products. Raises WLT01 when the caller has no wallet account.';

-- ============================================================================
-- Staff admin RPCs. service_role-only; the Axum transport enforces
-- forum.is_staff before calling. No public/PostgREST wrappers.
-- Upserts skip no-op writes (ON CONFLICT DO UPDATE WHERE ... IS DISTINCT FROM,
-- with an existing-id fallback when the update is skipped) to cut WAL/realtime
-- churn.
-- ============================================================================

CREATE OR REPLACE FUNCTION store.service_upsert_product(
    p_slug        TEXT,
    p_title       TEXT,
    p_description TEXT,
    p_price       BIGINT,
    p_fulfillment TEXT,
    p_asset_ref   JSONB,
    p_status      TEXT
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_id UUID;
BEGIN
    -- The DO UPDATE WHERE skips no-op writes (avoids WAL / realtime churn).
    -- A skipped update returns no row, so fall back to the existing id.
    INSERT INTO store.product (slug, title, description, price, fulfillment, asset_ref, status)
    VALUES (p_slug, p_title, p_description, p_price,
            COALESCE(p_fulfillment, 'digital'),
            COALESCE(p_asset_ref, '{}'::jsonb),
            COALESCE(p_status, 'active'))
    ON CONFLICT (slug) DO UPDATE
        SET title       = excluded.title,
            description = excluded.description,
            price       = excluded.price,
            fulfillment = excluded.fulfillment,
            asset_ref   = excluded.asset_ref,
            status      = excluded.status,
            updated_at  = now()
        WHERE store.product.title       IS DISTINCT FROM excluded.title
           OR store.product.description IS DISTINCT FROM excluded.description
           OR store.product.price       IS DISTINCT FROM excluded.price
           OR store.product.fulfillment IS DISTINCT FROM excluded.fulfillment
           OR store.product.asset_ref   IS DISTINCT FROM excluded.asset_ref
           OR store.product.status      IS DISTINCT FROM excluded.status
    RETURNING product_id INTO v_id;
    IF v_id IS NULL THEN
        SELECT product_id INTO v_id FROM store.product WHERE slug = p_slug;
    END IF;
    RETURN v_id;
END;
$$;
ALTER FUNCTION store.service_upsert_product(TEXT, TEXT, TEXT, BIGINT, TEXT, JSONB, TEXT) OWNER TO service_role;
REVOKE ALL ON FUNCTION store.service_upsert_product(TEXT, TEXT, TEXT, BIGINT, TEXT, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION store.service_upsert_product(TEXT, TEXT, TEXT, BIGINT, TEXT, JSONB, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION store.service_set_product_status(
    p_product_id UUID,
    p_status     TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM store.product WHERE product_id = p_product_id) THEN
        RAISE EXCEPTION 'store product % not found', p_product_id USING ERRCODE = 'P1001';
    END IF;
    -- No-op guard: skip the write (and WAL / realtime churn) when unchanged.
    UPDATE store.product SET status = p_status, updated_at = now()
     WHERE product_id = p_product_id AND status IS DISTINCT FROM p_status;
END;
$$;
ALTER FUNCTION store.service_set_product_status(UUID, TEXT) OWNER TO service_role;
REVOKE ALL ON FUNCTION store.service_set_product_status(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION store.service_set_product_status(UUID, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION store.service_upsert_variant(
    p_product_id UUID,
    p_sku        TEXT,
    p_attributes JSONB,
    p_price      BIGINT,
    p_stock      BIGINT,
    p_status     TEXT
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_id         UUID;
    v_owner_prod UUID;
    v_old_stock  BIGINT;
    v_stock_mode_known BOOLEAN := false;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM store.product WHERE product_id = p_product_id) THEN
        RAISE EXCEPTION 'store product % not found', p_product_id USING ERRCODE = 'P1001';
    END IF;
    -- sku is globally unique; reject reusing one that belongs to another
    -- product. Friendly pre-check (nice error), but NOT the correctness
    -- mechanism — the ON CONFLICT WHERE below is the race-safe guarantee.
    IF EXISTS (SELECT 1 FROM store.product_variant
                WHERE sku = p_sku AND product_id <> p_product_id) THEN
        RAISE EXCEPTION 'sku % already belongs to another product', p_sku
            USING ERRCODE = '23505';
    END IF;

    -- Stock MODE (finite vs unlimited) is immutable once a variant exists:
    -- flipping it while orders carry stock_reserved snapshots makes old
    -- reservations ambiguous. To change mode, retire the variant and create a
    -- new SKU. Capture the current mode to enforce it on the UPDATE path.
    SELECT stock, true INTO v_old_stock, v_stock_mode_known
      FROM store.product_variant WHERE sku = p_sku AND product_id = p_product_id;
    IF v_stock_mode_known AND ((v_old_stock IS NULL) <> (p_stock IS NULL)) THEN
        RAISE EXCEPTION 'variant % stock mode (finite/unlimited) is immutable; create a new SKU', p_sku
            USING ERRCODE = '22023';
    END IF;

    INSERT INTO store.product_variant (product_id, sku, attributes, price, stock, status)
    VALUES (p_product_id, p_sku,
            COALESCE(p_attributes, '{}'::jsonb),
            p_price, p_stock,
            COALESCE(p_status, 'active'))
    ON CONFLICT (sku) DO UPDATE
        SET attributes = excluded.attributes,
            price      = excluded.price,
            stock      = excluded.stock,
            status     = excluded.status,
            updated_at = now()
        -- product_id guard makes the upsert atomically reject a cross-product
        -- SKU even under a concurrent insert that the pre-check above missed:
        -- a conflict on another product's SKU updates nothing (v_id stays NULL).
        WHERE store.product_variant.product_id = excluded.product_id
          AND (store.product_variant.attributes IS DISTINCT FROM excluded.attributes
            OR store.product_variant.price      IS DISTINCT FROM excluded.price
            OR store.product_variant.stock      IS DISTINCT FROM excluded.stock
            OR store.product_variant.status     IS DISTINCT FROM excluded.status)
    RETURNING variant_id INTO v_id;
    IF v_id IS NULL THEN
        -- No row returned: either a no-op update (same product) or a conflict
        -- on another product's SKU. Disambiguate and raise on cross-product.
        SELECT variant_id INTO v_id FROM store.product_variant
         WHERE sku = p_sku AND product_id = p_product_id;
        IF v_id IS NULL THEN
            RAISE EXCEPTION 'sku % already belongs to another product', p_sku
                USING ERRCODE = '23505';
        END IF;
    END IF;
    RETURN v_id;
END;
$$;
ALTER FUNCTION store.service_upsert_variant(UUID, TEXT, JSONB, BIGINT, BIGINT, TEXT) OWNER TO service_role;
REVOKE ALL ON FUNCTION store.service_upsert_variant(UUID, TEXT, JSONB, BIGINT, BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION store.service_upsert_variant(UUID, TEXT, JSONB, BIGINT, BIGINT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION store.service_set_variant_status(
    p_variant_id UUID,
    p_status     TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM store.product_variant WHERE variant_id = p_variant_id) THEN
        RAISE EXCEPTION 'store variant % not found', p_variant_id USING ERRCODE = 'P1001';
    END IF;
    UPDATE store.product_variant SET status = p_status, updated_at = now()
     WHERE variant_id = p_variant_id AND status IS DISTINCT FROM p_status;
END;
$$;
ALTER FUNCTION store.service_set_variant_status(UUID, TEXT) OWNER TO service_role;
REVOKE ALL ON FUNCTION store.service_set_variant_status(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION store.service_set_variant_status(UUID, TEXT) TO service_role;

-- ============================================================================
-- store.service_buy_physical — debit + optional twin + paid order.
-- ============================================================================

CREATE OR REPLACE FUNCTION store.service_buy_physical(
    p_account          UUID,
    p_variant_id       UUID,
    p_qty              BIGINT,
    p_shipping_address JSONB,
    p_idempotency_key  UUID
)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_variant   store.product_variant%ROWTYPE;
    v_product   store.product%ROWTYPE;
    v_qty       BIGINT := COALESCE(p_qty, 1);
    v_amount    BIGINT;
    v_existing  store.order%ROWTYPE;
    v_ledger_id BIGINT;
    v_twin_id     UUID;
    v_twin_minted BOOLEAN := false;
    v_stock_reserved BOOLEAN := false;
    v_order_id  BIGINT;
BEGIN
    IF p_account IS NULL OR p_variant_id IS NULL OR p_idempotency_key IS NULL THEN
        RAISE EXCEPTION 'account, variant_id and idempotency_key are required'
            USING ERRCODE = '22004';
    END IF;
    IF v_qty <= 0 THEN
        RAISE EXCEPTION 'qty must be positive' USING ERRCODE = '22023';
    END IF;
    IF v_qty > 1000 THEN
        RAISE EXCEPTION 'qty too large (max 1000)' USING ERRCODE = '22023';
    END IF;

    -- Serialize on (account, idempotency_key) — the durable dedupe identity.
    -- Two concurrent requests sharing a key (even with different variants, a
    -- client bug) block here and resolve through the replay guard below instead
    -- of racing into the raw unique-constraint 23505. Variant stock is
    -- serialized separately by the FOR UPDATE row lock further down.
    PERFORM pg_advisory_xact_lock(
        hashtextextended('store.buy_physical:' || p_account::text || ':' || p_idempotency_key::text, 0)
    );

    -- Idempotent replay: same key must describe the same order, else raise so
    -- a client bug (reused key, different variant/qty/address) is loud, not
    -- silent. shipping_address is part of the fingerprint so a replay with a
    -- corrected address is rejected rather than silently dropped.
    SELECT * INTO v_existing FROM store.order
     WHERE account_id = p_account AND idempotency_key = p_idempotency_key;
    IF FOUND THEN
        IF v_existing.account_id <> p_account
           OR v_existing.variant_id IS DISTINCT FROM p_variant_id
           OR v_existing.qty <> v_qty
           OR v_existing.shipping_address IS DISTINCT FROM COALESCE(p_shipping_address, '{}'::jsonb) THEN
            RAISE EXCEPTION 'idempotency_key reused with a different order payload'
                USING ERRCODE = '40001';
        END IF;
        RETURN v_existing.order_id;
    END IF;

    -- Lock the variant so price/stock are consistent against concurrent admin
    -- edits for the rest of the txn.
    SELECT * INTO v_variant
      FROM store.product_variant
     WHERE variant_id = p_variant_id AND status = 'active'
     FOR UPDATE;
    IF v_variant.variant_id IS NULL THEN
        RAISE EXCEPTION 'store variant % not found or not active', p_variant_id
            USING ERRCODE = 'P1001';
    END IF;

    SELECT * INTO v_product
      FROM store.product
     WHERE product_id = v_variant.product_id AND status = 'active';
    IF v_product.product_id IS NULL THEN
        RAISE EXCEPTION 'store product for variant % not active', p_variant_id
            USING ERRCODE = 'P1001';
    END IF;
    IF v_product.fulfillment NOT IN ('physical', 'both') THEN
        RAISE EXCEPTION 'product % is not a physical product', v_product.slug
            USING ERRCODE = '22023';
    END IF;

    -- A physical order needs a COMPLETE shipping address BEFORE money moves.
    -- service_buy_physical is directly callable by service_role, so the address
    -- contract is enforced HERE (in the trust boundary) rather than trusting the
    -- transport: the minimum fulfillable set must be present and non-blank, and
    -- the document bounded, or no paid order is created.
    IF COALESCE(p_shipping_address, '{}'::jsonb) = '{}'::jsonb THEN
        RAISE EXCEPTION 'shipping_address is required for physical orders'
            USING ERRCODE = '23514';
    END IF;
    IF jsonb_typeof(p_shipping_address) <> 'object'
       OR octet_length(p_shipping_address::text) > 16384 THEN
        RAISE EXCEPTION 'shipping_address must be a JSON object under 16KB'
            USING ERRCODE = '22023';
    END IF;
    IF coalesce(length(btrim(p_shipping_address->>'name')), 0)        = 0
       OR coalesce(length(btrim(p_shipping_address->>'line1')), 0)    = 0
       OR coalesce(length(btrim(p_shipping_address->>'city')), 0)     = 0
       OR coalesce(length(btrim(p_shipping_address->>'postal_code')), 0) = 0
       OR coalesce(length(btrim(p_shipping_address->>'country')), 0)  = 0 THEN
        RAISE EXCEPTION 'shipping_address requires name, line1, city, postal_code, country'
            USING ERRCODE = '23514';
    END IF;

    -- Overflow-safe amount.
    IF v_variant.price > 0 AND v_qty > (9223372036854775000 / v_variant.price) THEN
        RAISE EXCEPTION 'order amount overflow' USING ERRCODE = '22003';
    END IF;
    v_amount := v_variant.price * v_qty;

    -- Atomic finite-stock decrement (NULL = unlimited).
    IF v_variant.stock IS NOT NULL THEN
        UPDATE store.product_variant
           SET stock = stock - v_qty, updated_at = now()
         WHERE variant_id = p_variant_id AND stock >= v_qty;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'variant % out of stock', p_variant_id USING ERRCODE = 'P1020';
        END IF;
        v_stock_reserved := true;
    END IF;

    IF v_amount > 0 THEN
        v_ledger_id := wallet.service_debit(
            p_account,
            v_product.currency,
            v_amount,
            'purchase'::wallet.source_kind,
            'store order: ' || v_product.slug || ' x' || v_qty,
            'store_variant:' || p_variant_id::text,
            NULL,
            p_idempotency_key
        );
    END IF;

    -- fulfillment='both': mint a one-per-account digital twin if not owned.
    IF v_product.fulfillment = 'both' THEN
        SELECT id INTO v_twin_id
          FROM inventory.item
         WHERE owner_account = p_account
           AND kind = 'store_product'
           AND ref = v_product.slug
           AND state IN ('held', 'listing_escrow')
         LIMIT 1;
        IF v_twin_id IS NULL THEN
            INSERT INTO inventory.item (
                owner_account, kind, ref, qty, nbt, state, source, source_ref
            ) VALUES (
                p_account, 'store_product', v_product.slug, 1,
                jsonb_build_object('product_id', v_product.product_id,
                                   'title', v_product.title, 'asset_ref', v_product.asset_ref),
                'held', 'store',
                jsonb_build_object('product_id', v_product.product_id,
                                   'slug', v_product.slug, 'twin', true)
            )
            RETURNING id INTO v_twin_id;
            v_twin_minted := true;

            INSERT INTO inventory.transition (item_id, from_state, to_state, actor, reason, metadata)
            VALUES (v_twin_id, 'transit_in', 'held', 'store', 'store_purchase_twin',
                    jsonb_build_object('product_id', v_product.product_id, 'slug', v_product.slug));
        END IF;
    END IF;

    -- twin_item_id is set ONLY when THIS order minted the twin. If the buyer
    -- already owned the digital copy from a separate purchase, leave it NULL so
    -- a refund of this order never revokes an entitlement it did not create.
    INSERT INTO store.order (
        account_id, product_id, variant_id, qty,
        currency, unit_price, product_slug, product_title, variant_sku, variant_attributes,
        fulfillment, stock_reserved,
        credits_amount, ledger_id, twin_item_id, status, shipping_address, idempotency_key
    ) VALUES (
        p_account, v_product.product_id, p_variant_id, v_qty,
        v_product.currency, v_variant.price, v_product.slug, v_product.title,
        v_variant.sku, v_variant.attributes,
        v_product.fulfillment, v_stock_reserved,
        v_amount, v_ledger_id,
        CASE WHEN v_twin_minted THEN v_twin_id ELSE NULL END,
        'paid', COALESCE(p_shipping_address, '{}'::jsonb), p_idempotency_key
    )
    RETURNING order_id INTO v_order_id;

    INSERT INTO store.order_event (order_id, from_status, to_status, actor, note, metadata)
    VALUES (v_order_id, NULL, 'paid', 'store', 'order created',
            jsonb_build_object('variant_id', p_variant_id, 'qty', v_qty,
                               'credits_amount', v_amount, 'ledger_id', v_ledger_id));

    RETURN v_order_id;
END;
$$;
ALTER FUNCTION store.service_buy_physical(UUID, UUID, BIGINT, JSONB, UUID) OWNER TO service_role;
REVOKE ALL ON FUNCTION store.service_buy_physical(UUID, UUID, BIGINT, JSONB, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION store.service_buy_physical(UUID, UUID, BIGINT, JSONB, UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.proxy_store_buy_physical(
    p_variant_id       UUID,
    p_qty              BIGINT,
    p_shipping_address JSONB,
    p_idempotency_key  UUID
)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_account UUID := private.proxy_store_caller_account();
BEGIN
    IF p_variant_id IS NULL OR p_idempotency_key IS NULL THEN
        RAISE EXCEPTION 'variant_id and idempotency_key are required' USING ERRCODE = '22004';
    END IF;
    RETURN store.service_buy_physical(v_account, p_variant_id, p_qty, p_shipping_address, p_idempotency_key);
END;
$$;
ALTER FUNCTION public.proxy_store_buy_physical(UUID, BIGINT, JSONB, UUID) OWNER TO service_role;
REVOKE ALL ON FUNCTION public.proxy_store_buy_physical(UUID, BIGINT, JSONB, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proxy_store_buy_physical(UUID, BIGINT, JSONB, UUID) TO authenticated, service_role;

-- Caller-scoped order history, keyset-paginated.
CREATE OR REPLACE FUNCTION public.proxy_store_my_orders_readonly(
    p_limit             INTEGER     DEFAULT 50,
    p_before_created_at TIMESTAMPTZ DEFAULT NULL,
    p_before_id         BIGINT      DEFAULT NULL
)
RETURNS TABLE (
    order_id       BIGINT,
    product_id     UUID,
    variant_id     UUID,
    qty            BIGINT,
    credits_amount BIGINT,
    status         store.order_status,
    tracking       JSONB,
    created_at     TIMESTAMPTZ,
    updated_at     TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_account UUID := private.proxy_store_caller_account();
    v_limit   INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
BEGIN
    IF (p_before_created_at IS NULL) <> (p_before_id IS NULL) THEN
        RAISE EXCEPTION 'cursor requires both before_created_at and before_id'
            USING ERRCODE = '22023';
    END IF;
    RETURN QUERY
    SELECT o.order_id, o.product_id, o.variant_id, o.qty, o.credits_amount,
           o.status, o.tracking, o.created_at, o.updated_at
      FROM store.order o
     WHERE o.account_id = v_account
       AND (p_before_created_at IS NULL
            OR o.created_at < p_before_created_at
            OR (o.created_at = p_before_created_at AND o.order_id < p_before_id))
     ORDER BY o.created_at DESC, o.order_id DESC
     LIMIT v_limit;
END;
$$;
ALTER FUNCTION public.proxy_store_my_orders_readonly(INTEGER, TIMESTAMPTZ, BIGINT) OWNER TO service_role;
ALTER FUNCTION public.proxy_store_my_orders_readonly(INTEGER, TIMESTAMPTZ, BIGINT) ROWS 50;
REVOKE ALL ON FUNCTION public.proxy_store_my_orders_readonly(INTEGER, TIMESTAMPTZ, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proxy_store_my_orders_readonly(INTEGER, TIMESTAMPTZ, BIGINT) TO authenticated, service_role;

-- ============================================================================
-- Fulfillment (service_role; transport gates staff).
--   advance_order moves FORWARD only. Cancellation = refund.
-- ============================================================================

CREATE OR REPLACE FUNCTION store.service_advance_order(
    p_order_id  BIGINT,
    p_to_status store.order_status,
    p_tracking  JSONB,
    p_note      TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_from  store.order_status;
    v_legal BOOLEAN;
BEGIN
    SELECT status INTO v_from FROM store.order WHERE order_id = p_order_id FOR UPDATE;
    IF v_from IS NULL THEN
        RAISE EXCEPTION 'order % not found', p_order_id USING ERRCODE = 'P1001';
    END IF;

    -- Forward-only fulfillment. To cancel/return money use service_refund_order.
    v_legal := (v_from = 'paid'       AND p_to_status = 'processing')
            OR (v_from = 'processing' AND p_to_status = 'shipped')
            OR (v_from = 'shipped'    AND p_to_status = 'delivered');
    IF NOT v_legal THEN
        RAISE EXCEPTION 'illegal order transition % -> %', v_from, p_to_status
            USING ERRCODE = '22023';
    END IF;

    UPDATE store.order
       SET status = p_to_status,
           tracking = CASE WHEN p_tracking IS NULL OR p_tracking = '{}'::jsonb
                           THEN tracking ELSE p_tracking END,
           updated_at = now()
     WHERE order_id = p_order_id;

    INSERT INTO store.order_event (order_id, from_status, to_status, actor, note, metadata)
    VALUES (p_order_id, v_from, p_to_status, 'staff', p_note, COALESCE(p_tracking, '{}'::jsonb));
END;
$$;
ALTER FUNCTION store.service_advance_order(BIGINT, store.order_status, JSONB, TEXT) OWNER TO service_role;
REVOKE ALL ON FUNCTION store.service_advance_order(BIGINT, store.order_status, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION store.service_advance_order(BIGINT, store.order_status, JSONB, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION store.service_refund_order(
    p_order_id BIGINT,
    p_reason   TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_order      store.order%ROWTYPE;
    v_refund_id  BIGINT;
    v_twin_state TEXT;
    v_twin_owner UUID;
BEGIN
    SELECT * INTO v_order FROM store.order WHERE order_id = p_order_id FOR UPDATE;
    IF v_order.order_id IS NULL THEN
        RAISE EXCEPTION 'order % not found', p_order_id USING ERRCODE = 'P1001';
    END IF;
    IF v_order.status IN ('refunded', 'cancelled') THEN
        RETURN;  -- idempotent; already money-returned
    END IF;
    IF v_order.status NOT IN ('paid', 'processing', 'shipped', 'delivered') THEN
        RAISE EXCEPTION 'order % not refundable (status=%)', p_order_id, v_order.status
            USING ERRCODE = '22023';
    END IF;

    -- Refund in the currency snapshotted on the order, never the live product
    -- row — an admin currency change after purchase must not misdenominate the
    -- refund.
    IF v_order.credits_amount > 0 THEN
        v_refund_id := wallet.service_credit(
            v_order.account_id, v_order.currency, v_order.credits_amount,
            'refund'::wallet.source_kind, COALESCE(p_reason, 'store order refund'),
            'store_refund', v_order.order_id,
            md5('store_refund:' || v_order.order_id::text)::uuid
        );
    END IF;

    -- Restore stock only if THIS order actually reserved finite stock
    -- (stock_reserved snapshot). Stock mode is immutable (service_upsert_variant
    -- rejects finite<->unlimited flips), so a reserved order's variant is still
    -- finite here and the restore is exact — never inflated, never skipped.
    IF v_order.stock_reserved AND v_order.variant_id IS NOT NULL THEN
        UPDATE store.product_variant
           SET stock = stock + v_order.qty, updated_at = now()
         WHERE variant_id = v_order.variant_id AND stock IS NOT NULL;
    END IF;

    -- Revoke the order-minted digital twin. Refunding while the buyer still
    -- holds a sellable twin would be a double-dip (money back AND keeps the
    -- entitlement's value). Only a twin still owned by this account and 'held'
    -- is cleanly revocable; if it was sold, escrowed, transferred, or already
    -- consumed, block the refund loudly for manual review rather than silently
    -- completing. Locked FOR UPDATE so a concurrent transfer can't slip past.
    IF v_order.twin_item_id IS NOT NULL THEN
        SELECT state, owner_account INTO v_twin_state, v_twin_owner
          FROM inventory.item WHERE id = v_order.twin_item_id FOR UPDATE;
        IF v_twin_state = 'held' AND v_twin_owner = v_order.account_id THEN
            UPDATE inventory.item SET state = 'consumed', updated_at = now()
             WHERE id = v_order.twin_item_id;
            INSERT INTO inventory.transition (item_id, from_state, to_state, actor, reason, metadata)
            VALUES (v_order.twin_item_id, 'held', 'consumed', 'store', 'refund_revoke_twin',
                    jsonb_build_object('order_id', p_order_id));
        ELSE
            RAISE EXCEPTION 'order % twin no longer revocable (state=%, owner_moved=%)',
                p_order_id, v_twin_state, (v_twin_owner IS DISTINCT FROM v_order.account_id)
                USING ERRCODE = '55006';
        END IF;
    END IF;

    UPDATE store.order SET status = 'refunded', updated_at = now() WHERE order_id = p_order_id;

    INSERT INTO store.order_event (order_id, from_status, to_status, actor, note, metadata)
    VALUES (p_order_id, v_order.status, 'refunded', 'staff', COALESCE(p_reason, 'refund'),
            jsonb_build_object('refund_ledger_id', v_refund_id, 'credits_amount', v_order.credits_amount));
END;
$$;
ALTER FUNCTION store.service_refund_order(BIGINT, TEXT) OWNER TO service_role;
REVOKE ALL ON FUNCTION store.service_refund_order(BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION store.service_refund_order(BIGINT, TEXT) TO service_role;

-- Two explicit branches instead of `p_status IS NULL OR o.status = p_status`
-- so the planner gets a clean plan for each: PK scan (all) or the
-- (status, order_id DESC) index (by status).
CREATE OR REPLACE FUNCTION store.service_list_orders(
    p_status    store.order_status,
    p_limit     INTEGER,
    p_before_id BIGINT
)
RETURNS TABLE (
    order_id         BIGINT,
    account_id       UUID,
    product_id       UUID,
    variant_id       UUID,
    qty              BIGINT,
    credits_amount   BIGINT,
    status           store.order_status,
    shipping_address JSONB,
    tracking         JSONB,
    created_at       TIMESTAMPTZ,
    updated_at       TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
BEGIN
    IF p_status IS NULL THEN
        RETURN QUERY
        SELECT o.order_id, o.account_id, o.product_id, o.variant_id, o.qty,
               o.credits_amount, o.status, o.shipping_address, o.tracking,
               o.created_at, o.updated_at
          FROM store.order o
         WHERE p_before_id IS NULL OR o.order_id < p_before_id
         ORDER BY o.order_id DESC
         LIMIT v_limit;
    ELSE
        RETURN QUERY
        SELECT o.order_id, o.account_id, o.product_id, o.variant_id, o.qty,
               o.credits_amount, o.status, o.shipping_address, o.tracking,
               o.created_at, o.updated_at
          FROM store.order o
         WHERE o.status = p_status
           AND (p_before_id IS NULL OR o.order_id < p_before_id)
         ORDER BY o.order_id DESC
         LIMIT v_limit;
    END IF;
END;
$$;
ALTER FUNCTION store.service_list_orders(store.order_status, INTEGER, BIGINT) OWNER TO service_role;
ALTER FUNCTION store.service_list_orders(store.order_status, INTEGER, BIGINT) ROWS 100;
REVOKE ALL ON FUNCTION store.service_list_orders(store.order_status, INTEGER, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION store.service_list_orders(store.order_status, INTEGER, BIGINT) TO service_role;

-- ============================================================================
-- Stripe credit on-ramp (Phase 3).
--   service_apply_topup: resolve the wallet account from the auth user id
--   (carried in Stripe session metadata), idempotently record the topup, and
--   credit the wallet. Returns the ledger id (existing one on replay).
-- ============================================================================

CREATE OR REPLACE FUNCTION store.service_apply_topup(
    p_user_id           UUID,
    p_stripe_event_id   TEXT,
    p_stripe_session_id TEXT,
    p_credits           BIGINT,
    p_amount_cents      BIGINT,
    p_currency_fiat     TEXT
)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_account       UUID;
    v_row           store.topup%ROWTYPE;
    v_ledger_id     BIGINT;
    v_event_id      TEXT := btrim(p_stripe_event_id);
    v_session_id    TEXT := NULLIF(btrim(p_stripe_session_id), '');
    v_currency_fiat TEXT := lower(btrim(COALESCE(p_currency_fiat, 'usd')));
BEGIN
    IF p_user_id IS NULL OR coalesce(length(v_event_id), 0) = 0
       OR coalesce(length(v_session_id), 0) = 0
       OR p_credits IS NULL OR p_credits <= 0 THEN
        RAISE EXCEPTION 'user_id, stripe_event_id, stripe_session_id and positive credits are required'
            USING ERRCODE = '22004';
    END IF;
    IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
        RAISE EXCEPTION 'amount_cents must be positive' USING ERRCODE = '22023';
    END IF;
    -- Enforce the runaway-amount caps BEFORE crediting the wallet, so an
    -- over-bound value returns a deliberate 22023 instead of doing wasted
    -- wallet work that then rolls back on the table CHECK.
    IF p_credits > 100000000 THEN
        RAISE EXCEPTION 'credits exceeds maximum' USING ERRCODE = '22023';
    END IF;
    IF p_amount_cents > 100000000 THEN
        RAISE EXCEPTION 'amount_cents exceeds maximum' USING ERRCODE = '22023';
    END IF;
    IF v_currency_fiat !~ '^[a-z]{3}$' THEN
        RAISE EXCEPTION 'currency_fiat must be a 3-letter ISO code' USING ERRCODE = '22023';
    END IF;

    SELECT id INTO v_account
      FROM wallet.account WHERE kind = 'user' AND user_id = p_user_id;
    IF v_account IS NULL THEN
        RAISE EXCEPTION 'wallet_account_missing' USING ERRCODE = 'WLT01';
    END IF;

    -- Session-level idempotency first: two distinct Stripe events can reference
    -- the same Checkout Session (the thing that must not be credited twice).
    -- On replay, validate the recorded row's immutable fingerprint — a
    -- duplicate carrying contradictory account/credits/fiat data fails loudly
    -- rather than being accepted as a successful replay.
    IF v_session_id IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(
            hashtextextended('store.topup.session:' || v_session_id, 0));
        SELECT * INTO v_row FROM store.topup WHERE stripe_session_id = v_session_id;
        IF FOUND THEN
            IF v_row.account_id <> v_account
               OR v_row.credits_granted <> p_credits
               OR v_row.amount_cents <> p_amount_cents
               OR v_row.currency_fiat <> v_currency_fiat THEN
                RAISE EXCEPTION 'topup replay payload mismatch for session %', v_session_id
                    USING ERRCODE = '40001';
            END IF;
            RETURN v_row.ledger_id;
        END IF;
    END IF;

    -- Serialize concurrent webhook deliveries for this event so the losing
    -- delivery returns the existing ledger id idempotently instead of hitting
    -- the unique constraint and rolling back.
    PERFORM pg_advisory_xact_lock(hashtextextended('store.topup:' || v_event_id, 0));

    -- Idempotent replay: this Stripe event already applied (re-checked under
    -- lock), with the same fingerprint validation.
    SELECT * INTO v_row FROM store.topup WHERE stripe_event_id = v_event_id;
    IF FOUND THEN
        IF v_row.account_id <> v_account
           OR v_row.credits_granted <> p_credits
           OR v_row.amount_cents <> p_amount_cents
           OR v_row.currency_fiat <> v_currency_fiat
           OR v_row.stripe_session_id IS DISTINCT FROM v_session_id THEN
            RAISE EXCEPTION 'topup replay payload mismatch for event %', v_event_id
                USING ERRCODE = '40001';
        END IF;
        RETURN v_row.ledger_id;
    END IF;

    -- Deterministic wallet idempotency key derived from the Stripe event, so
    -- the wallet ledger itself dedupes a topup even if this proc is retried
    -- outside the advisory-lock window.
    v_ledger_id := wallet.service_credit(
        v_account,
        'credits'::wallet.currency_kind,
        p_credits,
        'topup'::wallet.source_kind,
        'stripe credit topup',
        'stripe_session',
        NULL,
        md5('store_topup:' || v_event_id)::uuid
    );

    INSERT INTO store.topup (
        account_id, stripe_event_id, stripe_session_id,
        credits_granted, amount_cents, currency_fiat, ledger_id
    ) VALUES (
        v_account, v_event_id, v_session_id,
        p_credits, p_amount_cents, v_currency_fiat, v_ledger_id
    );

    RETURN v_ledger_id;
END;
$$;
ALTER FUNCTION store.service_apply_topup(UUID, TEXT, TEXT, BIGINT, BIGINT, TEXT) OWNER TO service_role;
REVOKE ALL ON FUNCTION store.service_apply_topup(UUID, TEXT, TEXT, BIGINT, BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION store.service_apply_topup(UUID, TEXT, TEXT, BIGINT, BIGINT, TEXT) TO service_role;

-- ============================================================================
-- Print-on-demand (Phase 4). POD external id/status ride on store.order's
-- promoted columns + pod_ref; shipment webhooks advance the order to 'shipped'
-- via service_advance_order. Lease/ACK model: service_order_for_pod leases an
-- order (fresh claim_token), service_ack_pod_submission confirms the provider
-- submission (requires the token), service_update_pod_status carries later
-- status/metadata-only updates.
-- ============================================================================

-- service_ack_pod_submission — record a CONFIRMED provider submission. Requires
-- the lease token from service_order_for_pod (a worker whose lease was reclaimed
-- is rejected -> no double-write), and a complete provider identity (provider +
-- external_order_id). Sets pod_submitted_at, promotes the identity set-once, and
-- shallow-merges pod_ref. This is the ONLY path that establishes external
-- identity; a status webhook cannot masquerade as an acknowledgement.
CREATE OR REPLACE FUNCTION store.service_ack_pod_submission(
    p_order_id    BIGINT,
    p_claim_token UUID,
    p_pod_ref     JSONB
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_new      JSONB := COALESCE(p_pod_ref, '{}'::jsonb);
    v_order    store.order%ROWTYPE;
    v_merged   JSONB;
    v_provider TEXT := NULLIF(lower(btrim(v_new->>'provider')), '');
    v_ext_id   TEXT := NULLIF(btrim(v_new->>'external_order_id'), '');
    v_pstatus  TEXT := NULLIF(btrim(v_new->>'status'), '');
BEGIN
    IF jsonb_typeof(v_new) <> 'object' OR octet_length(v_new::text) > 16384 THEN
        RAISE EXCEPTION 'pod_ref must be a JSON object under 16KB' USING ERRCODE = '22023';
    END IF;
    IF p_claim_token IS NULL THEN
        RAISE EXCEPTION 'claim token is required to acknowledge a POD submission'
            USING ERRCODE = '22004';
    END IF;
    IF v_provider IS NULL OR v_ext_id IS NULL THEN
        RAISE EXCEPTION 'POD acknowledgement requires provider and external_order_id'
            USING ERRCODE = '22023';
    END IF;

    -- Eligibility from the fulfillment SNAPSHOT (not the live product row).
    SELECT o.* INTO v_order
      FROM store.order o
     WHERE o.order_id = p_order_id
       AND o.fulfillment IN ('physical', 'both')
       AND o.status IN ('paid', 'processing', 'shipped')
     FOR UPDATE OF o;
    IF v_order.order_id IS NULL THEN
        RAISE EXCEPTION 'order % not eligible for a POD acknowledgement', p_order_id
            USING ERRCODE = 'P1001';
    END IF;

    -- The lease token must match the current claim: a stale worker whose lease
    -- expired and was reclaimed by another worker holds an old token and is
    -- rejected here, preventing both workers writing the same order.
    IF v_order.pod_claim_token IS NULL OR v_order.pod_claim_token <> p_claim_token THEN
        RAISE EXCEPTION 'order % POD claim token is stale or missing', p_order_id
            USING ERRCODE = '55006';
    END IF;

    -- Provider identity is set-once (idempotent re-ACK with identical values is
    -- allowed; a different value is rejected).
    IF v_order.pod_provider IS NOT NULL AND v_order.pod_provider <> v_provider THEN
        RAISE EXCEPTION 'order % pod_provider is immutable once set', p_order_id
            USING ERRCODE = '22023';
    END IF;
    IF v_order.pod_external_order_id IS NOT NULL AND v_order.pod_external_order_id <> v_ext_id THEN
        RAISE EXCEPTION 'order % pod_external_order_id is immutable once set', p_order_id
            USING ERRCODE = '22023';
    END IF;

    v_merged := v_order.pod_ref || v_new;
    IF octet_length(v_merged::text) > 16384 THEN
        RAISE EXCEPTION 'pod_ref too large after merge' USING ERRCODE = '22023';
    END IF;

    -- Change predicate covers pod_ref AND every promoted column + the submission
    -- stamp, so a repair where the JSON already matches but a promoted column is
    -- stale/null still writes.
    UPDATE store.order
       SET pod_ref               = v_merged,
           pod_provider          = v_provider,
           pod_external_order_id = v_ext_id,
           pod_status            = COALESCE(v_pstatus, pod_status, 'submitted'),
           pod_submitted_at      = COALESCE(pod_submitted_at, now()),
           updated_at            = now()
     WHERE order_id = p_order_id
       AND (pod_ref               IS DISTINCT FROM v_merged
         OR pod_provider          IS DISTINCT FROM v_provider
         OR pod_external_order_id IS DISTINCT FROM v_ext_id
         OR pod_status            IS DISTINCT FROM COALESCE(v_pstatus, pod_status, 'submitted')
         OR pod_submitted_at      IS NULL);
    IF FOUND THEN
        INSERT INTO store.order_event (order_id, from_status, to_status, actor, note, metadata)
        VALUES (p_order_id, v_order.status, v_order.status, 'pod', 'pod submission acked', v_merged);
    END IF;
END;
$$;
ALTER FUNCTION store.service_ack_pod_submission(BIGINT, UUID, JSONB) OWNER TO service_role;
REVOKE ALL ON FUNCTION store.service_ack_pod_submission(BIGINT, UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION store.service_ack_pod_submission(BIGINT, UUID, JSONB) TO service_role;

-- service_update_pod_status — status/metadata-only updates (e.g. provider
-- webhooks) AFTER an external identity exists. Never establishes or mutates the
-- provider identity; shallow-merges metadata into pod_ref.
CREATE OR REPLACE FUNCTION store.service_update_pod_status(
    p_order_id BIGINT,
    p_pod_ref  JSONB
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_new     JSONB := COALESCE(p_pod_ref, '{}'::jsonb);
    v_order   store.order%ROWTYPE;
    v_merged  JSONB;
    v_pstatus TEXT := NULLIF(btrim(v_new->>'status'), '');
BEGIN
    IF jsonb_typeof(v_new) <> 'object' OR octet_length(v_new::text) > 16384 THEN
        RAISE EXCEPTION 'pod_ref must be a JSON object under 16KB' USING ERRCODE = '22023';
    END IF;

    SELECT o.* INTO v_order
      FROM store.order o
     WHERE o.order_id = p_order_id
       AND o.fulfillment IN ('physical', 'both')
       AND o.status IN ('paid', 'processing', 'shipped')
     FOR UPDATE OF o;
    IF v_order.order_id IS NULL THEN
        RAISE EXCEPTION 'order % not eligible for a POD status update', p_order_id
            USING ERRCODE = 'P1001';
    END IF;
    IF v_order.pod_external_order_id IS NULL THEN
        RAISE EXCEPTION 'order % has no POD submission to update', p_order_id
            USING ERRCODE = 'P1001';
    END IF;

    -- Reject any attempt to change the provider identity via this path.
    IF (v_new ? 'provider'
        AND NULLIF(lower(btrim(v_new->>'provider')), '') IS DISTINCT FROM v_order.pod_provider)
       OR (v_new ? 'external_order_id'
           AND NULLIF(btrim(v_new->>'external_order_id'), '') IS DISTINCT FROM v_order.pod_external_order_id) THEN
        RAISE EXCEPTION 'POD provider identity is immutable; update status/metadata only'
            USING ERRCODE = '22023';
    END IF;

    v_merged := v_order.pod_ref || v_new;
    IF octet_length(v_merged::text) > 16384 THEN
        RAISE EXCEPTION 'pod_ref too large after merge' USING ERRCODE = '22023';
    END IF;

    UPDATE store.order
       SET pod_ref    = v_merged,
           pod_status = COALESCE(v_pstatus, pod_status),
           updated_at = now()
     WHERE order_id = p_order_id
       AND (pod_ref    IS DISTINCT FROM v_merged
         OR pod_status IS DISTINCT FROM COALESCE(v_pstatus, pod_status));
    IF FOUND THEN
        INSERT INTO store.order_event (order_id, from_status, to_status, actor, note, metadata)
        VALUES (p_order_id, v_order.status, v_order.status, 'pod', 'pod status updated', v_merged);
    END IF;
END;
$$;
ALTER FUNCTION store.service_update_pod_status(BIGINT, JSONB) OWNER TO service_role;
REVOKE ALL ON FUNCTION store.service_update_pod_status(BIGINT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION store.service_update_pod_status(BIGINT, JSONB) TO service_role;

-- Atomically LEASE an order for POD submission. Locks the order, verifies
-- eligibility (from the fulfillment snapshot), rejects an already-submitted or
-- actively-leased order, then stamps a lease (pod_claimed_at + expiry + a fresh
-- pod_claim_token + worker id). A worker crash before ACK lets the lease expire
-- (15m) so the order is reclaimable — never permanently stranded. The returned
-- claim_token must be presented to service_ack_pod_submission; a reclaimed
-- worker's stale token is rejected there. submission_key is a deterministic
-- provider idempotency key. VOLATILE (writes the lease) — write connection.
CREATE OR REPLACE FUNCTION store.service_order_for_pod(
    p_order_id   BIGINT,
    p_claimed_by TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_order   store.order%ROWTYPE;
    v_product store.product%ROWTYPE;
    v_variant store.product_variant%ROWTYPE;
    v_token   UUID := gen_random_uuid();
BEGIN
    SELECT * INTO v_order FROM store.order WHERE order_id = p_order_id FOR UPDATE;
    IF v_order.order_id IS NULL THEN
        RAISE EXCEPTION 'order % not found', p_order_id USING ERRCODE = 'P1001';
    END IF;

    -- Eligibility from the order's fulfillment SNAPSHOT, not the live product,
    -- so a post-checkout catalog edit can't disqualify a paid order.
    IF v_order.status NOT IN ('paid', 'processing')
       OR v_order.fulfillment NOT IN ('physical', 'both') THEN
        RAISE EXCEPTION 'order % not eligible for POD fulfillment', p_order_id
            USING ERRCODE = 'P1001';
    END IF;

    -- Final once the provider accepted (submitted_at + external id). Otherwise
    -- an unexpired lease belongs to another worker; a never-leased or expired
    -- lease is (re)claimable.
    IF v_order.pod_submitted_at IS NOT NULL OR v_order.pod_external_order_id IS NOT NULL THEN
        RAISE EXCEPTION 'order % already submitted to POD provider', p_order_id
            USING ERRCODE = '55006';
    END IF;
    IF v_order.pod_claimed_at IS NOT NULL
       AND v_order.pod_claim_expires_at IS NOT NULL
       AND v_order.pod_claim_expires_at > now() THEN
        RAISE EXCEPTION 'order % already leased for POD fulfillment', p_order_id
            USING ERRCODE = '55006';
    END IF;

    SELECT * INTO v_product FROM store.product WHERE product_id = v_order.product_id;
    SELECT * INTO v_variant FROM store.product_variant WHERE variant_id = v_order.variant_id;

    UPDATE store.order
       SET pod_status           = 'claimed',
           pod_claimed_at       = now(),
           pod_claim_expires_at = now() + interval '15 minutes',
           pod_claim_token      = v_token,
           pod_claimed_by       = NULLIF(btrim(p_claimed_by), ''),
           updated_at           = now()
     WHERE order_id = p_order_id;

    -- Fulfillment payload prefers the immutable order snapshots over the live
    -- catalog, so a rename / SKU change after checkout can't alter what is sent
    -- to the provider.
    RETURN jsonb_build_object(
        'order_id',         v_order.order_id,
        'qty',              v_order.qty,
        'status',           v_order.status,
        'shipping_address', v_order.shipping_address,
        'pod_ref',          v_order.pod_ref,
        'sku',              COALESCE(v_order.variant_sku, v_variant.sku),
        'attributes',       COALESCE(NULLIF(v_order.variant_attributes, '{}'::jsonb), v_variant.attributes),
        'product_slug',     COALESCE(v_order.product_slug, v_product.slug),
        'product_title',    COALESCE(v_order.product_title, v_product.title),
        'claim_token',      v_token,
        'submission_key',   md5('store_pod:' || v_order.order_id::text)
    );
END;
$$;
ALTER FUNCTION store.service_order_for_pod(BIGINT, TEXT) OWNER TO service_role;
REVOKE ALL ON FUNCTION store.service_order_for_pod(BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION store.service_order_for_pod(BIGINT, TEXT) TO service_role;

-- ============================================================================
-- Public-RPC statement timeouts.
--   Bound the wall-clock of the anon/authenticated-reachable RPCs so a
--   pathological input or a slow plan can't tie up a backend indefinitely.
--   Reads are cheap (3s); the buy paths add wallet-debit latency headroom (5s).
-- ============================================================================

ALTER FUNCTION public.proxy_store_catalog_readonly(INTEGER, TIMESTAMPTZ, UUID) SET statement_timeout = '3s';
ALTER FUNCTION public.proxy_store_product_detail_readonly(TEXT) SET statement_timeout = '3s';
ALTER FUNCTION public.proxy_store_my_entitlements_readonly() SET statement_timeout = '3s';
ALTER FUNCTION public.proxy_store_my_orders_readonly(INTEGER, TIMESTAMPTZ, BIGINT) SET statement_timeout = '3s';
ALTER FUNCTION public.proxy_store_buy(TEXT, UUID) SET statement_timeout = '5s';
ALTER FUNCTION public.proxy_store_buy_physical(UUID, BIGINT, JSONB, UUID) SET statement_timeout = '5s';
