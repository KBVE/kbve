-- migrate:up

-- ============================================================
-- FORGEJO SCHEMA INITIALIZATION
--
-- Creates a dedicated PostgreSQL schema for the Forgejo git
-- forge. Forgejo connects to the shared supabase database with
-- SCHEMA=forgejo, and xorm manages all 125 tables within this
-- schema automatically on first boot.
--
-- We ONLY create the schema and grants here. Forgejo owns its
-- own table lifecycle (creation, migration, indexing).
--
-- Upgrade process:
--   1. Pin forgejo image version in apps/kube/forgejo/
--   2. Bump version locally in docker compose
--   3. docker compose up → forgejo auto-migrates its own tables
--   4. Verify clean → update kube manifest → ArgoCD syncs
--
-- Depends on: 00-roles.sql (service_role must exist)
-- ============================================================

-- ===========================================
-- SCHEMA
-- ===========================================

CREATE SCHEMA IF NOT EXISTS forgejo;

COMMENT ON SCHEMA forgejo IS
    'Forgejo git forge schema. Tables managed by Forgejo xorm, not dbmate.';

-- ===========================================
-- GRANTS
-- ===========================================

-- postgres is superuser (implicit full access), but explicit for clarity
GRANT ALL ON SCHEMA forgejo TO postgres;

-- service_role needs access for cross-schema RPC calls
GRANT USAGE ON SCHEMA forgejo TO service_role;

-- Ensure future tables/sequences created by Forgejo are accessible to service_role
ALTER DEFAULT PRIVILEGES IN SCHEMA forgejo
    GRANT SELECT ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA forgejo
    GRANT USAGE ON SEQUENCES TO service_role;

-- ===========================================
-- ISOLATION: Block anon/authenticated from forgejo internals
-- ===========================================

REVOKE ALL ON SCHEMA forgejo FROM PUBLIC;
REVOKE ALL ON SCHEMA forgejo FROM anon;
REVOKE ALL ON SCHEMA forgejo FROM authenticated;

-- ===========================================
-- VERIFICATION
-- ===========================================

DO $$
BEGIN
    -- Verify schema exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.schemata
        WHERE schema_name = 'forgejo'
    ) THEN
        RAISE EXCEPTION 'forgejo schema creation failed';
    END IF;

    -- Verify anon cannot access forgejo schema
    IF has_schema_privilege('anon', 'forgejo', 'USAGE') THEN
        RAISE EXCEPTION 'anon must NOT have USAGE on forgejo schema';
    END IF;

    -- Verify authenticated cannot access forgejo schema
    IF has_schema_privilege('authenticated', 'forgejo', 'USAGE') THEN
        RAISE EXCEPTION 'authenticated must NOT have USAGE on forgejo schema';
    END IF;

    RAISE NOTICE 'forgejo_init.sql: forgejo schema created and verified successfully.';
END;
$$ LANGUAGE plpgsql;

-- migrate:down

DROP SCHEMA IF EXISTS forgejo CASCADE;
