-- migrate:up

-- Store: a fixed-price storefront that mints inventory.item rows. The store
-- is the PRIMARY (mint) market; the existing wallet marketplace is the
-- SECONDARY (resale) market. A store purchase debits credits authoritatively
-- via wallet.service_debit (source_kind='purchase') and mints an
-- inventory.item, so anything bought here is immediately listable/tradeable
-- on the marketplace with no separate ownership model.

DO $$
BEGIN
    IF to_regprocedure(
        'wallet.service_debit(uuid, wallet.currency_kind, bigint, wallet.source_kind, text, text, bigint, uuid)'
    ) IS NULL THEN
        RAISE EXCEPTION 'missing wallet.service_debit — apply wallet schema first';
    END IF;
    IF to_regclass('inventory.item') IS NULL THEN
        RAISE EXCEPTION 'missing inventory.item — apply inventory schema first';
    END IF;
END
$$;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- private holds internal proxy helpers PostgREST never exposes. Normally
-- created by the marketplace migration that runs before this one; guarded
-- so this migration fails only on real dependency errors.
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO service_role;

CREATE SCHEMA IF NOT EXISTS store;
GRANT USAGE ON SCHEMA store TO service_role;

-- ============================================================================
-- TABLE: store.product — the catalog. One row per thing for sale.
--   A purchase mints inventory.item(kind='store_product', ref=slug).
-- ============================================================================

-- gen_random_uuid() is intentionally unqualified: it is a pg_catalog core
-- function (PG13+) that resolves regardless of search_path, matching the
-- inventory.item default. extensions.gen_random_uuid only exists when
-- pgcrypto aliases it, so qualifying would be the more fragile choice.
CREATE TABLE store.product (
    product_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug        TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
    title       TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 128),
    description TEXT,
    -- price >= 0: 0 is a valid free product; store.service_buy skips the
    -- debit for price 0 (wallet.service_debit rejects non-positive amounts).
    price       BIGINT NOT NULL CHECK (price >= 0),
    currency    wallet.currency_kind NOT NULL DEFAULT 'credits',
    -- asset_ref is PUBLIC by contract: proxy_store_catalog_readonly returns
    -- it to anon. Keep it client-safe (e.g. render descriptor); never store
    -- internal asset paths, keys, or anti-cheat metadata here.
    asset_ref   JSONB NOT NULL DEFAULT '{}'::jsonb
                CHECK (jsonb_typeof(asset_ref) = 'object'),
    status      TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'hidden', 'retired')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX store_product_active_idx
    ON store.product (created_at DESC, product_id DESC)
    WHERE status = 'active';

COMMENT ON TABLE store.product IS
    'Store catalog. Fixed-price products. A purchase mints inventory.item(kind=store_product, ref=slug); ownership lives in inventory, not here. asset_ref is public (anon-readable).';

-- Hard invariant: at most one owned copy of a given store product per account.
-- Backstops the ownership dupe-guard in store.service_buy against a
-- concurrent double-mint race (both callers pass the SELECT check, both mint).
-- The whole buy runs in one txn, so a losing INSERT here rolls back its debit.
CREATE UNIQUE INDEX IF NOT EXISTS inventory_item_store_product_owned_uq
    ON inventory.item (owner_account, ref)
    WHERE kind = 'store_product' AND state IN ('held', 'listing_escrow');

-- Seed the proof-of-concept product.
INSERT INTO store.product (slug, title, description, price, currency, asset_ref)
VALUES (
    'i-am-an-idiot',
    'I am an idiot',
    'A WebGL collectible card. Hidden until purchased for 10 credits.',
    10,
    'credits',
    jsonb_build_object('kind', 'webgl_card', 'variant', 'idiot')
)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- private.proxy_store_caller_account — auth.uid() -> wallet.account.id
--   Raises 28000 on anon, WLT01 on missing account (Rust rw-pool fallback
--   re-runs the read so the lazy-provision trigger fires).
-- ============================================================================

CREATE OR REPLACE FUNCTION private.proxy_store_caller_account()
RETURNS UUID
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_user_id    UUID := auth.uid();
    v_account_id UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
    END IF;
    SELECT id INTO v_account_id
      FROM wallet.account
     WHERE kind = 'user' AND user_id = v_user_id;
    IF v_account_id IS NULL THEN
        RAISE EXCEPTION 'wallet_account_missing' USING ERRCODE = 'WLT01';
    END IF;
    RETURN v_account_id;
END;
$$;
ALTER FUNCTION private.proxy_store_caller_account() OWNER TO service_role;
REVOKE ALL ON FUNCTION private.proxy_store_caller_account() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.proxy_store_caller_account() TO service_role;

-- ============================================================================
-- store.service_buy — atomic: debit credits + mint inventory.item.
--   Idempotent by ownership: if the caller already holds the product, returns
--   the existing item id without charging. Fresh purchases debit via
--   wallet.service_debit (raises 53100 insufficient_funds) then mint. The
--   debit ref_type embeds the slug so the wallet replay fingerprint is unique
--   per product — reusing an idempotency_key across products cannot mint a
--   second product for free.
-- ============================================================================

CREATE OR REPLACE FUNCTION store.service_buy(
    p_account         UUID,
    p_slug            TEXT,
    p_idempotency_key UUID
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_product     store.product%ROWTYPE;
    v_existing    UUID;
    v_ledger_id   BIGINT;
    v_item_id     UUID;
BEGIN
    IF p_account IS NULL OR p_slug IS NULL OR p_idempotency_key IS NULL THEN
        RAISE EXCEPTION 'account, slug and idempotency_key are required'
            USING ERRCODE = '22004';
    END IF;

    -- Serialize concurrent buys of the same (account, product) so the
    -- ownership dupe-guard below is race-safe: the loser blocks here, then
    -- sees the existing item and returns it idempotently instead of double
    -- debiting. Taken BEFORE the debit. The unique index is the backstop.
    PERFORM pg_advisory_xact_lock(hashtextextended(p_account::text || ':' || p_slug, 0));

    SELECT * INTO v_product
      FROM store.product
     WHERE slug = p_slug AND status = 'active';
    IF v_product.product_id IS NULL THEN
        RAISE EXCEPTION 'store product % not found or not active', p_slug
            USING ERRCODE = 'P1001';
    END IF;

    -- Dupe guard: one copy per account. held or escrowed both count as owned.
    SELECT id INTO v_existing
      FROM inventory.item
     WHERE owner_account = p_account
       AND kind = 'store_product'
       AND ref = p_slug
       AND state IN ('held', 'listing_escrow')
     LIMIT 1;
    IF v_existing IS NOT NULL THEN
        RETURN v_existing;
    END IF;

    -- Free products (price 0) skip the debit: wallet.service_debit rejects
    -- non-positive amounts. Paid products debit authoritatively.
    IF v_product.price > 0 THEN
        v_ledger_id := wallet.service_debit(
            p_account,
            v_product.currency,
            v_product.price,
            'purchase'::wallet.source_kind,
            'store purchase: ' || v_product.slug,
            'store_product:' || v_product.slug,
            NULL,
            p_idempotency_key
        );
    END IF;

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
        jsonb_build_object(
            'product_id', v_product.product_id,
            'slug',       v_product.slug,
            'ledger_id',  v_ledger_id
        )
    )
    RETURNING id INTO v_item_id;

    INSERT INTO inventory.transition (item_id, from_state, to_state, actor, reason, metadata)
    VALUES (
        v_item_id, 'transit_in', 'held', 'store', 'store_purchase',
        jsonb_build_object(
            'product_id', v_product.product_id,
            'slug',       v_product.slug,
            'price',      v_product.price,
            'currency',   v_product.currency,
            'ledger_id',  v_ledger_id
        )
    );

    RETURN v_item_id;
END;
$$;
ALTER FUNCTION store.service_buy(UUID, TEXT, UUID) OWNER TO service_role;
REVOKE ALL ON FUNCTION store.service_buy(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION store.service_buy(UUID, TEXT, UUID) TO service_role;
COMMENT ON FUNCTION store.service_buy(UUID, TEXT, UUID) IS
    'INTERNAL store RPC. Debits credits (source_kind=purchase) and mints inventory.item(kind=store_product, ref=slug). Idempotent per (account, product) via the held/escrow ownership check; debit ref_type embeds slug so replay fingerprints are per-product.';

-- ============================================================================
-- public.proxy_store_catalog_readonly — anon browse of active products.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.proxy_store_catalog_readonly()
RETURNS TABLE (
    product_id  UUID,
    slug        TEXT,
    title       TEXT,
    description TEXT,
    price       BIGINT,
    currency    wallet.currency_kind,
    asset_ref   JSONB,
    created_at  TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT p.product_id, p.slug, p.title, p.description,
           p.price, p.currency, p.asset_ref, p.created_at
      FROM store.product p
     WHERE p.status = 'active'
     ORDER BY p.created_at DESC, p.product_id DESC;
$$;
ALTER FUNCTION public.proxy_store_catalog_readonly() OWNER TO service_role;
REVOKE ALL ON FUNCTION public.proxy_store_catalog_readonly() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.proxy_store_catalog_readonly() TO anon, authenticated, service_role;
COMMENT ON FUNCTION public.proxy_store_catalog_readonly() IS
    'PUBLIC store proxy. Anon-callable active catalog. No auth required.';

-- ============================================================================
-- public.proxy_store_my_entitlements_readonly — caller's owned products.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.proxy_store_my_entitlements_readonly()
RETURNS TABLE (
    item_id     UUID,
    slug        TEXT,
    product_id  UUID,
    title       TEXT,
    granted_at  TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_account UUID := private.proxy_store_caller_account();
BEGIN
    RETURN QUERY
    SELECT i.id,
           i.ref AS slug,
           (i.nbt->>'product_id')::uuid AS product_id,
           i.nbt->>'title' AS title,
           i.created_at AS granted_at
      FROM inventory.item i
     WHERE i.owner_account = v_account
       AND i.kind = 'store_product'
       AND i.state IN ('held', 'listing_escrow')
     ORDER BY i.created_at DESC, i.id DESC;
END;
$$;
ALTER FUNCTION public.proxy_store_my_entitlements_readonly() OWNER TO service_role;
REVOKE ALL ON FUNCTION public.proxy_store_my_entitlements_readonly() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proxy_store_my_entitlements_readonly() TO authenticated, service_role;
COMMENT ON FUNCTION public.proxy_store_my_entitlements_readonly() IS
    'PUBLIC store proxy. Caller-scoped (auth.uid()) list of owned store products. Raises WLT01 when the caller has no wallet account.';

-- ============================================================================
-- public.proxy_store_buy — authenticated purchase wrapper.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.proxy_store_buy(
    p_slug            TEXT,
    p_idempotency_key UUID
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_account UUID := private.proxy_store_caller_account();
BEGIN
    IF p_slug IS NULL OR p_idempotency_key IS NULL THEN
        RAISE EXCEPTION 'slug and idempotency_key are required' USING ERRCODE = '22004';
    END IF;
    RETURN store.service_buy(v_account, p_slug, p_idempotency_key);
END;
$$;
ALTER FUNCTION public.proxy_store_buy(TEXT, UUID) OWNER TO service_role;
REVOKE ALL ON FUNCTION public.proxy_store_buy(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proxy_store_buy(TEXT, UUID) TO authenticated, service_role;
COMMENT ON FUNCTION public.proxy_store_buy(TEXT, UUID) IS
    'PUBLIC store proxy. Authenticated buy wrapper. Resolves auth.uid() -> wallet account, then calls store.service_buy. Returns the minted inventory.item id.';

NOTIFY pgrst, 'reload schema';

-- migrate:down

DROP FUNCTION IF EXISTS public.proxy_store_buy(TEXT, UUID);
DROP FUNCTION IF EXISTS public.proxy_store_my_entitlements_readonly();
DROP FUNCTION IF EXISTS public.proxy_store_catalog_readonly();
DROP FUNCTION IF EXISTS store.service_buy(UUID, TEXT, UUID);
DROP FUNCTION IF EXISTS private.proxy_store_caller_account();
DROP INDEX IF EXISTS inventory.inventory_item_store_product_owned_uq;
DROP TABLE IF EXISTS store.product;
DROP SCHEMA IF EXISTS store;

NOTIFY pgrst, 'reload schema';
