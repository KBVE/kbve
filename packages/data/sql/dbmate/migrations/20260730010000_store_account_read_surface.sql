-- migrate:up

-- Read surface for the "what did I buy / what do I own" dashboard pages.
--
-- Two halves of one gap. A digital buy writes store.purchase + inventory.item
-- and NEVER a store."order" row (only store.service_buy_physical writes those),
-- so:
--   1. digital receipts had no read proxy at all — an account could own items,
--      have been charged, and still read an empty order history;
--   2. physical orders had a proxy, but it returned only ids and totals even
--      though store."order" snapshots product_slug / product_title /
--      variant_sku / unit_price / currency / fulfillment at buy time. Without
--      them a client can only render "Order #12", and the workaround — reading
--      the live product row — defeats the snapshots, which exist so a receipt
--      does not change after a rename / reprice / retire.
--
-- Inventory needs nothing here: public.proxy_inventory_list_held already
-- covers the caller's held + listing_escrow rows.

-- ---------------------------------------------------------------------------
-- 1. Digital receipts. Mirrors proxy_store_my_orders_readonly: caller-scoped,
--    keyset-paginated, STABLE SECURITY DEFINER with a pinned empty search_path.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.proxy_store_my_purchases_readonly(
    p_limit             INTEGER     DEFAULT 50,
    p_before_created_at TIMESTAMPTZ DEFAULT NULL,
    p_before_id         BIGINT      DEFAULT NULL
)
RETURNS TABLE (
    purchase_id BIGINT,
    product_id  UUID,
    slug        TEXT,
    title       TEXT,
    item_id     UUID,
    price       BIGINT,
    currency    TEXT,
    result_kind TEXT,
    ledger_id   BIGINT,
    created_at  TIMESTAMPTZ
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
    SELECT pu.purchase_id, pu.product_id, pr.slug, pr.title, pu.item_id,
           pu.price, pu.currency::text, pu.result_kind, pu.ledger_id,
           pu.created_at
      FROM store.purchase pu
      JOIN store.product pr ON pr.product_id = pu.product_id
     WHERE pu.account_id = v_account
       AND (p_before_created_at IS NULL
            OR pu.created_at < p_before_created_at
            OR (pu.created_at = p_before_created_at AND pu.purchase_id < p_before_id))
     ORDER BY pu.created_at DESC, pu.purchase_id DESC
     LIMIT v_limit;
END;
$$;
ALTER FUNCTION public.proxy_store_my_purchases_readonly(INTEGER, TIMESTAMPTZ, BIGINT) OWNER TO service_role;
ALTER FUNCTION public.proxy_store_my_purchases_readonly(INTEGER, TIMESTAMPTZ, BIGINT) ROWS 50;
ALTER FUNCTION public.proxy_store_my_purchases_readonly(INTEGER, TIMESTAMPTZ, BIGINT) SET statement_timeout = '3s';
REVOKE ALL ON FUNCTION public.proxy_store_my_purchases_readonly(INTEGER, TIMESTAMPTZ, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proxy_store_my_purchases_readonly(INTEGER, TIMESTAMPTZ, BIGINT) TO authenticated, service_role;
COMMENT ON FUNCTION public.proxy_store_my_purchases_readonly(INTEGER, TIMESTAMPTZ, BIGINT) IS
    'PUBLIC store proxy. Caller-scoped (auth.uid()) digital purchase receipts, newest first. Complements proxy_store_my_orders_readonly, which only covers physical/both orders.';

-- ---------------------------------------------------------------------------
-- 2. Order snapshots. DROP + CREATE rather than CREATE OR REPLACE: the
--    RETURNS TABLE signature changes, and Postgres refuses to replace a
--    function's return type.
-- ---------------------------------------------------------------------------
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

DROP FUNCTION IF EXISTS public.proxy_store_my_purchases_readonly(INTEGER, TIMESTAMPTZ, BIGINT);

-- Restore the pre-snapshot order proxy verbatim.
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
