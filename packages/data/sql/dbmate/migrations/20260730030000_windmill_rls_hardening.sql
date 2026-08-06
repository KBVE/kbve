-- migrate:up

-- ============================================================
-- WINDMILL RLS HARDENING
--
-- 20260730020000 cleared the current policy_exists_rls_disabled
-- offenders and left windmill.rls_drift() /
-- windmill.enforce_policy_rls() / windmill.rls_user_can_read()
-- behind. That one-shot only holds until Windmill's next sqlx
-- migration ships another policy-bearing table with RLS off, so
-- this migration makes the invariant durable:
--
--   1. pg_cron job (hourly) calling enforce_policy_rls() in
--      NON-strict mode -- it heals the provably-safe subset, and a
--      table that would black out windmill_user is reverted and
--      logged as a WARNING rather than left broken;
--   2. EXECUTE privileges pinned to windmill_user / windmill_admin
--      so PUBLIC / anon / authenticated can be revoked without
--      taking the engine down with them.
--
-- Verified against the live cluster before writing the privilege
-- section: all 19 windmill functions have proacl IS NULL, i.e. they
-- rely on the implicit PUBLIC EXECUTE default, and windmill_user
-- calls set_session_context() on every authed request. Revoking
-- PUBLIC without granting windmill_user first would break Windmill,
-- so the GRANTs come first and the schema gains a FUNCTIONS default
-- privilege (init set only TABLES and SEQUENCES). migrate:down
-- restores the PUBLIC default.
--
-- pg_cron lives in the `supabase` database on this cluster
-- (cron.database_name=supabase) alongside the windmill schema, so
-- the job registers and runs there -- same as
-- wallet-sweep-expired-coupons and marketplace-expire-listings.
--
-- To stop the auto-heal, unschedule 'windmill-enforce-policy-rls'
-- rather than editing this migration.
-- ============================================================

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';

-- ===========================================
-- SCHEDULE: heal drift introduced by Windmill migrations
-- ===========================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule(jobid)
          FROM cron.job
         WHERE jobname = 'windmill-enforce-policy-rls';
        PERFORM cron.schedule(
            'windmill-enforce-policy-rls',
            '17 * * * *',
            $cron$SELECT windmill.enforce_policy_rls(false);$cron$
        );
    ELSE
        RAISE NOTICE 'pg_cron not installed; skipping windmill-enforce-policy-rls schedule registration';
    END IF;
END;
$$;

-- ===========================================
-- PRIVILEGES: pin windmill's own access, then wall off the rest
--
-- Order matters. Windmill's functions carry no explicit ACL, so
-- windmill_user reaches set_session_context() etc. only via the
-- implicit PUBLIC EXECUTE default. Grant first, revoke second.
-- ===========================================

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA windmill TO windmill_user, windmill_admin;

ALTER DEFAULT PRIVILEGES IN SCHEMA windmill
    GRANT EXECUTE ON FUNCTIONS TO windmill_user;

REVOKE ALL ON ALL TABLES IN SCHEMA windmill FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA windmill FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA windmill FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA windmill
    REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA windmill
    REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA windmill
    REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- The sweep's own helpers must stay off-limits to the API roles even
-- after the blanket GRANT above handed them to the engine roles.
REVOKE ALL ON FUNCTION windmill.rls_drift() FROM PUBLIC, anon, authenticated, windmill_user, windmill_admin;
REVOKE ALL ON FUNCTION windmill.rls_user_can_read(regclass) FROM PUBLIC, anon, authenticated, windmill_user, windmill_admin;
REVOKE ALL ON FUNCTION windmill.enforce_policy_rls(boolean) FROM PUBLIC, anon, authenticated, windmill_user, windmill_admin;
GRANT EXECUTE ON FUNCTION windmill.rls_drift() TO postgres;
GRANT EXECUTE ON FUNCTION windmill.rls_user_can_read(regclass) TO postgres;
GRANT EXECUTE ON FUNCTION windmill.enforce_policy_rls(boolean) TO postgres;

-- ===========================================
-- VERIFICATION
-- ===========================================

DO $$
DECLARE
    drifted text;
    leaked text;
    unreadable text;
BEGIN
    PERFORM windmill.enforce_policy_rls(true);

    SELECT string_agg(relation, ', ') INTO drifted
    FROM windmill.rls_drift() WHERE auto_fixable;
    IF drifted IS NOT NULL THEN
        RAISE EXCEPTION 'windmill relations still have policies with RLS disabled: %', drifted;
    END IF;

    -- No RLS-enabled windmill table may be a black hole for windmill_user.
    SELECT string_agg(c.oid::regclass::text, ', ' ORDER BY c.oid::regclass::text)
    INTO unreadable
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'windmill'
      AND c.relkind IN ('r', 'p')
      AND NOT c.relispartition
      AND c.relrowsecurity
      AND has_table_privilege('windmill_user', c.oid, 'SELECT')
      AND EXISTS (
          SELECT 1 FROM pg_policy p
          WHERE p.polrelid = c.oid AND p.polname = 'kbve_windmill_user_all'
      )
      AND NOT windmill.rls_user_can_read(c.oid::regclass);
    IF unreadable IS NOT NULL THEN
        RAISE EXCEPTION 'windmill_user cannot read RLS-enabled relation(s): %', unreadable;
    END IF;

    -- Windmill's engine roles must keep EXECUTE after the PUBLIC revoke.
    SELECT string_agg(format('%I.%I', n.nspname, p.proname), ', ')
    INTO leaked
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'windmill'
      AND p.proname NOT IN ('rls_drift', 'rls_user_can_read', 'enforce_policy_rls')
      AND NOT has_function_privilege('windmill_user', p.oid, 'EXECUTE');
    IF leaked IS NOT NULL THEN
        RAISE EXCEPTION 'windmill_user lost EXECUTE on windmill function(s): %', leaked;
    END IF;

    IF has_schema_privilege('anon', 'windmill', 'USAGE')
       OR has_schema_privilege('authenticated', 'windmill', 'USAGE') THEN
        RAISE EXCEPTION 'anon/authenticated must NOT have USAGE on windmill schema';
    END IF;

    SELECT string_agg(DISTINCT format('%I.%I', table_schema, table_name), ', ')
    INTO leaked
    FROM information_schema.role_table_grants
    WHERE table_schema = 'windmill'
      AND grantee IN ('PUBLIC', 'anon', 'authenticated');
    IF leaked IS NOT NULL THEN
        RAISE EXCEPTION 'anon/authenticated/PUBLIC still hold table grants in windmill: %', leaked;
    END IF;

    -- Nested, not `AND`-ed: plpgsql plans the whole boolean expression, so a
    -- single IF referencing cron.job errors on installs without pg_cron.
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        IF NOT EXISTS (
            SELECT 1 FROM cron.job WHERE jobname = 'windmill-enforce-policy-rls'
        ) THEN
            RAISE EXCEPTION 'windmill-enforce-policy-rls cron job missing';
        END IF;
    END IF;

    RAISE NOTICE 'windmill_rls_hardening: drift clean, engine roles intact, API roles walled off, sweep scheduled.';
END;
$$ LANGUAGE plpgsql;

-- migrate:down

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule(jobid)
          FROM cron.job
         WHERE jobname = 'windmill-enforce-policy-rls';
    END IF;
END;
$$;

-- Restore the implicit PUBLIC EXECUTE default that Windmill's functions
-- relied on before this migration. The windmill_user grants stay: dropping
-- them would leave functions created after the rollback reachable by nobody.
-- TABLES/SEQUENCES need no restore -- PUBLIC holds nothing on those by
-- default, so those revokes were already no-ops.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA windmill TO PUBLIC;

ALTER DEFAULT PRIVILEGES IN SCHEMA windmill
    GRANT EXECUTE ON FUNCTIONS TO PUBLIC;

REVOKE ALL ON FUNCTION windmill.rls_drift() FROM PUBLIC;
REVOKE ALL ON FUNCTION windmill.rls_user_can_read(regclass) FROM PUBLIC;
REVOKE ALL ON FUNCTION windmill.enforce_policy_rls(boolean) FROM PUBLIC;
