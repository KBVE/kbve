-- migrate:up

-- ============================================================
-- WINDMILL SCHEMA INITIALIZATION
--
-- Creates a dedicated PostgreSQL schema for the Windmill
-- workflow engine. Windmill connects to the shared supabase
-- database with PG_SCHEMA=windmill (server + workers) and its
-- sqlx migrations manage all tables within this schema.
--
-- We ONLY create the schema, the two Windmill roles, and grants
-- here. Windmill owns its own table lifecycle.
--
-- Windmill requires the group roles windmill_user and
-- windmill_admin (BYPASSRLS) to exist; it connects as postgres
-- and uses SET ROLE for row-level security enforcement.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS windmill;

COMMENT ON SCHEMA windmill IS
    'Windmill workflow engine schema. Tables managed by Windmill sqlx migrations, not dbmate.';

-- ===========================================
-- ROLES (idempotent; required by Windmill)
-- ===========================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'windmill_user') THEN
        CREATE ROLE windmill_user NOLOGIN;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'windmill_admin') THEN
        CREATE ROLE windmill_admin NOLOGIN BYPASSRLS;
    END IF;
END;
$$ LANGUAGE plpgsql;

GRANT windmill_user TO windmill_admin;

-- ===========================================
-- GRANTS
-- ===========================================

GRANT ALL ON SCHEMA windmill TO postgres;
GRANT ALL ON SCHEMA windmill TO windmill_user;
GRANT ALL ON SCHEMA windmill TO windmill_admin;

ALTER DEFAULT PRIVILEGES IN SCHEMA windmill
    GRANT ALL ON TABLES TO windmill_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA windmill
    GRANT ALL ON SEQUENCES TO windmill_user;

-- ===========================================
-- ISOLATION: Block anon/authenticated from windmill internals
-- ===========================================

REVOKE ALL ON SCHEMA windmill FROM PUBLIC;
REVOKE ALL ON SCHEMA windmill FROM anon;
REVOKE ALL ON SCHEMA windmill FROM authenticated;

-- ===========================================
-- VERIFICATION
-- ===========================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.schemata
        WHERE schema_name = 'windmill'
    ) THEN
        RAISE EXCEPTION 'windmill schema creation failed';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'windmill_user') THEN
        RAISE EXCEPTION 'windmill_user role creation failed';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'windmill_admin' AND rolbypassrls) THEN
        RAISE EXCEPTION 'windmill_admin role must exist with BYPASSRLS';
    END IF;

    IF has_schema_privilege('anon', 'windmill', 'USAGE') THEN
        RAISE EXCEPTION 'anon must NOT have USAGE on windmill schema';
    END IF;

    IF has_schema_privilege('authenticated', 'windmill', 'USAGE') THEN
        RAISE EXCEPTION 'authenticated must NOT have USAGE on windmill schema';
    END IF;

    RAISE NOTICE 'windmill_schema_init: schema, roles, and grants verified successfully.';
END;
$$ LANGUAGE plpgsql;

-- migrate:down

DROP SCHEMA IF EXISTS windmill CASCADE;
