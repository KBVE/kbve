-- migrate:up

-- Phase 4: print-on-demand fulfillment. A physical order can be submitted to a
-- POD provider (Printful/Printify); its external id + status ride on
-- store.order.pod_ref. Shipment webhooks advance the order to 'shipped'. No
-- new order states — POD slots into the Phase 2 status pipeline.

DO $$
BEGIN
    IF to_regclass('store.order') IS NULL THEN
        RAISE EXCEPTION 'missing store.order — apply store_orders first';
    END IF;
END
$$;

ALTER TABLE store.order
    ADD COLUMN IF NOT EXISTS pod_ref JSONB NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(pod_ref) = 'object');

-- Attach / update the POD reference (external order id, provider, status).
CREATE OR REPLACE FUNCTION store.service_attach_pod_ref(
    p_order_id BIGINT,
    p_pod_ref  JSONB
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    UPDATE store.order
       SET pod_ref = COALESCE(p_pod_ref, '{}'::jsonb), updated_at = now()
     WHERE order_id = p_order_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'order % not found', p_order_id USING ERRCODE = 'P1001';
    END IF;

    INSERT INTO store.order_event (order_id, from_status, to_status, actor, note, metadata)
    SELECT p_order_id, o.status, o.status, 'pod', 'pod_ref attached', COALESCE(p_pod_ref, '{}'::jsonb)
      FROM store.order o WHERE o.order_id = p_order_id;
END;
$$;
ALTER FUNCTION store.service_attach_pod_ref(BIGINT, JSONB) OWNER TO service_role;
REVOKE ALL ON FUNCTION store.service_attach_pod_ref(BIGINT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION store.service_attach_pod_ref(BIGINT, JSONB) TO service_role;

-- Order payload the POD adapter needs to place a fulfillment order. Only a
-- fulfillable physical/both order in paid|processing is eligible; anything
-- else raises so a bad adapter call can't submit an invalid order.
CREATE OR REPLACE FUNCTION store.service_order_for_pod(p_order_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_payload JSONB;
BEGIN
    SELECT jsonb_build_object(
        'order_id',         o.order_id,
        'qty',              o.qty,
        'status',           o.status,
        'shipping_address', o.shipping_address,
        'pod_ref',          o.pod_ref,
        'sku',              v.sku,
        'attributes',       v.attributes,
        'product_slug',     p.slug,
        'product_title',    p.title
    )
      INTO v_payload
      FROM store.order o
      JOIN store.product p ON p.product_id = o.product_id
      LEFT JOIN store.product_variant v ON v.variant_id = o.variant_id
     WHERE o.order_id = p_order_id
       AND o.status IN ('paid', 'processing')
       AND p.fulfillment IN ('physical', 'both');
    IF v_payload IS NULL THEN
        RAISE EXCEPTION 'order % not eligible for POD fulfillment', p_order_id
            USING ERRCODE = 'P1001';
    END IF;
    RETURN v_payload;
END;
$$;
ALTER FUNCTION store.service_order_for_pod(BIGINT) OWNER TO service_role;
REVOKE ALL ON FUNCTION store.service_order_for_pod(BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION store.service_order_for_pod(BIGINT) TO service_role;

NOTIFY pgrst, 'reload schema';

-- migrate:down

DROP FUNCTION IF EXISTS store.service_order_for_pod(BIGINT);
DROP FUNCTION IF EXISTS store.service_attach_pod_ref(BIGINT, JSONB);
ALTER TABLE store.order DROP COLUMN IF EXISTS pod_ref;

NOTIFY pgrst, 'reload schema';
