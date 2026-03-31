-- migrate:up

-- ============================================================
-- FORGEJO DEDICATED POSTGRES ROLE
--
-- Replaces the postgres superuser connection with a scoped
-- forgejo role that can only operate within the forgejo schema.
--
-- Forgejo uses xorm which needs full DDL rights (CREATE TABLE,
-- ALTER TABLE, DROP INDEX, etc.) within its schema, plus
-- standard DML (INSERT, UPDATE, DELETE, SELECT).
--
-- The password is a placeholder for local testing. In production,
-- the real password is injected via ExternalSecret → forgejo-db
-- sealed secret. After applying this migration, run:
--
--   ALTER ROLE forgejo WITH PASSWORD '<production-password>';
--
-- Then update apps/kube/forgejo/application.yaml:
--   USER: forgejo
--
-- Depends on: 20260320210000_forgejo_schema_init.sql
-- Ref: https://github.com/KBVE/kbve/issues/8416
-- ============================================================

-- ===========================================
-- ROLE
-- ===========================================

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'forgejo') THEN
        CREATE ROLE forgejo LOGIN PASSWORD 'forgejo-local-dev';
    END IF;
END $$;

COMMENT ON ROLE forgejo IS
    'Dedicated Forgejo role — full DDL/DML within forgejo schema only.';

-- ===========================================
-- SCHEMA OWNERSHIP
-- ===========================================

-- Transfer schema ownership so xorm can CREATE/ALTER/DROP freely
ALTER SCHEMA forgejo OWNER TO forgejo;

-- Full access to the schema itself
GRANT ALL ON SCHEMA forgejo TO forgejo;

-- Full access to all existing tables, sequences, functions
GRANT ALL ON ALL TABLES IN SCHEMA forgejo TO forgejo;
GRANT ALL ON ALL SEQUENCES IN SCHEMA forgejo TO forgejo;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA forgejo TO forgejo;

-- Ensure future objects created by postgres are also accessible
ALTER DEFAULT PRIVILEGES IN SCHEMA forgejo
    GRANT ALL ON TABLES TO forgejo;

ALTER DEFAULT PRIVILEGES IN SCHEMA forgejo
    GRANT ALL ON SEQUENCES TO forgejo;

ALTER DEFAULT PRIVILEGES IN SCHEMA forgejo
    GRANT ALL ON FUNCTIONS TO forgejo;

-- Objects created BY forgejo should also be accessible to service_role
ALTER DEFAULT PRIVILEGES FOR ROLE forgejo IN SCHEMA forgejo
    GRANT SELECT ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE forgejo IN SCHEMA forgejo
    GRANT USAGE ON SEQUENCES TO service_role;

-- ===========================================
-- ISOLATION: Block forgejo from other schemas
-- ===========================================

-- Revoke default public schema access
REVOKE ALL ON SCHEMA public FROM forgejo;

-- Allow USAGE on public for pg_catalog/system functions only
-- (xorm needs this for things like gen_random_uuid)
GRANT USAGE ON SCHEMA public TO forgejo;

-- Forgejo needs the ULID generator if referenced
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'gen_ulid'
    ) THEN
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.gen_ulid() TO forgejo';
    END IF;
END $$;

-- ===========================================
-- VERIFICATION
-- ===========================================

DO $$
BEGIN
    -- Verify role exists and can login
    IF NOT EXISTS (
        SELECT 1 FROM pg_roles
        WHERE rolname = 'forgejo' AND rolcanlogin = true
    ) THEN
        RAISE EXCEPTION 'forgejo role must exist and have LOGIN';
    END IF;

    -- Verify forgejo owns the schema
    IF NOT EXISTS (
        SELECT 1 FROM pg_namespace n
        JOIN pg_roles r ON n.nspowner = r.oid
        WHERE n.nspname = 'forgejo' AND r.rolname = 'forgejo'
    ) THEN
        RAISE EXCEPTION 'forgejo role must own the forgejo schema';
    END IF;

    -- Verify forgejo has USAGE on forgejo schema
    IF NOT has_schema_privilege('forgejo', 'forgejo', 'CREATE') THEN
        RAISE EXCEPTION 'forgejo role must have CREATE on forgejo schema';
    END IF;

    RAISE NOTICE 'forgejo_dedicated_role.sql: forgejo role created and verified.';
END;
$$ LANGUAGE plpgsql;

-- migrate:down

-- Return schema ownership to postgres before dropping the role
ALTER SCHEMA forgejo OWNER TO postgres;
GRANT ALL ON SCHEMA forgejo TO postgres;

-- Revoke and drop
REVOKE ALL ON ALL TABLES IN SCHEMA forgejo FROM forgejo;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA forgejo FROM forgejo;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA forgejo FROM forgejo;
REVOKE ALL ON SCHEMA forgejo FROM forgejo;
REVOKE ALL ON SCHEMA public FROM forgejo;

DROP ROLE IF EXISTS forgejo;
