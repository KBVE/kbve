-- migrate:up

-- Store: a fixed-price storefront that mints inventory.item rows. The store
-- is the PRIMARY (mint) market; the existing wallet marketplace is the
-- SECONDARY (resale) market. A store purchase debits credits authoritatively
-- via wallet.service_debit (source_kind='purchase') and mints an
-- inventory.item, so anything bought here is immediately listable/tradeable
-- on the marketplace with no separate ownership model.

DO $$
BEGIN
    IF to_regprocedure(
        'wallet.service_debit(uuid, wallet.currency_kind, bigint, wallet.source_kind, text, text, bigint, uuid)'
    ) IS NULL THEN
        RAISE EXCEPTION 'missing wallet.service_debit — apply wallet schema first';
    END IF;
    IF to_regclass('inventory.item') IS NULL THEN
        RAISE EXCEPTION 'missing inventory.item — apply inventory schema first';
    END IF;
END
$$;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- private holds internal proxy helpers PostgREST never exposes. Normally
-- created by the marketplace migration that runs before this one; guarded
-- so this migration fails only on real dependency errors.
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO service_role;

CREATE SCHEMA IF NOT EXISTS store;
GRANT USAGE ON SCHEMA store TO service_role;

-- ============================================================================
-- TABLE: store.product — the catalog. One row per thing for sale.
--   A purchase mints inventory.item(kind='store_product', ref=slug).
-- ============================================================================

-- gen_random_uuid() is intentionally unqualified: it is a pg_catalog core
-- function (PG13+) that resolves regardless of search_path, matching the
-- inventory.item default. extensions.gen_random_uuid only exists when
-- pgcrypto aliases it, so qualifying would be the more fragile choice.
CREATE TABLE store.product (
    product_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug        TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
    title       TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 128),
    description TEXT,
    -- price >= 0: 0 is a valid free product; store.service_buy skips the
    -- debit for price 0 (wallet.service_debit rejects non-positive amounts).
    price       BIGINT NOT NULL CHECK (price >= 0),
    currency    wallet.currency_kind NOT NULL DEFAULT 'credits',
    -- fulfillment: how a purchase is delivered. Phase 0 is digital-only
    -- (mint inventory.item). physical|both drive the order pipeline in a
    -- later phase; the column exists now so the catalog is forward-compatible.
    fulfillment TEXT NOT NULL DEFAULT 'digital'
                CHECK (fulfillment IN ('digital', 'physical', 'both')),
    -- asset_ref is PUBLIC by contract: proxy_store_catalog_readonly returns
    -- it to anon. Keep it client-safe (e.g. render descriptor); never store
    -- internal asset paths, keys, or anti-cheat metadata here.
    asset_ref   JSONB NOT NULL DEFAULT '{}'::jsonb
                CHECK (jsonb_typeof(asset_ref) = 'object'),
    status      TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'hidden', 'retired')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX store_product_active_idx
    ON store.product (created_at DESC, product_id DESC)
    WHERE status = 'active';

COMMENT ON TABLE store.product IS
    'Store catalog. Fixed-price products. A purchase mints inventory.item(kind=store_product, ref=slug); ownership lives in inventory, not here. asset_ref is public (anon-readable).';

-- Hard invariant: at most one owned copy of a given store product per account.
-- Backstops the ownership dupe-guard in store.service_buy against a
-- concurrent double-mint race (both callers pass the SELECT check, both mint).
-- The whole buy runs in one txn, so a losing INSERT here rolls back its debit.
CREATE UNIQUE INDEX IF NOT EXISTS inventory_item_store_product_owned_uq
    ON inventory.item (owner_account, ref)
    WHERE kind = 'store_product' AND state IN ('held', 'listing_escrow');

-- Read path for proxy_store_my_entitlements_readonly (owner + created_at DESC).
-- Separate from the uniqueness guard above so the ORDER BY is index-served.
CREATE INDEX IF NOT EXISTS inventory_item_store_entitlements_read_idx
    ON inventory.item (owner_account, created_at DESC, id DESC)
    WHERE kind = 'store_product' AND state IN ('held', 'listing_escrow');

-- Seed the proof-of-concept product.
INSERT INTO store.product (slug, title, description, price, currency, asset_ref)
VALUES (
    'i-am-an-idiot',
    'I am an idiot',
    'A WebGL collectible card. Hidden until purchased for 10 credits.',
    10,
    'credits',
    jsonb_build_object('kind', 'webgl_card', 'variant', 'idiot')
)
ON CONFLICT (slug) DO NOTHING;

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
-- store.purchase — durable digital-purchase receipt. One row per
--   (account, idempotency_key): binds a purchase request to its minted item so
--   a replay returns the same item without re-charging, even after the item was
--   later sold / transferred / consumed. Complements (does not replace) the
--   one-owned-copy inventory unique index, which stays the business rule.
-- ============================================================================
CREATE TABLE store.purchase (
    purchase_id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id      UUID NOT NULL REFERENCES wallet.account(id),
    product_id      UUID NOT NULL REFERENCES store.product(product_id),
    item_id         UUID NOT NULL,
    price           BIGINT NOT NULL CHECK (price >= 0),
    currency        wallet.currency_kind NOT NULL,
    ledger_id       BIGINT,
    idempotency_key UUID NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (account_id, idempotency_key)
);
CREATE INDEX store_purchase_account_created_idx
    ON store.purchase (account_id, created_at DESC);
COMMENT ON TABLE store.purchase IS
    'Durable digital purchase receipts. Per (account, idempotency_key) result binding for replay-safe service_buy.';

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
BEGIN
    IF p_account IS NULL OR p_slug IS NULL OR p_idempotency_key IS NULL THEN
        RAISE EXCEPTION 'account, slug and idempotency_key are required'
            USING ERRCODE = '22004';
    END IF;

    -- Serialize concurrent buys of the same (account, product) so the
    -- ownership dupe-guard below is race-safe: the loser blocks here, then
    -- sees the existing item and returns it idempotently instead of double
    -- debiting. Taken BEFORE the debit. The unique index is the backstop.
    PERFORM pg_advisory_xact_lock(
        hashtextextended('store.service_buy:' || p_account::text || ':' || p_slug, 0)
    );

    SELECT * INTO v_product
      FROM store.product
     WHERE slug = p_slug AND status = 'active';
    IF v_product.product_id IS NULL THEN
        RAISE EXCEPTION 'store product % not found or not active', p_slug
            USING ERRCODE = 'P1001';
    END IF;

    -- Durable key idempotency: a recorded receipt returns the same item
    -- without re-charging, even if the item was later sold/transferred/
    -- consumed. Reusing a key for a DIFFERENT product is rejected.
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

    -- Dupe guard: one copy per account. held or escrowed both count as owned.
    SELECT id INTO v_existing
      FROM inventory.item
     WHERE owner_account = p_account
       AND kind = 'store_product'
       AND ref = p_slug
       AND state IN ('held', 'listing_escrow')
     LIMIT 1;
    IF v_existing IS NOT NULL THEN
        v_item_id := v_existing;
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
    -- already-owned paths), so a later replay returns this exact item.
    INSERT INTO store.purchase (
        account_id, product_id, item_id, price, currency, ledger_id, idempotency_key
    ) VALUES (
        p_account, v_product.product_id, v_item_id, v_product.price,
        v_product.currency, v_ledger_id, p_idempotency_key
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

NOTIFY pgrst, 'reload schema';

-- Phase 1: product variants + variant-aware catalog/detail + staff admin RPCs.
-- A variant is a concrete SKU of a product (e.g. shirt size L / black) priced
-- in credits (denominated in the parent product's currency) with optional
-- finite stock. Digital products need no variant; physical/both sell variants.

DO $$
BEGIN
    IF to_regclass('store.product') IS NULL THEN
        RAISE EXCEPTION 'missing store.product — apply store schema init first';
    END IF;
END
$$;

CREATE TABLE store.product_variant (
    variant_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id  UUID NOT NULL REFERENCES store.product(product_id) ON DELETE CASCADE,
    sku         TEXT NOT NULL UNIQUE CHECK (sku ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'),
    attributes  JSONB NOT NULL DEFAULT '{}'::jsonb
                CHECK (jsonb_typeof(attributes) = 'object'),
    price       BIGINT NOT NULL CHECK (price >= 0),   -- credits (parent currency)
    stock       BIGINT CHECK (stock IS NULL OR stock >= 0),   -- NULL = unlimited
    status      TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'hidden', 'retired')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Composite target so store.order can carry a (product_id, variant_id)
    -- FK: guarantees an order's variant always belongs to its product, even
    -- for direct/maintenance writes that bypass service_buy_physical.
    CONSTRAINT store_variant_product_variant_uq UNIQUE (product_id, variant_id)
);

-- Serves the detail RPC's (product_id, status='active' ORDER BY created_at)
-- and the catalog variant-count lateral.
CREATE INDEX store_product_variant_active_product_created_idx
    ON store.product_variant (product_id, created_at, variant_id)
    WHERE status = 'active';

COMMENT ON TABLE store.product_variant IS
    'Concrete purchasable SKUs of a store.product. Priced in credits (parent product currency). NULL stock = unlimited.';

-- ============================================================================
-- Catalog / detail read proxies.
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
                  FROM store.product_variant v
                 WHERE v.product_id = p.product_id AND v.status = 'active'),
               '[]'::jsonb
           ) AS variants
      FROM store.product p
     WHERE p.slug = p_slug AND p.status = 'active';
$$;
ALTER FUNCTION public.proxy_store_product_detail_readonly(TEXT) OWNER TO service_role;
REVOKE ALL ON FUNCTION public.proxy_store_product_detail_readonly(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.proxy_store_product_detail_readonly(TEXT) TO anon, authenticated, service_role;

-- ============================================================================
-- Staff admin RPCs. service_role-only; the Axum transport enforces
-- forum.is_staff before calling. No public/PostgREST wrappers.
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
    v_id UUID;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM store.product WHERE product_id = p_product_id) THEN
        RAISE EXCEPTION 'store product % not found', p_product_id USING ERRCODE = 'P1001';
    END IF;
    -- sku is globally unique; reject reusing one that belongs to another
    -- product (ON CONFLICT (sku) would otherwise silently keep the old
    -- product_id and mask the mistake).
    IF EXISTS (SELECT 1 FROM store.product_variant
                WHERE sku = p_sku AND product_id <> p_product_id) THEN
        RAISE EXCEPTION 'sku % already belongs to another product', p_sku
            USING ERRCODE = '23505';
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
        WHERE store.product_variant.attributes IS DISTINCT FROM excluded.attributes
           OR store.product_variant.price      IS DISTINCT FROM excluded.price
           OR store.product_variant.stock      IS DISTINCT FROM excluded.stock
           OR store.product_variant.status     IS DISTINCT FROM excluded.status
    RETURNING variant_id INTO v_id;
    IF v_id IS NULL THEN
        SELECT variant_id INTO v_id FROM store.product_variant WHERE sku = p_sku;
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

NOTIFY pgrst, 'reload schema';

-- Phase 2: physical orders + fulfillment + refunds. A physical/both purchase
-- debits credits (same rail as digital) then records a 'paid' order needing
-- async fulfillment. Debit + order insert share one txn, so a failed debit
-- means no order row exists — orders are born 'paid', never 'pending'.
--
-- Cancellation policy: cancelling a paid order means returning the money, so
-- cancellation is done via service_refund_order (status -> 'refunded'), which
-- credits back, restores stock, and revokes the digital twin atomically.
-- service_advance_order therefore only moves an order FORWARD through
-- fulfillment; it never strands an order in 'cancelled' with money captured.

DO $$
BEGIN
    IF to_regclass('store.product_variant') IS NULL THEN
        RAISE EXCEPTION 'missing store.product_variant — apply store_variants first';
    END IF;
END
$$;

CREATE TYPE store.order_status AS ENUM (
    'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'
);

CREATE TABLE store.order (
    order_id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id       UUID NOT NULL REFERENCES wallet.account(id),
    product_id       UUID NOT NULL REFERENCES store.product(product_id),
    variant_id       UUID,
    qty              BIGINT NOT NULL DEFAULT 1 CHECK (qty > 0),
    -- Immutable purchase snapshots. An order is a receipt: money + presentation
    -- fields are captured at buy time and never follow later catalog edits
    -- (rename / retire / reprice / currency change). Refunds use order.currency,
    -- never the live product row.
    currency         wallet.currency_kind NOT NULL DEFAULT 'credits',
    unit_price       BIGINT NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
    product_slug     TEXT,
    product_title    TEXT,
    variant_sku      TEXT,
    variant_attributes JSONB NOT NULL DEFAULT '{}'::jsonb
                     CHECK (jsonb_typeof(variant_attributes) = 'object'),
    credits_amount   BIGINT NOT NULL CHECK (credits_amount >= 0),
    ledger_id        BIGINT,
    twin_item_id     UUID,
    status           store.order_status NOT NULL DEFAULT 'paid',
    shipping_address JSONB NOT NULL DEFAULT '{}'::jsonb
                     CHECK (jsonb_typeof(shipping_address) = 'object'
                            AND octet_length(shipping_address::text) <= 16384),
    tracking         JSONB NOT NULL DEFAULT '{}'::jsonb
                     CHECK (jsonb_typeof(tracking) = 'object'
                            AND octet_length(tracking::text) <= 16384),
    idempotency_key  UUID NOT NULL UNIQUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Variant must belong to product_id (NULL variant allowed — PG skips the
    -- composite FK when any referencing column is NULL).
    CONSTRAINT store_order_product_variant_fk
        FOREIGN KEY (product_id, variant_id)
        REFERENCES store.product_variant (product_id, variant_id)
);

CREATE INDEX store_order_account_created_idx
    ON store.order (account_id, created_at DESC, order_id DESC);
CREATE INDEX store_order_open_idx
    ON store.order (status, updated_at)
    WHERE status IN ('paid', 'processing');
-- Serves the staff queue: filter by status, ORDER BY order_id DESC.
CREATE INDEX store_order_status_order_id_idx
    ON store.order (status, order_id DESC);

COMMENT ON TABLE store.order IS
    'Physical/both store orders. Born paid (debit precedes insert in one txn). advance_order moves forward; refund credits back + restores stock + revokes twin.';

CREATE TABLE store.order_event (
    event_id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id    BIGINT NOT NULL REFERENCES store.order(order_id) ON DELETE CASCADE,
    from_status store.order_status,
    to_status   store.order_status NOT NULL,
    actor       TEXT NOT NULL,
    note        TEXT,
    metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX store_order_event_order_idx ON store.order_event (order_id, created_at);

CREATE OR REPLACE FUNCTION store.order_event_block_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    RAISE EXCEPTION 'store.order_event is append-only' USING ERRCODE = '0A000';
END;
$$;
ALTER FUNCTION store.order_event_block_mutation() OWNER TO service_role;

CREATE TRIGGER store_order_event_no_update
    BEFORE UPDATE OR DELETE ON store.order_event
    FOR EACH ROW EXECUTE FUNCTION store.order_event_block_mutation();

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
    SELECT * INTO v_existing FROM store.order WHERE idempotency_key = p_idempotency_key;
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

    -- A physical order needs a real shipping address BEFORE money moves. An
    -- empty {} must never yield a paid, unfulfillable order. (Field-level
    -- validation of the address contract is enforced at the transport layer.)
    IF COALESCE(p_shipping_address, '{}'::jsonb) = '{}'::jsonb THEN
        RAISE EXCEPTION 'shipping_address is required for physical orders'
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
        credits_amount, ledger_id, twin_item_id, status, shipping_address, idempotency_key
    ) VALUES (
        p_account, v_product.product_id, p_variant_id, v_qty,
        v_product.currency, v_variant.price, v_product.slug, v_product.title,
        v_variant.sku, v_variant.attributes,
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
    v_order     store.order%ROWTYPE;
    v_refund_id BIGINT;
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

    IF v_order.variant_id IS NOT NULL THEN
        UPDATE store.product_variant
           SET stock = stock + v_order.qty, updated_at = now()
         WHERE variant_id = v_order.variant_id AND stock IS NOT NULL;
    END IF;

    IF v_order.twin_item_id IS NOT NULL THEN
        UPDATE inventory.item SET state = 'consumed', updated_at = now()
         WHERE id = v_order.twin_item_id AND state = 'held';
        IF FOUND THEN
            INSERT INTO inventory.transition (item_id, from_state, to_state, actor, reason, metadata)
            VALUES (v_order.twin_item_id, 'held', 'consumed', 'store', 'refund_revoke_twin',
                    jsonb_build_object('order_id', p_order_id));
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

-- Defense-in-depth: store/private tables are reachable only via SECURITY
-- DEFINER proxies (anon/authenticated have no schema USAGE). Explicitly revoke
-- any table access that project-wide DEFAULT PRIVILEGES might otherwise grant.
REVOKE ALL ON ALL TABLES IN SCHEMA store FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA private FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- migrate:down

DROP FUNCTION IF EXISTS store.service_list_orders(store.order_status, INTEGER, BIGINT);
DROP FUNCTION IF EXISTS store.service_refund_order(BIGINT, TEXT);
DROP FUNCTION IF EXISTS store.service_advance_order(BIGINT, store.order_status, JSONB, TEXT);
DROP FUNCTION IF EXISTS public.proxy_store_my_orders_readonly(INTEGER, TIMESTAMPTZ, BIGINT);
DROP FUNCTION IF EXISTS public.proxy_store_buy_physical(UUID, BIGINT, JSONB, UUID);
DROP FUNCTION IF EXISTS store.service_buy_physical(UUID, UUID, BIGINT, JSONB, UUID);
DROP TRIGGER IF EXISTS store_order_event_no_update ON store.order_event;
DROP FUNCTION IF EXISTS store.order_event_block_mutation();
DROP TABLE IF EXISTS store.order_event;
DROP TABLE IF EXISTS store.order;
DROP TYPE IF EXISTS store.order_status;

NOTIFY pgrst, 'reload schema';

DROP FUNCTION IF EXISTS store.service_set_variant_status(UUID, TEXT);
DROP FUNCTION IF EXISTS store.service_upsert_variant(UUID, TEXT, JSONB, BIGINT, BIGINT, TEXT);
DROP FUNCTION IF EXISTS store.service_set_product_status(UUID, TEXT);
DROP FUNCTION IF EXISTS store.service_upsert_product(TEXT, TEXT, TEXT, BIGINT, TEXT, JSONB, TEXT);
DROP FUNCTION IF EXISTS public.proxy_store_product_detail_readonly(TEXT);
DROP FUNCTION IF EXISTS public.proxy_store_catalog_readonly(INTEGER, TIMESTAMPTZ, UUID);

DROP TABLE IF EXISTS store.product_variant;

NOTIFY pgrst, 'reload schema';

DROP FUNCTION IF EXISTS public.proxy_store_buy(TEXT, UUID);
DROP FUNCTION IF EXISTS public.proxy_store_my_entitlements_readonly();
DROP FUNCTION IF EXISTS store.service_buy(UUID, TEXT, UUID);
DROP FUNCTION IF EXISTS private.proxy_store_caller_account();
DROP INDEX IF EXISTS inventory.inventory_item_store_product_owned_uq;
DROP TABLE IF EXISTS store.purchase;
DROP TABLE IF EXISTS store.product;
DROP SCHEMA IF EXISTS store;

NOTIFY pgrst, 'reload schema';
