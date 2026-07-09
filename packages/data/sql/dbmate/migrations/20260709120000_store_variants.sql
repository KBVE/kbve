-- migrate:up

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
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Serves the detail RPC's (product_id, status='active' ORDER BY created_at)
-- and the catalog variant-count lateral.
CREATE INDEX store_product_variant_active_product_created_idx
    ON store.product_variant (product_id, created_at, variant_id)
    WHERE status = 'active';

COMMENT ON TABLE store.product_variant IS
    'Concrete purchasable SKUs of a store.product. Priced in credits (parent product currency). NULL stock = unlimited.';

-- ============================================================================
-- Catalog / detail read proxies. DROP first: the Phase 0 catalog function has
-- a narrower RETURNS TABLE, and CREATE OR REPLACE cannot change return columns.
-- ============================================================================

DROP FUNCTION IF EXISTS public.proxy_store_catalog_readonly();

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
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
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
    UPDATE store.product SET status = p_status, updated_at = now()
     WHERE product_id = p_product_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'store product % not found', p_product_id USING ERRCODE = 'P1001';
    END IF;
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
    UPDATE store.product_variant SET status = p_status, updated_at = now()
     WHERE variant_id = p_variant_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'store variant % not found', p_variant_id USING ERRCODE = 'P1001';
    END IF;
END;
$$;
ALTER FUNCTION store.service_set_variant_status(UUID, TEXT) OWNER TO service_role;
REVOKE ALL ON FUNCTION store.service_set_variant_status(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION store.service_set_variant_status(UUID, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';

-- migrate:down

DROP FUNCTION IF EXISTS store.service_set_variant_status(UUID, TEXT);
DROP FUNCTION IF EXISTS store.service_upsert_variant(UUID, TEXT, JSONB, BIGINT, BIGINT, TEXT);
DROP FUNCTION IF EXISTS store.service_set_product_status(UUID, TEXT);
DROP FUNCTION IF EXISTS store.service_upsert_product(TEXT, TEXT, TEXT, BIGINT, TEXT, JSONB, TEXT);
DROP FUNCTION IF EXISTS public.proxy_store_product_detail_readonly(TEXT);
DROP FUNCTION IF EXISTS public.proxy_store_catalog_readonly(INTEGER, TIMESTAMPTZ, UUID);

CREATE FUNCTION public.proxy_store_catalog_readonly()
RETURNS TABLE (
    product_id  UUID,
    slug        TEXT,
    title       TEXT,
    description TEXT,
    price       BIGINT,
    currency    wallet.currency_kind,
    asset_ref   JSONB,
    created_at  TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT p.product_id, p.slug, p.title, p.description,
           p.price, p.currency, p.asset_ref, p.created_at
      FROM store.product p
     WHERE p.status = 'active'
     ORDER BY p.created_at DESC, p.product_id DESC;
$$;
ALTER FUNCTION public.proxy_store_catalog_readonly() OWNER TO service_role;
REVOKE ALL ON FUNCTION public.proxy_store_catalog_readonly() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.proxy_store_catalog_readonly() TO anon, authenticated, service_role;

DROP TABLE IF EXISTS store.product_variant;

NOTIFY pgrst, 'reload schema';
