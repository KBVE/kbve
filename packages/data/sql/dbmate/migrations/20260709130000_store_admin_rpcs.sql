-- migrate:up

-- Phase 1: staff-driven product/variant management. These are service_role
-- internals; the Axum transport enforces forum.is_staff before calling them,
-- exactly like the mc_lot staff surface. No public/PostgREST wrappers.

DO $$
BEGIN
    IF to_regclass('store.product_variant') IS NULL THEN
        RAISE EXCEPTION 'missing store.product_variant — apply store_variants first';
    END IF;
END
$$;

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
            status      = excluded.status
    RETURNING product_id INTO v_id;
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
    UPDATE store.product SET status = p_status WHERE product_id = p_product_id;
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
    RETURNING variant_id INTO v_id;
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

NOTIFY pgrst, 'reload schema';
