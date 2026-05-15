-- migrate:up

-- CNPG Pooler bootstrap — provision the role + auth-query function that
-- PgBouncer needs to authenticate clients.
--
-- Background. The supabase Postgres cluster predates the CNPG Pooler
-- resources in this repo (Pooler was added 2026-03-05; supabase image
-- was already running for ~9 months prior). When CNPG sees an existing
-- database that already has its own pgbouncer/auth setup, it does NOT
-- run its standard pooler bootstrap that creates the cnpg_pooler_pgbouncer
-- role + public.user_search function.
--
-- The Pooler controller still writes pgbouncer.ini with
--   auth_user  = cnpg_pooler_pgbouncer
--   auth_query = SELECT usename, passwd FROM public.user_search($1)
-- and configures the mTLS client cert with CN=cnpg_pooler_pgbouncer.
--
-- Without the role + function, every server-side handshake fails with
-- `role "cnpg_pooler_pgbouncer" does not exist`, PgBouncer caches the
-- failure as `server_login_retry`, and every client through the pooler
-- starts timing out at the edge (CF 408).
--
-- This migration creates both pieces idempotently. Re-running is a no-op.
-- The function mirrors CNPG's stock implementation (SECURITY DEFINER,
-- search_path locked, read-only against pg_shadow).

DO $do$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_roles
        WHERE rolname = 'cnpg_pooler_pgbouncer'
    ) THEN
        CREATE ROLE cnpg_pooler_pgbouncer WITH LOGIN;
    END IF;
END
$do$;

CREATE OR REPLACE FUNCTION public.user_search(uname TEXT)
    RETURNS TABLE (usename name, passwd text)
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = pg_catalog
    AS $fn$
        SELECT usename, passwd FROM pg_shadow WHERE usename = $1;
    $fn$;

REVOKE EXECUTE ON FUNCTION public.user_search(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_search(text) TO cnpg_pooler_pgbouncer;

COMMENT ON FUNCTION public.user_search(text) IS
    'CNPG Pooler auth-query target. Used by PgBouncer as auth_user '
    'cnpg_pooler_pgbouncer to look up SCRAM credentials for the user '
    'a client is attempting to log in as. Mirrors CNPG''s stock function.';

COMMENT ON ROLE cnpg_pooler_pgbouncer IS
    'PgBouncer auth_user. CNPG signs an mTLS client cert with CN matching '
    'this role; the pooler then runs public.user_search to authenticate '
    'every downstream client. Required by every Pooler in this cluster.';

-- migrate:down

REVOKE EXECUTE ON FUNCTION public.user_search(text) FROM cnpg_pooler_pgbouncer;
DROP FUNCTION IF EXISTS public.user_search(text);
DROP ROLE IF EXISTS cnpg_pooler_pgbouncer;
