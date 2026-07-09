-- ============================================================================
-- STORE CORE — catalog table + purchase RPCs.
--
-- Reference mirror of the dbmate migration
-- (../../dbmate/migrations/20260708120000_store_schema_init.sql).
-- Hand-authored review surface — do not run directly against the database;
-- promote changes into a new dbmate migration when ready.
--
-- Mental model:
--   The store is the PRIMARY (mint) market. A purchase debits credits via
--   wallet.service_debit (source_kind='purchase') and mints an inventory.item
--   (kind='store_product', ref=slug). Ownership lives in inventory — never a
--   separate entitlement table — so a store product is immediately listable
--   and tradeable on the existing wallet marketplace (the SECONDARY market).
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS store;
GRANT USAGE ON SCHEMA store TO service_role;

-- gen_random_uuid() is unqualified on purpose (pg_catalog core, PG13+).
-- asset_ref is PUBLIC by contract (anon-readable) — keep it client-safe.
-- price >= 0: price 0 is a free product; service_buy skips the debit.
CREATE TABLE store.product (
    product_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug        TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
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
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX store_product_active_idx
    ON store.product (created_at DESC, product_id DESC)
    WHERE status = 'active';

-- Hard invariant: at most one owned copy per (account, store product).
-- Backstops the ownership dupe-guard against a concurrent double-mint.
CREATE UNIQUE INDEX inventory_item_store_product_owned_uq
    ON inventory.item (owner_account, ref)
    WHERE kind = 'store_product' AND state IN ('held', 'listing_escrow');

-- private.proxy_store_caller_account(): auth.uid() -> wallet.account.id.
--   28000 on anon, WLT01 on missing account.

-- store.service_buy(p_account UUID, p_slug TEXT, p_idempotency_key UUID)
--   RETURNS UUID (inventory.item id). SECURITY DEFINER, OWNER service_role.
--   1. pg_advisory_xact_lock on (account:slug) — serialize concurrent buys.
--   2. Resolve active product by slug (P1001 if missing).
--   3. Ownership dupe guard: return existing item if the account already
--      holds kind=store_product ref=slug in state held|listing_escrow.
--   4. If price > 0: wallet.service_debit(currency, price, 'purchase',
--      ref_type='store_product:'||slug, idempotency_key) — 53100 insufficient.
--      price 0 skips the debit (free product).
--   5. Mint inventory.item(held) + inventory.transition(transit_in->held).

-- public.proxy_store_catalog_readonly() RETURNS TABLE(...)
--   anon|authenticated|service_role. Active catalog, STABLE.

-- public.proxy_store_my_entitlements_readonly() RETURNS TABLE(...)
--   authenticated|service_role. Caller's owned store products. WLT01 on
--   missing wallet account.

-- public.proxy_store_buy(p_slug TEXT, p_idempotency_key UUID) RETURNS UUID
--   authenticated|service_role. Resolves caller account, calls
--   store.service_buy.

-- ============================================================================
-- Phase 1: variants + staff admin
--   (dbmate 20260709120000_store_variants, 20260709130000_store_admin_rpcs)
-- ============================================================================

CREATE TABLE store.product_variant (
    variant_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id  UUID NOT NULL REFERENCES store.product(product_id) ON DELETE CASCADE,
    sku         TEXT NOT NULL UNIQUE CHECK (sku ~ '^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$'),
    attributes  JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes) = 'object'),
    price       BIGINT NOT NULL CHECK (price >= 0),
    stock       BIGINT CHECK (stock IS NULL OR stock >= 0),   -- NULL = unlimited
    status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','hidden','retired')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- public.proxy_store_catalog_readonly() — extended to also return fulfillment
--   + variant_count. anon|authenticated|service_role.
-- public.proxy_store_product_detail_readonly(p_slug TEXT) — product + active
--   variants (JSONB array). anon|authenticated|service_role.

-- Staff internals (service_role-only; transport enforces forum.is_staff):
-- store.service_upsert_product(slug,title,description,price,fulfillment,asset_ref,status) -> UUID
-- store.service_set_product_status(product_id, status)
-- store.service_upsert_variant(product_id,sku,attributes,price,stock,status) -> UUID
-- store.service_set_variant_status(variant_id, status)

-- ============================================================================
-- Phase 2: orders + fulfillment
--   (dbmate 20260709140000_store_orders, _150000_store_buy_physical,
--    _160000_store_fulfillment)
-- ============================================================================

CREATE TYPE store.order_status AS ENUM
    ('paid','processing','shipped','delivered','cancelled','refunded');

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
    shipping_address JSONB NOT NULL DEFAULT '{}'::jsonb,
    tracking         JSONB NOT NULL DEFAULT '{}'::jsonb,
    idempotency_key  UUID NOT NULL UNIQUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- store.order_event: append-only (BEFORE UPDATE/DELETE trigger blocks mutation).

-- store.service_buy_physical(account, variant_id, qty, shipping_address, key)
--   RETURNS BIGINT (order_id). Advisory lock on (account:variant); idempotent
--   on store.order.idempotency_key; validates active variant/product +
--   fulfillment in (physical,both); atomic finite-stock decrement (P1020 out
--   of stock); wallet.service_debit (53100 insufficient); 'both' mints a
--   one-per-account digital twin; inserts paid order + event.
-- public.proxy_store_buy_physical(variant_id, qty, address, key) -> BIGINT
--   authenticated wrapper (resolves caller account).
-- public.proxy_store_my_orders_readonly() -> caller orders.

-- Fulfillment (service_role; transport gates staff):
-- store.service_advance_order(order_id, to_status, tracking, note) — validates
--   paid→processing→shipped→delivered, *→cancelled.
-- store.service_refund_order(order_id, reason) — wallet.service_credit('refund'),
--   restore finite stock, consume twin; idempotent when already refunded.
-- store.service_list_orders(status, limit, before_id) — staff order queue.
