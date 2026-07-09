-- migrate:up

-- Phase 2: physical/both purchase. Debits credits (same rail as digital),
-- decrements finite stock atomically, optionally mints a one-per-account
-- digital twin (fulfillment='both'), and records a 'paid' order. Idempotent
-- on idempotency_key via store.order's unique constraint.

DO $$
BEGIN
    IF to_regclass('store.order') IS NULL THEN
        RAISE EXCEPTION 'missing store.order — apply store_orders first';
    END IF;
END
$$;

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
    v_existing  BIGINT;
    v_ledger_id BIGINT;
    v_twin_id   UUID;
    v_order_id  BIGINT;
BEGIN
    IF p_account IS NULL OR p_variant_id IS NULL OR p_idempotency_key IS NULL THEN
        RAISE EXCEPTION 'account, variant_id and idempotency_key are required'
            USING ERRCODE = '22004';
    END IF;
    IF v_qty <= 0 THEN
        RAISE EXCEPTION 'qty must be positive' USING ERRCODE = '22023';
    END IF;

    -- Serialize concurrent buys of the same (account, variant).
    PERFORM pg_advisory_xact_lock(
        hashtextextended('store.service_buy_physical:' || p_account::text || ':' || p_variant_id::text, 0)
    );

    -- Idempotent replay: an order with this key already settled.
    SELECT order_id INTO v_existing
      FROM store.order WHERE idempotency_key = p_idempotency_key;
    IF v_existing IS NOT NULL THEN
        RETURN v_existing;
    END IF;

    SELECT * INTO v_variant
      FROM store.product_variant
     WHERE variant_id = p_variant_id AND status = 'active';
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

    v_amount := v_variant.price * v_qty;

    -- Atomic stock decrement for finite stock (NULL = unlimited).
    IF v_variant.stock IS NOT NULL THEN
        UPDATE store.product_variant
           SET stock = stock - v_qty, updated_at = now()
         WHERE variant_id = p_variant_id AND stock >= v_qty;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'variant % out of stock', p_variant_id
                USING ERRCODE = 'P1020';
        END IF;
    END IF;

    -- Authoritative credit debit (skips for a 0-credit variant).
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
                jsonb_build_object(
                    'product_id', v_product.product_id,
                    'title',      v_product.title,
                    'asset_ref',  v_product.asset_ref
                ),
                'held', 'store',
                jsonb_build_object('product_id', v_product.product_id,
                                   'slug', v_product.slug, 'twin', true)
            )
            RETURNING id INTO v_twin_id;

            INSERT INTO inventory.transition (item_id, from_state, to_state, actor, reason, metadata)
            VALUES (v_twin_id, 'transit_in', 'held', 'store', 'store_purchase_twin',
                    jsonb_build_object('product_id', v_product.product_id, 'slug', v_product.slug));
        END IF;
    END IF;

    INSERT INTO store.order (
        account_id, product_id, variant_id, qty, credits_amount,
        ledger_id, twin_item_id, status, shipping_address, idempotency_key
    ) VALUES (
        p_account, v_product.product_id, p_variant_id, v_qty, v_amount,
        v_ledger_id, v_twin_id, 'paid',
        COALESCE(p_shipping_address, '{}'::jsonb), p_idempotency_key
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

-- Public authenticated wrapper.
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

-- Caller-scoped order history.
CREATE OR REPLACE FUNCTION public.proxy_store_my_orders_readonly()
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
BEGIN
    RETURN QUERY
    SELECT o.order_id, o.product_id, o.variant_id, o.qty, o.credits_amount,
           o.status, o.tracking, o.created_at, o.updated_at
      FROM store.order o
     WHERE o.account_id = v_account
     ORDER BY o.created_at DESC, o.order_id DESC;
END;
$$;
ALTER FUNCTION public.proxy_store_my_orders_readonly() OWNER TO service_role;
REVOKE ALL ON FUNCTION public.proxy_store_my_orders_readonly() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proxy_store_my_orders_readonly() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- migrate:down

DROP FUNCTION IF EXISTS public.proxy_store_my_orders_readonly();
DROP FUNCTION IF EXISTS public.proxy_store_buy_physical(UUID, BIGINT, JSONB, UUID);
DROP FUNCTION IF EXISTS store.service_buy_physical(UUID, UUID, BIGINT, JSONB, UUID);

NOTIFY pgrst, 'reload schema';
