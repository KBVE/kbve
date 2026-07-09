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

CREATE TABLE store.product (
    product_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug        TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
    title       TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 128),
    description TEXT,
    price       BIGINT NOT NULL CHECK (price >= 0),
    currency    wallet.currency_kind NOT NULL DEFAULT 'credits',
    asset_ref   JSONB NOT NULL DEFAULT '{}'::jsonb
                CHECK (jsonb_typeof(asset_ref) = 'object'),
    status      TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'hidden', 'retired')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX store_product_active_idx
    ON store.product (created_at DESC, product_id DESC)
    WHERE status = 'active';

-- private.proxy_store_caller_account(): auth.uid() -> wallet.account.id.
--   28000 on anon, WLT01 on missing account.

-- store.service_buy(p_account UUID, p_slug TEXT, p_idempotency_key UUID)
--   RETURNS UUID (inventory.item id). SECURITY DEFINER, OWNER service_role.
--   1. Resolve active product by slug (P1001 if missing).
--   2. Ownership dupe guard: return existing item if the account already
--      holds kind=store_product ref=slug in state held|listing_escrow.
--   3. wallet.service_debit(currency, price, 'purchase', ref_type=
--      'store_product:'||slug, idempotency_key) — 53100 insufficient_funds.
--   4. Mint inventory.item(held) + inventory.transition(transit_in->held).

-- public.proxy_store_catalog_readonly() RETURNS TABLE(...)
--   anon|authenticated|service_role. Active catalog, STABLE.

-- public.proxy_store_my_entitlements_readonly() RETURNS TABLE(...)
--   authenticated|service_role. Caller's owned store products. WLT01 on
--   missing wallet account.

-- public.proxy_store_buy(p_slug TEXT, p_idempotency_key UUID) RETURNS UUID
--   authenticated|service_role. Resolves caller account, calls
--   store.service_buy.
