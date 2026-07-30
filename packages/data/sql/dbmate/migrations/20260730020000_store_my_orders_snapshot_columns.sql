-- migrate:up

-- Expose the order's buy-time snapshot columns to the caller.
--
-- store."order" already stores product_slug / product_title / variant_sku /
-- unit_price / currency / fulfillment as immutable receipt snapshots, but
-- proxy_store_my_orders_readonly returned only ids and totals, so a client
-- could render "Order #12" and nothing about WHAT was bought without a
-- second catalog round-trip — which would also read the LIVE product row
-- and so lie after a rename or reprice.
--
-- DROP + CREATE rather than CREATE OR REPLACE: the RETURNS TABLE signature
-- changes, and Postgres refuses to replace a function's return type.
DROP FUNCTION IF EXISTS public.proxy_store_my_orders_readonly(INTEGER, TIMESTAMPTZ, BIGINT);

CREATE FUNCTION public.proxy_store_my_orders_readonly(
    p_limit             INTEGER     DEFAULT 50,
    p_before_created_at TIMESTAMPTZ DEFAULT NULL,
    p_before_id         BIGINT      DEFAULT NULL
)
RETURNS TABLE (
    order_id       BIGINT,
    product_id     UUID,
    variant_id     UUID,
    qty            BIGINT,
    product_slug   TEXT,
    product_title  TEXT,
    variant_sku    TEXT,
    unit_price     BIGINT,
    currency       TEXT,
    fulfillment    TEXT,
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
    SELECT o.order_id, o.product_id, o.variant_id, o.qty,
           o.product_slug, o.product_title, o.variant_sku, o.unit_price,
           o.currency::text, o.fulfillment, o.credits_amount,
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
ALTER FUNCTION public.proxy_store_my_orders_readonly(INTEGER, TIMESTAMPTZ, BIGINT) SET statement_timeout = '3s';
REVOKE ALL ON FUNCTION public.proxy_store_my_orders_readonly(INTEGER, TIMESTAMPTZ, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proxy_store_my_orders_readonly(INTEGER, TIMESTAMPTZ, BIGINT) TO authenticated, service_role;

-- migrate:down

DROP FUNCTION IF EXISTS public.proxy_store_my_orders_readonly(INTEGER, TIMESTAMPTZ, BIGINT);

CREATE FUNCTION public.proxy_store_my_orders_readonly(
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
ALTER FUNCTION public.proxy_store_my_orders_readonly(INTEGER, TIMESTAMPTZ, BIGINT) SET statement_timeout = '3s';
REVOKE ALL ON FUNCTION public.proxy_store_my_orders_readonly(INTEGER, TIMESTAMPTZ, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proxy_store_my_orders_readonly(INTEGER, TIMESTAMPTZ, BIGINT) TO authenticated, service_role;
