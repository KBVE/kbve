-- migrate:up

-- Read surface for store.purchase.
--
-- store."order" rows are only written by store.service_buy_physical, so an
-- account that has only bought digital products has an empty order history
-- while still owning the items. The receipts live in store.purchase with no
-- proxy to read them; this adds one, mirroring
-- proxy_store_my_orders_readonly (caller-scoped, keyset-paginated, STABLE,
-- SECURITY DEFINER with a pinned empty search_path).
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

-- migrate:down

DROP FUNCTION IF EXISTS public.proxy_store_my_purchases_readonly(INTEGER, TIMESTAMPTZ, BIGINT);
