-- migrate:up

-- ============================================================
-- N8N SCHEMA INITIALIZATION
--
-- Creates a dedicated PostgreSQL schema for the n8n workflow
-- engine. n8n connects to the shared supabase database with
-- DB_POSTGRESDB_SCHEMA=n8n, and TypeORM manages all 23 tables
-- within this schema automatically on first boot.
--
-- We ONLY create the schema and grants here. n8n owns its own
-- table lifecycle (creation, migration, indexing).
--
-- Upgrade process:
--   1. Pin n8n image version in apps/kube/n8n/manifest/
--   2. Bump version locally in docker compose
--   3. docker compose up → n8n auto-migrates its own tables
--   4. Verify clean → update kube manifest → ArgoCD syncs
--
-- Depends on: 00-roles.sql (service_role must exist)
-- ============================================================

-- ===========================================
-- SCHEMA
-- ===========================================

CREATE SCHEMA IF NOT EXISTS n8n;

COMMENT ON SCHEMA n8n IS
    'n8n workflow engine schema. Tables managed by n8n TypeORM, not dbmate.';

-- ===========================================
-- GRANTS
-- ===========================================

-- postgres is superuser (implicit full access), but explicit for clarity
GRANT ALL ON SCHEMA n8n TO postgres;

-- service_role needs access for cross-schema RPC calls from n8n workflows
GRANT USAGE ON SCHEMA n8n TO service_role;

-- Ensure future tables/sequences created by n8n are accessible to service_role
ALTER DEFAULT PRIVILEGES IN SCHEMA n8n
    GRANT SELECT ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA n8n
    GRANT USAGE ON SEQUENCES TO service_role;

-- ===========================================
-- ISOLATION: Block anon/authenticated from n8n internals
-- ===========================================

REVOKE ALL ON SCHEMA n8n FROM PUBLIC;
REVOKE ALL ON SCHEMA n8n FROM anon;
REVOKE ALL ON SCHEMA n8n FROM authenticated;

-- ===========================================
-- VERIFICATION
-- ===========================================

DO $$
BEGIN
    -- Verify schema exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.schemata
        WHERE schema_name = 'n8n'
    ) THEN
        RAISE EXCEPTION 'n8n schema creation failed';
    END IF;

    -- Verify anon cannot access n8n schema
    IF has_schema_privilege('anon', 'n8n', 'USAGE') THEN
        RAISE EXCEPTION 'anon must NOT have USAGE on n8n schema';
    END IF;

    -- Verify authenticated cannot access n8n schema
    IF has_schema_privilege('authenticated', 'n8n', 'USAGE') THEN
        RAISE EXCEPTION 'authenticated must NOT have USAGE on n8n schema';
    END IF;

    RAISE NOTICE 'n8n_init.sql: n8n schema created and verified successfully.';
END;
$$ LANGUAGE plpgsql;

-- migrate:down

DROP SCHEMA IF EXISTS n8n CASCADE;
