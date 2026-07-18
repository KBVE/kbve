-- ============================================================================
-- STORE CORE — schema, order_status enum, catalog/order/topup tables, indexes,
-- and the order_event append-only trigger.
--
-- Reference mirror of the collapsed dbmate migrations:
--   ../../dbmate/migrations/20260708120000_store_schema_init.sql
--   ../../dbmate/migrations/20260709165000_wallet_source_kind_topup.sql
--   ../../dbmate/migrations/20260709170000_store_topup_pod.sql
-- Hand-authored review surface — do not run directly against the database;
-- promote changes into a new dbmate migration when ready. Functions live in
-- store_rpcs.sql (except the order_event mutation-block trigger, which lives
-- here beside the table it guards, matching the wallet_core convention).
--
-- Mental model:
--   The store is the PRIMARY (mint) market. A purchase debits credits via
--   wallet.service_debit (source_kind='purchase') and mints an inventory.item
--   (kind='store_product', ref=slug). Ownership lives in inventory — never a
--   separate entitlement table — so a store product is immediately listable
--   and tradeable on the existing wallet marketplace (the SECONDARY market).
--
-- Cross-schema dependency:
--   wallet.source_kind gains the value 'topup' in the wallet enum migration
--   (20260709165000_wallet_source_kind_topup.sql). It is mirrored in
--   wallet_core.sql — not duplicated here — and store.service_apply_topup
--   credits with source_kind='topup'.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS store;
GRANT USAGE ON SCHEMA store TO service_role;

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE store.order_status AS ENUM (
    'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'
);

-- ============================================================================
-- TABLE: store.product — the catalog. One row per thing for sale.
--   A purchase mints inventory.item(kind='store_product', ref=slug).
-- ============================================================================

-- gen_random_uuid() is unqualified on purpose (pg_catalog core, PG13+).
-- asset_ref is PUBLIC by contract (anon-readable) — keep it client-safe.
-- price >= 0: price 0 is a free product; service_buy skips the debit.
CREATE TABLE store.product (
    product_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug        TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
    title       TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 128),
    description TEXT,
    price       BIGINT NOT NULL CHECK (price >= 0),
    currency    wallet.currency_kind NOT NULL DEFAULT 'credits',
    fulfillment TEXT NOT NULL DEFAULT 'digital'
                CHECK (fulfillment IN ('digital', 'physical', 'both')),
    asset_ref   JSONB NOT NULL DEFAULT '{}'::jsonb
                CHECK (jsonb_typeof(asset_ref) = 'object'),
    status      TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'hidden', 'retired')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX store_product_active_idx
    ON store.product (created_at DESC, product_id DESC)
    WHERE status = 'active';

COMMENT ON TABLE store.product IS
    'Store catalog. Fixed-price products. A purchase mints inventory.item(kind=store_product, ref=slug); ownership lives in inventory, not here. asset_ref is public (anon-readable).';

-- Hard invariant: at most one owned copy per (account, store product).
-- Backstops the ownership dupe-guard against a concurrent double-mint.
CREATE UNIQUE INDEX inventory_item_store_product_owned_uq
    ON inventory.item (owner_account, ref)
    WHERE kind = 'store_product' AND state IN ('held', 'listing_escrow');
-- Read path for proxy_store_my_entitlements_readonly (owner + created_at DESC).
CREATE INDEX inventory_item_store_entitlements_read_idx
    ON inventory.item (owner_account, created_at DESC, id DESC)
    WHERE kind = 'store_product' AND state IN ('held', 'listing_escrow');

-- ============================================================================
-- TABLE: store.product_variant — concrete purchasable SKUs of a product.
--   Priced in credits (parent product currency). NULL stock = unlimited.
-- ============================================================================

CREATE TABLE store.product_variant (
    variant_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id  UUID NOT NULL REFERENCES store.product(product_id) ON DELETE CASCADE,
    sku         TEXT NOT NULL UNIQUE CHECK (sku ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'),
    attributes  JSONB NOT NULL DEFAULT '{}'::jsonb
                CHECK (jsonb_typeof(attributes) = 'object'),
    price       BIGINT NOT NULL CHECK (price >= 0),   -- credits (parent currency)
    stock       BIGINT CHECK (stock IS NULL OR stock >= 0),   -- NULL = unlimited
    status      TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'hidden', 'retired')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Serves the detail RPC's (product_id, status='active' ORDER BY created_at)
-- and the catalog variant-count lateral.
CREATE INDEX store_product_variant_active_product_created_idx
    ON store.product_variant (product_id, created_at, variant_id)
    WHERE status = 'active';

COMMENT ON TABLE store.product_variant IS
    'Concrete purchasable SKUs of a store.product. Priced in credits (parent product currency). NULL stock = unlimited.';

-- ============================================================================
-- TABLE: store.order — physical/both orders. Born 'paid'.
--   pod_ref carries the print-on-demand provider's external id/status.
-- ============================================================================

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
    pod_ref          JSONB NOT NULL DEFAULT '{}'::jsonb
                     CHECK (jsonb_typeof(pod_ref) = 'object'),
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

-- ============================================================================
-- TABLE: store.order_event — append-only order state journal.
--   BEFORE UPDATE/DELETE trigger blocks mutation.
-- ============================================================================

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
-- TABLE: store.topup — Stripe credit purchases (the credit on-ramp).
--   Idempotent on stripe_event_id; credits via wallet.service_credit('topup').
-- ============================================================================

CREATE TABLE store.topup (
    topup_id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id        UUID NOT NULL REFERENCES wallet.account(id),
    stripe_event_id   TEXT NOT NULL UNIQUE,   -- idempotency on the webhook
    stripe_session_id TEXT,
    credits_granted   BIGINT NOT NULL CHECK (credits_granted > 0),
    amount_cents      BIGINT NOT NULL CHECK (amount_cents >= 0),
    currency_fiat     TEXT NOT NULL DEFAULT 'usd',
    ledger_id         BIGINT,
    status            TEXT NOT NULL DEFAULT 'completed'
                      CHECK (status IN ('completed', 'refunded')),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX store_topup_account_idx ON store.topup (account_id, created_at DESC);

-- A Checkout Session must never credit twice, even across distinct event ids.
CREATE UNIQUE INDEX store_topup_stripe_session_uq
    ON store.topup (stripe_session_id)
    WHERE stripe_session_id IS NOT NULL;

COMMENT ON TABLE store.topup IS
    'Stripe credit purchases. Idempotent on stripe_event_id. Credits the wallet via wallet.service_credit(source_kind=topup).';
