-- migrate:up

-- Phase 2: physical orders. A physical/both purchase debits credits (same rail
-- as digital) then records an order that needs async fulfillment. Because the
-- debit already succeeded, an order is born 'paid' — there is no 'pending'
-- (a failed debit means no order row exists, since debit + insert share a txn).

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

COMMENT ON TABLE store.order IS
    'Physical/both store orders. Born paid (debit precedes insert in one txn). Fulfillment advances status; refunds credit back and restore stock.';

-- Append-only event log. Mirrors inventory.transition: INSERT only.
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

CREATE INDEX store_order_event_order_idx
    ON store.order_event (order_id, created_at);

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

NOTIFY pgrst, 'reload schema';

-- migrate:down

DROP TRIGGER IF EXISTS store_order_event_no_update ON store.order_event;
DROP FUNCTION IF EXISTS store.order_event_block_mutation();
DROP TABLE IF EXISTS store.order_event;
DROP TABLE IF EXISTS store.order;
DROP TYPE IF EXISTS store.order_status;

NOTIFY pgrst, 'reload schema';
