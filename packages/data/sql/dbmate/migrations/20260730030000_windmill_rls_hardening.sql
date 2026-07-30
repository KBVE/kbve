-- migrate:up

-- ============================================================
-- WINDMILL RLS HARDENING
--
-- 20260730020000 cleared the current policy_exists_rls_disabled
-- offenders with a one-shot sweep. That only holds until Windmill's
-- next sqlx migration ships another policy-bearing table with RLS
-- off, so make the invariant durable:
--
--   1. windmill.rls_drift()          audit of offenders, flagging
--                                    which are safe to auto-fix
--   2. windmill.enforce_policy_rls() re-runnable sweep of the safe
--                                    subset, returns count changed
--   3. pg_cron job (hourly)          heals drift after Windmill
--                                    migrations run
--   4. EXECUTE privileges pinned to windmill_user / windmill_admin
--      so PUBLIC / anon / authenticated can be revoked without
--      breaking the engine
--
-- "Safe to auto-fix" mirrors 20260730020000: a table with policies
-- and RLS off but NO windmill_user policy gets a permissive compat
-- policy (windmill_user currently sees every row because RLS is
-- off) and then RLS on. A table that already has a windmill_user
-- policy is left for a human — flipping RLS there would newly
-- filter rows.
--
-- Verified against the live cluster before writing the privilege
-- section: all 19 windmill functions have proacl IS NULL, i.e. they
-- rely on the implicit PUBLIC EXECUTE default, and windmill_user
-- calls set_session_context on every authed request. Revoking
-- PUBLIC without granting windmill_user first would break Windmill,
-- so the GRANTs come first and the schema gains a FUNCTIONS default
-- privilege (init only set TABLES and SEQUENCES).
--
-- Windmill owns its table lifecycle, so nothing here names a table.
-- To stop the auto-heal, unschedule 'windmill-enforce-policy-rls'
-- rather than editing this migration.
-- ============================================================

-- ===========================================
-- AUDIT: which relations violate the invariant
-- ===========================================

CREATE OR REPLACE FUNCTION windmill.rls_drift()
RETURNS TABLE (relation text, policy_count int, auto_fixable boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
    SELECT c.oid::regclass::text,
           (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid = c.oid),
           NOT EXISTS (
               SELECT 1 FROM pg_policy p
               WHERE p.polrelid = c.oid
                 AND 'windmill_user'::regrole = ANY (p.polroles)
           )
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
    'Lists windmill tables carrying policies while RLS is disabled (Supabase linter policy_exists_rls_disabled). auto_fixable=false means a windmill_user policy already exists, so enabling RLS would newly filter rows — review by hand. Empty result = healthy.';

-- ===========================================
-- ENFORCE: re-runnable sweep of the safe subset
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
    FOR target IN SELECT relation, auto_fixable FROM windmill.rls_drift() LOOP
        IF NOT target.auto_fixable THEN
            RAISE NOTICE
                'windmill.enforce_policy_rls: skipping % (has a windmill_user policy; needs manual review)',
                target.relation;
            CONTINUE;
        END IF;

        EXECUTE format(
            'CREATE POLICY kbve_windmill_user_all ON %s FOR ALL TO windmill_user USING (true) WITH CHECK (true)',
            target.relation
        );
        EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', target.relation);
        fixed := fixed + 1;
        RAISE NOTICE 'windmill.enforce_policy_rls: enabled RLS on % (compat policy added)', target.relation;
    END LOOP;

    RETURN fixed;
END;
$$;

ALTER FUNCTION windmill.enforce_policy_rls() OWNER TO postgres;
REVOKE ALL ON FUNCTION windmill.enforce_policy_rls() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION windmill.enforce_policy_rls() TO postgres;

COMMENT ON FUNCTION windmill.enforce_policy_rls() IS
    'Adds a permissive windmill_user compat policy and enables RLS on every windmill table that has policies, RLS off, and no windmill_user policy. Returns the number of relations changed; leaves auto_fixable=false relations alone. Idempotent; safe to call from cron.';

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
-- PRIVILEGES: pin windmill's own access, then wall off the rest
--
-- Order matters. Windmill's functions currently carry no explicit
-- ACL, so windmill_user reaches set_session_context() etc. only via
-- the implicit PUBLIC EXECUTE default. Grant first, revoke second.
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

-- ===========================================
-- VERIFICATION
-- ===========================================

DO $$
DECLARE
    drifted text;
    leaked text;
    unreachable text;
BEGIN
    PERFORM windmill.enforce_policy_rls();

    SELECT string_agg(relation, ', ') INTO drifted
    FROM windmill.rls_drift() WHERE auto_fixable;
    IF drifted IS NOT NULL THEN
        RAISE EXCEPTION 'windmill relations still have policies with RLS disabled: %', drifted;
    END IF;

    -- No RLS-enabled windmill table may be a black hole for windmill_user.
    SELECT string_agg(c.oid::regclass::text, ', ' ORDER BY c.oid::regclass::text)
    INTO unreachable
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'windmill'
      AND c.relkind IN ('r', 'p')
      AND c.relrowsecurity
      AND has_table_privilege('windmill_user', c.oid, 'SELECT')
      AND NOT EXISTS (
          SELECT 1 FROM pg_policy p
          WHERE p.polrelid = c.oid
            AND 'windmill_user'::regrole = ANY (p.polroles)
      );
    IF unreachable IS NOT NULL THEN
        RAISE EXCEPTION 'windmill_user has grants but no policy on RLS-enabled relation(s): %', unreachable;
    END IF;

    -- Windmill's engine roles must keep EXECUTE after the PUBLIC revoke.
    SELECT string_agg(format('%I.%I', n.nspname, p.proname), ', ')
    INTO leaked
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'windmill'
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

DROP FUNCTION IF EXISTS windmill.enforce_policy_rls();
DROP FUNCTION IF EXISTS windmill.rls_drift();

-- Restore the implicit PUBLIC EXECUTE default that Windmill's functions
-- relied on before this migration. The windmill_user grants stay: dropping
-- them here would leave functions created after the rollback reachable by
-- nobody. TABLES/SEQUENCES need no restore — PUBLIC holds nothing on those
-- by default, so those revokes were already no-ops.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA windmill TO PUBLIC;

ALTER DEFAULT PRIVILEGES IN SCHEMA windmill
    GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
