-- migrate:up

-- Privilege boundary: separate the store's function OWNER from the API role.
--
-- Before this migration the store's SECURITY DEFINER RPCs ran as service_role,
-- which also held direct SELECT/INSERT/UPDATE on every store table. Anyone with
-- the Supabase service key could therefore bypass the RPC invariants and write
-- orders/receipts/stock/top-ups/fulfillment directly (if the schema were ever
-- exposed).
--
-- Here a dedicated NOLOGIN role (store_api_owner) OWNS the store tables and the
-- definer functions. service_role keeps EXECUTE on the service RPCs only — no
-- direct table access — so the sole write path is the RPC, which enforces the
-- invariants. The functions run as store_api_owner, which gets exactly the
-- cross-schema access the RPC bodies need (wallet EXECUTE, inventory writes),
-- and nothing more. wallet.service_debit/credit are themselves SECURITY DEFINER,
-- so store_api_owner needs only EXECUTE on them — the ledger writes stay under
-- the wallet role.
--
-- RLS is ENABLEd (not FORCEd) on the store tables as defense-in-depth: with no
-- policies, anon/authenticated (which also lack schema USAGE) are denied direct
-- access. FORCE is intentionally NOT used — it would subject the table-owning
-- store_api_owner to its own policy-less tables and break every definer RPC.
-- The owner/EXECUTE split above, not RLS, is the real boundary (service_role is
-- BYPASSRLS in Supabase regardless).

DO $$
BEGIN
    IF to_regclass('store.order') IS NULL THEN
        RAISE EXCEPTION 'missing store schema — apply store migrations first';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'store_api_owner') THEN
        CREATE ROLE store_api_owner NOLOGIN NOINHERIT;
    END IF;
END
$$;

-- The owner needs to reach the store objects it owns, plus the cross-schema
-- objects the definer bodies touch directly.
GRANT USAGE ON SCHEMA store, private TO store_api_owner;
GRANT USAGE ON SCHEMA wallet, inventory TO store_api_owner;
-- private.proxy_store_caller_account() resolves auth.uid(); the new owner is not
-- service_role, so grant the auth access explicitly (a likely runtime blocker
-- for the authenticated proxy path otherwise — the migration-tests call the
-- service functions directly and never exercise it).
GRANT USAGE ON SCHEMA auth TO store_api_owner;
GRANT EXECUTE ON FUNCTION auth.uid() TO store_api_owner;

-- wallet: read accounts (proxy_store_caller_account, service_apply_topup) and
-- move credits via the wallet's own SECURITY DEFINER functions (EXECUTE only —
-- the ledger writes run as the wallet role, not store_api_owner).
GRANT SELECT ON wallet.account TO store_api_owner;
-- wallet.account is FORCE-RLS with a service_role-only policy; the store owner
-- is not BYPASSRLS, so it needs an explicit READ policy to resolve accounts.
-- Read-only + no write access keeps the boundary tight (the store never writes
-- wallet tables; credit/debit go through the wallet's own definer functions).
DROP POLICY IF EXISTS "store_api_owner_read" ON wallet.account;
CREATE POLICY "store_api_owner_read" ON wallet.account
    FOR SELECT TO store_api_owner USING (true);
GRANT EXECUTE ON FUNCTION wallet.service_debit(uuid, wallet.currency_kind, bigint, wallet.source_kind, text, text, bigint, uuid) TO store_api_owner;
GRANT EXECUTE ON FUNCTION wallet.service_credit(uuid, wallet.currency_kind, bigint, wallet.source_kind, text, text, bigint, uuid) TO store_api_owner;

-- inventory has NO row-level security (verified: only wallet.* is RLS-forced),
-- so these table grants are sufficient — no policy needed for the owner here.
-- The buy/refund paths mint + read items and append transitions; the ONLY
-- column a refund updates is state (+ updated_at), so UPDATE is column-scoped
-- rather than whole-row, keeping the owner from touching owner_account, qty,
-- nbt, etc. on arbitrary items.
GRANT SELECT, INSERT ON inventory.item TO store_api_owner;
GRANT UPDATE (state, updated_at) ON inventory.item TO store_api_owner;
GRANT SELECT, INSERT ON inventory.transition TO store_api_owner;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA inventory TO store_api_owner;

-- Reassign ownership of every store object + the store proxy functions that live
-- in public/private, so the definer bodies execute as store_api_owner.
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Tables (indexes + IDENTITY sequences follow the table owner).
    FOR r IN
        SELECT c.relname
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'store' AND c.relkind = 'r'
    LOOP
        EXECUTE format('ALTER TABLE store.%I OWNER TO store_api_owner', r.relname);
    END LOOP;

    -- Enum types.
    FOR r IN
        SELECT t.typname
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
         WHERE n.nspname = 'store' AND t.typtype = 'e'
    LOOP
        EXECUTE format('ALTER TYPE store.%I OWNER TO store_api_owner', r.typname);
    END LOOP;

    -- All functions in the dedicated store schema.
    FOR r IN
        SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'store'
    LOOP
        EXECUTE format('ALTER FUNCTION store.%I(%s) OWNER TO store_api_owner',
                       r.proname, r.args);
    END LOOP;
END
$$;

-- The store proxies that live in the SHARED public/private schemas are
-- reassigned by EXACT signature (never by name pattern) so this security
-- boundary can't silently widen to an unrelated same-prefix function or miss a
-- differently-named proxy.
ALTER FUNCTION public.proxy_store_catalog_readonly(INTEGER, TIMESTAMPTZ, UUID) OWNER TO store_api_owner;
ALTER FUNCTION public.proxy_store_product_detail_readonly(TEXT) OWNER TO store_api_owner;
ALTER FUNCTION public.proxy_store_my_entitlements_readonly() OWNER TO store_api_owner;
ALTER FUNCTION public.proxy_store_my_orders_readonly(INTEGER, TIMESTAMPTZ, BIGINT) OWNER TO store_api_owner;
ALTER FUNCTION public.proxy_store_buy(TEXT, UUID) OWNER TO store_api_owner;
ALTER FUNCTION public.proxy_store_buy_physical(UUID, BIGINT, JSONB, UUID) OWNER TO store_api_owner;
ALTER FUNCTION private.proxy_store_caller_account() OWNER TO store_api_owner;

-- service_role is now EXECUTE-only: strip the blanket table/sequence access the
-- earlier migrations granted. The RPCs (owned by store_api_owner) remain callable
-- by service_role via their existing EXECUTE grants.
REVOKE SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA store FROM service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA store FROM service_role;

-- Defense-in-depth RLS (ENABLE, not FORCE — see header).
ALTER TABLE store.product         ENABLE ROW LEVEL SECURITY;
ALTER TABLE store.product_variant ENABLE ROW LEVEL SECURITY;
ALTER TABLE store.purchase        ENABLE ROW LEVEL SECURITY;
ALTER TABLE store.order           ENABLE ROW LEVEL SECURITY;
ALTER TABLE store.order_event     ENABLE ROW LEVEL SECURITY;
ALTER TABLE store.topup           ENABLE ROW LEVEL SECURITY;

-- Future store objects created by store_api_owner default to no PUBLIC/anon/
-- authenticated access, so a later table/sequence/function can't silently
-- inherit unsafe privileges. Covers the dedicated store schema plus the store
-- proxies the owner may create in the shared public/private schemas.
ALTER DEFAULT PRIVILEGES FOR ROLE store_api_owner IN SCHEMA store
    REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE store_api_owner IN SCHEMA store
    REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE store_api_owner IN SCHEMA store
    REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE store_api_owner IN SCHEMA public
    REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE store_api_owner IN SCHEMA private
    REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- Also cover the migration role for the DEDICATED store schema only. NOT for
-- public/private: those are shared, so a blanket migration-role default there
-- would strip EXECUTE from unrelated future functions. The store migrations
-- instead follow the convention of an explicit REVOKE ALL ... FROM PUBLIC, anon,
-- authenticated immediately after every proxy is created (see schema_init /
-- topup_pod), which is the real protection for objects in the shared schemas.
ALTER DEFAULT PRIVILEGES IN SCHEMA store
    REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA store
    REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- Self-contained exposure boundary: anon/authenticated never received schema
-- USAGE, but revoke it explicitly here so the store's reachability doesn't
-- depend on earlier migrations' grant history.
REVOKE ALL ON SCHEMA store, private FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- migrate:down

-- Restore service_role as owner + grantee so the store works without the
-- dedicated role, then drop the role.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT c.relname
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'store' AND c.relkind = 'r'
    LOOP
        EXECUTE format('ALTER TABLE store.%I OWNER TO service_role', r.relname);
    END LOOP;
    FOR r IN
        SELECT t.typname
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
         WHERE n.nspname = 'store' AND t.typtype = 'e'
    LOOP
        EXECUTE format('ALTER TYPE store.%I OWNER TO service_role', r.typname);
    END LOOP;
    FOR r IN
        SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'store'
    LOOP
        EXECUTE format('ALTER FUNCTION store.%I(%s) OWNER TO service_role',
                       r.proname, r.args);
    END LOOP;
END
$$;

ALTER FUNCTION public.proxy_store_catalog_readonly(INTEGER, TIMESTAMPTZ, UUID) OWNER TO service_role;
ALTER FUNCTION public.proxy_store_product_detail_readonly(TEXT) OWNER TO service_role;
ALTER FUNCTION public.proxy_store_my_entitlements_readonly() OWNER TO service_role;
ALTER FUNCTION public.proxy_store_my_orders_readonly(INTEGER, TIMESTAMPTZ, BIGINT) OWNER TO service_role;
ALTER FUNCTION public.proxy_store_buy(TEXT, UUID) OWNER TO service_role;
ALTER FUNCTION public.proxy_store_buy_physical(UUID, BIGINT, JSONB, UUID) OWNER TO service_role;
ALTER FUNCTION private.proxy_store_caller_account() OWNER TO service_role;

ALTER TABLE store.product         DISABLE ROW LEVEL SECURITY;
ALTER TABLE store.product_variant DISABLE ROW LEVEL SECURITY;
ALTER TABLE store.purchase        DISABLE ROW LEVEL SECURITY;
ALTER TABLE store.order           DISABLE ROW LEVEL SECURITY;
ALTER TABLE store.order_event     DISABLE ROW LEVEL SECURITY;
ALTER TABLE store.topup           DISABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA store TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA store TO service_role;

-- Ownership is already reassigned to service_role above, so DROP OWNED only
-- clears the privileges granted TO the role and the default-privilege entries
-- defined FOR it, then the role is removed.
DROP POLICY IF EXISTS "store_api_owner_read" ON wallet.account;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'store_api_owner') THEN
        DROP OWNED BY store_api_owner;
        DROP ROLE store_api_owner;
    END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
