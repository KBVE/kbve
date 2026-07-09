-- migrate:up

-- Phase 2: staff fulfillment + refunds. service_role internals; the Axum
-- transport enforces forum.is_staff. Advance validates the status machine;
-- refund credits back, restores finite stock, consumes any digital twin.

DO $$
BEGIN
    IF to_regprocedure('store.service_buy_physical(uuid, uuid, bigint, jsonb, uuid)') IS NULL THEN
        RAISE EXCEPTION 'missing store.service_buy_physical — apply store_buy_physical first';
    END IF;
END
$$;

-- Legal transitions:
--   paid → processing, processing → shipped, shipped → delivered;
--   paid|processing|shipped → cancelled. Anything else raises.
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

    v_legal := (v_from = 'paid'       AND p_to_status IN ('processing', 'cancelled'))
            OR (v_from = 'processing' AND p_to_status IN ('shipped', 'cancelled'))
            OR (v_from = 'shipped'    AND p_to_status IN ('delivered', 'cancelled'));
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
    VALUES (p_order_id, v_from, p_to_status, 'staff', p_note,
            COALESCE(p_tracking, '{}'::jsonb));
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
    v_order    store.order%ROWTYPE;
    v_currency wallet.currency_kind;
    v_refund_id BIGINT;
BEGIN
    SELECT * INTO v_order FROM store.order WHERE order_id = p_order_id FOR UPDATE;
    IF v_order.order_id IS NULL THEN
        RAISE EXCEPTION 'order % not found', p_order_id USING ERRCODE = 'P1001';
    END IF;
    IF v_order.status = 'refunded' THEN
        RETURN;  -- idempotent
    END IF;

    SELECT currency INTO v_currency FROM store.product WHERE product_id = v_order.product_id;

    IF v_order.credits_amount > 0 THEN
        v_refund_id := wallet.service_credit(
            v_order.account_id,
            v_currency,
            v_order.credits_amount,
            'refund'::wallet.source_kind,
            COALESCE(p_reason, 'store order refund'),
            'store_refund',
            v_order.order_id,
            gen_random_uuid()
        );
    END IF;

    -- Restore finite stock.
    IF v_order.variant_id IS NOT NULL THEN
        UPDATE store.product_variant
           SET stock = stock + v_order.qty, updated_at = now()
         WHERE variant_id = v_order.variant_id AND stock IS NOT NULL;
    END IF;

    -- Revoke the digital twin, if any.
    IF v_order.twin_item_id IS NOT NULL THEN
        UPDATE inventory.item SET state = 'consumed', updated_at = now()
         WHERE id = v_order.twin_item_id AND state = 'held';
        IF FOUND THEN
            INSERT INTO inventory.transition (item_id, from_state, to_state, actor, reason, metadata)
            VALUES (v_order.twin_item_id, 'held', 'consumed', 'store', 'refund_revoke_twin',
                    jsonb_build_object('order_id', p_order_id));
        END IF;
    END IF;

    UPDATE store.order SET status = 'refunded', updated_at = now()
     WHERE order_id = p_order_id;

    INSERT INTO store.order_event (order_id, from_status, to_status, actor, note, metadata)
    VALUES (p_order_id, v_order.status, 'refunded', 'staff',
            COALESCE(p_reason, 'refund'),
            jsonb_build_object('refund_ledger_id', v_refund_id,
                               'credits_amount', v_order.credits_amount));
END;
$$;
ALTER FUNCTION store.service_refund_order(BIGINT, TEXT) OWNER TO service_role;
REVOKE ALL ON FUNCTION store.service_refund_order(BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION store.service_refund_order(BIGINT, TEXT) TO service_role;

-- Staff order queue (service_role; transport gates on forum.is_staff).
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
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT o.order_id, o.account_id, o.product_id, o.variant_id, o.qty,
           o.credits_amount, o.status, o.shipping_address, o.tracking,
           o.created_at, o.updated_at
      FROM store.order o
     WHERE (p_status IS NULL OR o.status = p_status)
       AND (p_before_id IS NULL OR o.order_id < p_before_id)
     ORDER BY o.order_id DESC
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
$$;
ALTER FUNCTION store.service_list_orders(store.order_status, INTEGER, BIGINT) OWNER TO service_role;
REVOKE ALL ON FUNCTION store.service_list_orders(store.order_status, INTEGER, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION store.service_list_orders(store.order_status, INTEGER, BIGINT) TO service_role;

NOTIFY pgrst, 'reload schema';

-- migrate:down

DROP FUNCTION IF EXISTS store.service_list_orders(store.order_status, INTEGER, BIGINT);
DROP FUNCTION IF EXISTS store.service_refund_order(BIGINT, TEXT);
DROP FUNCTION IF EXISTS store.service_advance_order(BIGINT, store.order_status, JSONB, TEXT);

NOTIFY pgrst, 'reload schema';
