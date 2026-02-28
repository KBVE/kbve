-- ============================================================
-- Supabase-compatible roles for local migration testing.
--
-- These roles mirror what exists in the production Supabase
-- Postgres cluster so that GRANT, REVOKE, RLS policies, and
-- OWNER TO statements in migrations succeed locally.
--
-- Safe to commit — no secrets, passwords are local-only.
-- ============================================================

-- Helper: create role if it doesn't already exist
DO $$ BEGIN
    -- Core Supabase roles
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
        CREATE ROLE supabase_admin LOGIN SUPERUSER PASSWORD 'postgres';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN NOINHERIT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN NOINHERIT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN NOINHERIT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
        CREATE ROLE authenticator LOGIN PASSWORD 'postgres';
    END IF;

    -- Auth and storage admin roles (referenced by some extensions)
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
        CREATE ROLE supabase_auth_admin NOLOGIN;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_storage_admin') THEN
        CREATE ROLE supabase_storage_admin NOLOGIN;
    END IF;

    -- Supabase dashboard and infrastructure roles (referenced by schema dump)
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dashboard_user') THEN
        CREATE ROLE dashboard_user NOLOGIN;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pgbouncer') THEN
        CREATE ROLE pgbouncer LOGIN PASSWORD 'postgres';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pgsodium_keyholder') THEN
        CREATE ROLE pgsodium_keyholder NOLOGIN;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pgsodium_keyiduser') THEN
        CREATE ROLE pgsodium_keyiduser NOLOGIN;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pgsodium_keymaker') THEN
        CREATE ROLE pgsodium_keymaker NOLOGIN;
    END IF;

    -- Supabase internal service roles
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_functions_admin') THEN
        CREATE ROLE supabase_functions_admin NOLOGIN;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_realtime_admin') THEN
        CREATE ROLE supabase_realtime_admin NOLOGIN;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_read_only_user') THEN
        CREATE ROLE supabase_read_only_user NOLOGIN;
    END IF;

    -- Grant service_role the ability to act as anon/authenticated
    GRANT anon TO authenticator;
    GRANT authenticated TO authenticator;
    GRANT service_role TO supabase_admin;

    RAISE NOTICE 'Supabase-compatible roles created successfully.';
END $$;
