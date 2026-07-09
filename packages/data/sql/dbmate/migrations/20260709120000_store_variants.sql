-- migrate:up

-- Phase 1: product variants + variant-aware catalog/detail. A variant is a
-- concrete SKU of a product (e.g. shirt size L / black) priced in credits with
-- optional finite stock. Digital products need no variant; physical/both
-- products sell variants.

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
    sku         TEXT NOT NULL UNIQUE CHECK (sku ~ '^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$'),
    attributes  JSONB NOT NULL DEFAULT '{}'::jsonb
                CHECK (jsonb_typeof(attributes) = 'object'),
    price       BIGINT NOT NULL CHECK (price >= 0),
    -- NULL stock = unlimited (digital / print-on-demand). Finite stock is
    -- decremented atomically at purchase and can never go negative.
    stock       BIGINT CHECK (stock IS NULL OR stock >= 0),
    status      TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'hidden', 'retired')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX store_product_variant_active_idx
    ON store.product_variant (product_id)
    WHERE status = 'active';

COMMENT ON TABLE store.product_variant IS
    'Concrete purchasable SKUs of a store.product. Priced in credits. NULL stock = unlimited.';

-- ============================================================================
-- public.proxy_store_catalog_readonly — replace to add fulfillment + count.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.proxy_store_catalog_readonly()
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
     ORDER BY p.created_at DESC, p.product_id DESC;
$$;
ALTER FUNCTION public.proxy_store_catalog_readonly() OWNER TO service_role;
REVOKE ALL ON FUNCTION public.proxy_store_catalog_readonly() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.proxy_store_catalog_readonly() TO anon, authenticated, service_role;

-- ============================================================================
-- public.proxy_store_product_detail_readonly — product + active variants.
-- ============================================================================

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

NOTIFY pgrst, 'reload schema';

-- migrate:down

DROP FUNCTION IF EXISTS public.proxy_store_product_detail_readonly(TEXT);

CREATE OR REPLACE FUNCTION public.proxy_store_catalog_readonly()
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
