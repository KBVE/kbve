-- migrate:up

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
    variant_id       UUID REFERENCES store.product_variant(variant_id),
    qty              BIGINT NOT NULL DEFAULT 1 CHECK (qty > 0),
    credits_amount   BIGINT NOT NULL CHECK (credits_amount >= 0),
    ledger_id        BIGINT,
    twin_item_id     UUID,
    status           store.order_status NOT NULL DEFAULT 'paid',
    shipping_address JSONB NOT NULL DEFAULT '{}'::jsonb
                     CHECK (jsonb_typeof(shipping_address) = 'object'),
    tracking         JSONB NOT NULL DEFAULT '{}'::jsonb
                     CHECK (jsonb_typeof(tracking) = 'object'),
    idempotency_key  UUID NOT NULL UNIQUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
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
    IF v_qty > 1000 THEN
        RAISE EXCEPTION 'qty too large (max 1000)' USING ERRCODE = '22023';
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtextextended('store.service_buy_physical:' || p_account::text || ':' || p_variant_id::text, 0)
    );

    -- Idempotent replay: same key must describe the same order, else raise so
    -- a client bug (reused key, different variant/qty) is loud, not silent.
    SELECT * INTO v_existing FROM store.order WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
        IF v_existing.account_id <> p_account
           OR v_existing.variant_id IS DISTINCT FROM p_variant_id
           OR v_existing.qty <> v_qty THEN
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
    v_currency  wallet.currency_kind;
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

    SELECT currency INTO v_currency FROM store.product WHERE product_id = v_order.product_id;

    IF v_order.credits_amount > 0 THEN
        v_refund_id := wallet.service_credit(
            v_order.account_id, v_currency, v_order.credits_amount,
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
ALTER FUNCTION store.service_list_orders(store.order_status, INTEGER, BIGINT) ROWS 100;
REVOKE ALL ON FUNCTION store.service_list_orders(store.order_status, INTEGER, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION store.service_list_orders(store.order_status, INTEGER, BIGINT) TO service_role;

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
