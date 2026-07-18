-- ============================================================================
-- STORE CORE — schema, order_status enum, catalog/purchase/order/topup tables,
-- indexes, table grants, and the order_event append-only trigger.
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
-- TABLE: store.purchase — durable digital-purchase receipt.
--   One row per (account, idempotency_key): binds a purchase request to its
--   minted item so a replay returns the same item without re-charging, even
--   after the item was later sold / transferred / consumed. Complements (does
--   not replace) the one-owned-copy inventory unique index above.
-- ============================================================================

CREATE TABLE store.purchase (
    purchase_id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id      UUID NOT NULL REFERENCES wallet.account(id),
    product_id      UUID NOT NULL REFERENCES store.product(product_id),
    -- FK to the minted entitlement (RESTRICT: inventory items are state-machined,
    -- never hard-deleted) so a receipt can never point at a nonexistent item.
    item_id         UUID NOT NULL REFERENCES inventory.item(id),
    -- price is the amount ACTUALLY charged (0 for a free product or an
    -- already-owned no-op), never the mutable catalog price; ledger_id IS NULL
    -- <=> price = 0.
    price           BIGINT NOT NULL CHECK (price >= 0),
    currency        wallet.currency_kind NOT NULL,
    ledger_id       BIGINT,
    -- What the buy resolved to: a fresh mint vs. a lookup of an already-owned
    -- copy (no debit, no mint). Keeps the receipt honest for accounting.
    result_kind     TEXT NOT NULL DEFAULT 'minted'
                    CHECK (result_kind IN ('minted', 'already_owned')),
    idempotency_key UUID NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (account_id, idempotency_key)
);
CREATE INDEX store_purchase_account_created_idx
    ON store.purchase (account_id, created_at DESC);
COMMENT ON TABLE store.purchase IS
    'Durable digital purchase receipts. Per (account, idempotency_key) result binding for replay-safe service_buy.';

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
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Composite target so store.order can carry a (product_id, variant_id) FK:
    -- guarantees an order's variant always belongs to its product, even for
    -- direct/maintenance writes that bypass service_buy_physical.
    CONSTRAINT store_variant_product_variant_uq UNIQUE (product_id, variant_id)
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
    variant_id       UUID,
    qty              BIGINT NOT NULL DEFAULT 1 CHECK (qty > 0),
    -- Immutable purchase snapshots. An order is a receipt: money + presentation
    -- fields are captured at buy time and never follow later catalog edits
    -- (rename / retire / reprice / currency change). Refunds use order.currency,
    -- never the live product row.
    currency         wallet.currency_kind NOT NULL DEFAULT 'credits',
    unit_price       BIGINT NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
    product_slug     TEXT,
    product_title    TEXT,
    variant_sku      TEXT,
    variant_attributes JSONB NOT NULL DEFAULT '{}'::jsonb
                     CHECK (jsonb_typeof(variant_attributes) = 'object'),
    -- Snapshot of the product's fulfillment mode at buy time. POD eligibility
    -- reads THIS, never the live product row — a later catalog edit must not
    -- make an already-paid order ineligible for fulfillment.
    fulfillment      TEXT NOT NULL DEFAULT 'physical'
                     CHECK (fulfillment IN ('physical', 'both')),
    -- True only when this order decremented finite variant stock. A refund
    -- restores stock only when this is set, so a later NULL<->finite stock-mode
    -- change on the variant can't mis-restore (or fail to restore) inventory.
    stock_reserved   BOOLEAN NOT NULL DEFAULT false,
    credits_amount   BIGINT NOT NULL CHECK (credits_amount >= 0),
    ledger_id        BIGINT,
    twin_item_id     UUID,
    status           store.order_status NOT NULL DEFAULT 'paid',
    shipping_address JSONB NOT NULL DEFAULT '{}'::jsonb
                     CHECK (jsonb_typeof(shipping_address) = 'object'
                            AND octet_length(shipping_address::text) <= 16384),
    tracking         JSONB NOT NULL DEFAULT '{}'::jsonb
                     CHECK (jsonb_typeof(tracking) = 'object'
                            AND octet_length(tracking::text) <= 16384),
    -- Print-on-demand (Phase 4). pod_provider/pod_external_order_id are promoted
    -- from pod_ref into first-class columns so the external provider order id can
    -- be uniquely constrained; pod_ref keeps any provider-specific metadata.
    -- pod_submitted_at stamps a CLAIM; pod_claim_expires_at bounds it so a worker
    -- that crashes after claiming (before the provider accepts) can't strand the
    -- order — an expired claim is reclaimable. A claim is only permanent once
    -- pod_external_order_id is set (provider accepted).
    pod_ref          JSONB NOT NULL DEFAULT '{}'::jsonb
                     CHECK (jsonb_typeof(pod_ref) = 'object'),
    pod_provider          TEXT,
    pod_external_order_id TEXT,
    pod_status            TEXT,
    pod_submitted_at      TIMESTAMPTZ,
    pod_claim_expires_at  TIMESTAMPTZ,
    -- Dedupe identity is (account, idempotency_key): the advisory lock and the
    -- replay query are both account-scoped, so uniqueness must be too. A global
    -- unique key would turn a UUID collision across two accounts into a raw
    -- 23505 rollback instead of the account-scoped replay path.
    idempotency_key  UUID NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT store_order_account_key_uq UNIQUE (account_id, idempotency_key),
    -- Variant must belong to product_id (NULL variant allowed — PG skips the
    -- composite FK when any referencing column is NULL).
    CONSTRAINT store_order_product_variant_fk
        FOREIGN KEY (product_id, variant_id)
        REFERENCES store.product_variant (product_id, variant_id)
);

CREATE INDEX store_order_account_created_idx
    ON store.order (account_id, created_at DESC, order_id DESC);
CREATE INDEX store_order_open_idx
    ON store.order (status, updated_at)
    WHERE status IN ('paid', 'processing');
-- Serves the staff queue: filter by status, ORDER BY order_id DESC.
CREATE INDEX store_order_status_order_id_idx
    ON store.order (status, order_id DESC);
-- One local order per external POD order — a provider id can't be attached to
-- two orders.
CREATE UNIQUE INDEX store_order_pod_external_uq
    ON store.order (pod_provider, pod_external_order_id)
    WHERE pod_provider IS NOT NULL AND pod_external_order_id IS NOT NULL;

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

-- Upper bounds are defense-in-depth against a webhook mapping bug crediting
-- a runaway amount (100M credits ~ $1M; 100M cents = $1M).
CREATE TABLE store.topup (
    topup_id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id        UUID NOT NULL REFERENCES wallet.account(id),
    stripe_event_id   TEXT NOT NULL UNIQUE   -- idempotency on the webhook
                      CHECK (stripe_event_id = btrim(stripe_event_id)
                             AND length(stripe_event_id) BETWEEN 1 AND 255),
    stripe_session_id TEXT
                      CHECK (stripe_session_id IS NULL
                             OR (stripe_session_id = btrim(stripe_session_id)
                                 AND length(stripe_session_id) BETWEEN 1 AND 255)),
    credits_granted   BIGINT NOT NULL
                      CHECK (credits_granted > 0 AND credits_granted <= 100000000),
    amount_cents      BIGINT NOT NULL
                      CHECK (amount_cents > 0 AND amount_cents <= 100000000),
    currency_fiat     TEXT NOT NULL DEFAULT 'usd'
                      CHECK (currency_fiat ~ '^[a-z]{3}$'),
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

-- ============================================================================
-- TABLE GRANTS — defense-in-depth.
--   store/private tables are reachable only via SECURITY DEFINER proxies
--   (anon/authenticated have no schema USAGE). Explicitly revoke any table
--   access that project-wide DEFAULT PRIVILEGES might otherwise grant.
-- ============================================================================

-- The definer RPCs run as service_role, which needs explicit table + sequence
-- grants (never rely on the implicit PUBLIC privileges the REVOKE below strips).
-- No RPC ever DELETEs a store row (append-only events, orders, receipts, top-ups
-- are retained), so DELETE is withheld — the contract is SELECT/INSERT/UPDATE.
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA store TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA store TO service_role;

REVOKE ALL ON ALL TABLES IN SCHEMA store   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA private FROM PUBLIC, anon, authenticated;
