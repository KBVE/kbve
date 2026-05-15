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
-- This migration creates the role, grants CONNECT on the application
-- database, and (re)defines public.user_search owned by `postgres` so
-- the SECURITY DEFINER body retains access to pg_shadow regardless of
-- which role runs dbmate. Re-running is a no-op.
--
-- Reference: CloudNativePG "Connection Pooling" docs, "Connecting to
-- the PgBouncer pooler" section — the same role/function/grant trio is
-- what the operator creates on greenfield installs.

DO $do$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_catalog.pg_roles
         WHERE rolname = 'cnpg_pooler_pgbouncer'
    ) THEN
        CREATE ROLE cnpg_pooler_pgbouncer WITH LOGIN;
    END IF;
END
$do$;

-- PgBouncer connects to the application database to run auth_query, so
-- the auth role must have CONNECT on it. Use current_database() via
-- dynamic SQL instead of hardcoding the name, so the migration runs
-- cleanly against prod (`supabase`), the local dev compose (`postgres`),
-- and any future namespaced DB. Re-running GRANT is idempotent.
DO $do$
BEGIN
    EXECUTE format(
        'GRANT CONNECT ON DATABASE %I TO cnpg_pooler_pgbouncer',
        current_database()
    );
END
$do$;

CREATE OR REPLACE FUNCTION public.user_search(uname TEXT)
    RETURNS TABLE (usename name, passwd text)
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = pg_catalog
    AS $fn$
        SELECT usename, passwd
          FROM pg_catalog.pg_shadow
         WHERE usename = $1;
    $fn$;

-- Pin ownership to `postgres` so SECURITY DEFINER runs as a superuser
-- and the body can read pg_shadow regardless of which role applied
-- the migration. Without this, a dbmate run as a restricted role would
-- compile the function but it would fail at runtime with `permission
-- denied for view pg_shadow`.
ALTER FUNCTION public.user_search(text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.user_search(text) FROM PUBLIC;
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

-- Intentionally a no-op. Dropping public.user_search or the
-- cnpg_pooler_pgbouncer role at this point would instantly break every
-- pooled client (wallet, MC, anything routing through pooler-ro /
-- pooler-rw). The only safe time to run a cleanup is when both
-- Pooler CRs have been deleted first; do that out-of-band, not via
-- dbmate down.
SELECT 1;
