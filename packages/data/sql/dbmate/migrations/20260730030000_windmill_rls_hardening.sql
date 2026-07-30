-- migrate:up

-- ============================================================
-- WINDMILL RLS HARDENING
--
-- 20260730020000 fixed the current policy_exists_rls_disabled
-- offenders (windmill.account, windmill.v2_job_*) with a one-shot
-- sweep. That sweep only holds until Windmill's next sqlx
-- migration adds another policy-bearing table with RLS off, so
-- this migration makes the invariant durable:
--
--   1. windmill.rls_drift()          read-only audit of offenders
--   2. windmill.enforce_policy_rls() re-runnable sweep, returns count
--   3. pg_cron job (hourly)          auto-heals drift after Windmill
--                                    migrations run
--   4. table/sequence/function-level privilege revokes for
--      PUBLIC / anon / authenticated, plus default privileges, so
--      the API roles cannot reach windmill internals even if a
--      future object is created with permissive grants
--
-- Windmill owns its table lifecycle, so nothing here names a table.
-- If Windmill ever ships a table that must run WITHOUT RLS while
-- carrying policies, the cron job would fight it: unschedule
-- 'windmill-enforce-policy-rls' rather than editing this migration.
-- ============================================================

-- ===========================================
-- AUDIT: which relations violate the invariant
-- ===========================================

CREATE OR REPLACE FUNCTION windmill.rls_drift()
RETURNS TABLE (relation text, policy_count int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
    SELECT c.oid::regclass::text,
           (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid = c.oid)
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'windmill'
      AND c.relkind IN ('r', 'p')
      AND NOT c.relrowsecurity
      AND EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)
    ORDER BY 1;
$$;

ALTER FUNCTION windmill.rls_drift() OWNER TO postgres;
REVOKE ALL ON FUNCTION windmill.rls_drift() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION windmill.rls_drift() TO postgres;

COMMENT ON FUNCTION windmill.rls_drift() IS
    'Lists windmill tables that carry policies while RLS is disabled (Supabase linter policy_exists_rls_disabled). Empty result = healthy.';

-- ===========================================
-- ENFORCE: re-runnable sweep
-- ===========================================

CREATE OR REPLACE FUNCTION windmill.enforce_policy_rls()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    target record;
    fixed int := 0;
BEGIN
    FOR target IN SELECT relation FROM windmill.rls_drift() LOOP
        EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', target.relation);
        fixed := fixed + 1;
        RAISE NOTICE 'windmill.enforce_policy_rls: enabled RLS on %', target.relation;
    END LOOP;

    RETURN fixed;
END;
$$;

ALTER FUNCTION windmill.enforce_policy_rls() OWNER TO postgres;
REVOKE ALL ON FUNCTION windmill.enforce_policy_rls() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION windmill.enforce_policy_rls() TO postgres;

COMMENT ON FUNCTION windmill.enforce_policy_rls() IS
    'Enables RLS on every windmill table that has policies but RLS off. Returns the number of relations changed. Idempotent; safe to call from cron.';

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
            $cron$SELECT windmill.enforce_policy_rls();$cron$
        );
    ELSE
        RAISE NOTICE 'pg_cron not installed; skipping windmill-enforce-policy-rls schedule registration';
    END IF;
END;
$$;

-- ===========================================
-- PRIVILEGES: keep API roles out of windmill internals
-- ===========================================

REVOKE ALL ON ALL TABLES IN SCHEMA windmill FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA windmill FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA windmill FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA windmill
    REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA windmill
    REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA windmill
    REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- ===========================================
-- VERIFICATION
-- ===========================================

DO $$
DECLARE
    drifted text;
    leaked text;
BEGIN
    PERFORM windmill.enforce_policy_rls();

    SELECT string_agg(relation, ', ') INTO drifted FROM windmill.rls_drift();
    IF drifted IS NOT NULL THEN
        RAISE EXCEPTION 'windmill relations still have policies with RLS disabled: %', drifted;
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

    RAISE NOTICE 'windmill_rls_hardening: drift clean, API roles walled off, sweep scheduled.';
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

DROP FUNCTION IF EXISTS windmill.enforce_policy_rls();
DROP FUNCTION IF EXISTS windmill.rls_drift();
