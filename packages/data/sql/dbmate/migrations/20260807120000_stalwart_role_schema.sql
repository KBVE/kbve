-- migrate:up

-- ============================================================
-- STALWART DEDICATED POSTGRES ROLE + SCHEMA
--
-- Stalwart Mail Server uses PostgreSQL as its data store and
-- manages its own tables (opaque key-value layout). Following the
-- forgejo pattern: a scoped login role that owns a dedicated
-- schema, with search_path pinned so Stalwart's unqualified DDL
-- lands inside the stalwart schema instead of public.
--
-- The password is a placeholder for local testing. In production:
--
--   ALTER ROLE stalwart WITH PASSWORD '<production-password>';
--
-- The same password is then entered in the Stalwart setup wizard
-- (PostgreSQL store, host kilobase-rw.kilobase.svc.cluster.local,
-- database supabase, user stalwart).
--
-- Depends on: nothing (self-contained)
-- ============================================================

-- ===========================================
-- ROLE
-- ===========================================

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stalwart') THEN
        CREATE ROLE stalwart LOGIN PASSWORD 'stalwart-local-dev' CONNECTION LIMIT 20;
    END IF;
END $$;

COMMENT ON ROLE stalwart IS
    'Dedicated Stalwart Mail Server role — full DDL/DML within stalwart schema only.';

-- ===========================================
-- SCHEMA OWNERSHIP + SEARCH PATH
-- ===========================================

CREATE SCHEMA IF NOT EXISTS stalwart AUTHORIZATION stalwart;

ALTER SCHEMA stalwart OWNER TO stalwart;
GRANT ALL ON SCHEMA stalwart TO stalwart;

-- Stalwart issues unqualified CREATE TABLE / SELECT statements;
-- pinning search_path confines them to its own schema.
ALTER ROLE stalwart SET search_path TO stalwart;

-- ===========================================
-- ISOLATION: Block stalwart from other schemas
-- ===========================================

REVOKE ALL ON SCHEMA public FROM stalwart;
GRANT USAGE ON SCHEMA public TO stalwart;

-- ===========================================
-- VERIFICATION
-- ===========================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_roles
        WHERE rolname = 'stalwart' AND rolcanlogin = true
    ) THEN
        RAISE EXCEPTION 'stalwart role must exist and have LOGIN';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_namespace n
        JOIN pg_roles r ON n.nspowner = r.oid
        WHERE n.nspname = 'stalwart' AND r.rolname = 'stalwart'
    ) THEN
        RAISE EXCEPTION 'stalwart role must own the stalwart schema';
    END IF;

    IF NOT has_schema_privilege('stalwart', 'stalwart', 'CREATE') THEN
        RAISE EXCEPTION 'stalwart role must have CREATE on stalwart schema';
    END IF;

    RAISE NOTICE 'stalwart_role_schema.sql: stalwart role and schema created and verified.';
END;
$$ LANGUAGE plpgsql;

-- migrate:down

DROP SCHEMA IF EXISTS stalwart CASCADE;
REVOKE ALL ON SCHEMA public FROM stalwart;

DROP ROLE IF EXISTS stalwart;
