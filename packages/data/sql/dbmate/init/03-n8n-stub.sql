-- ============================================================
-- n8n schema stub for local migration testing.
--
-- In production, this is created by dbmate migration
-- 20260302100000_n8n_schema_init.sql. This stub exists so
-- the n8n schema is available in local docker compose before
-- migrations run (same pattern as 01-auth-stub.sql and
-- 02-extensions-stub.sql).
--
-- n8n TypeORM manages its own 23 tables within this schema.
-- We only create the schema and grants here.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS n8n;

-- Grant access
GRANT ALL ON SCHEMA n8n TO postgres;
GRANT USAGE ON SCHEMA n8n TO service_role;

-- Future tables created by n8n are readable by service_role
ALTER DEFAULT PRIVILEGES IN SCHEMA n8n
    GRANT SELECT ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA n8n
    GRANT USAGE ON SEQUENCES TO service_role;

-- Isolation: block anon/authenticated
REVOKE ALL ON SCHEMA n8n FROM PUBLIC;
