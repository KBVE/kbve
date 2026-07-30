-- Companion test fixtures for 20260730020000_windmill_rls_enable_policy_tables.
-- Run via: ./test-migration.sh 20260730020000_windmill_rls_enable_policy_tables

-- SEED
-- Four shapes, mirroring the live windmill schema plus the guard cases:
--   admin_only    = the actual offenders (v2_job_*, account): one admin_policy
--                   for BYPASSRLS windmill_admin, RLS off, windmill_user has
--                   grants and no policy -> compat policy + RLS + read probe.
--   user_policy   = a windmill_user policy already exists -> LEFT ALONE.
--   public_policy = policy with no TO clause (polroles = {0}) therefore
--                   applies to windmill_user too -> LEFT ALONE.
--   no_policy     = no policies at all -> stays RLS-off.
CREATE SCHEMA IF NOT EXISTS windmill;

DROP TABLE IF EXISTS windmill.rls_probe_admin_only;
DROP TABLE IF EXISTS windmill.rls_probe_user_policy;
DROP TABLE IF EXISTS windmill.rls_probe_public_policy;
DROP TABLE IF EXISTS windmill.rls_probe_no_policy;

CREATE TABLE windmill.rls_probe_admin_only (
    id bigserial PRIMARY KEY,
    workspace_id text NOT NULL
);
CREATE POLICY admin_policy ON windmill.rls_probe_admin_only
    FOR ALL TO windmill_admin USING (true);
ALTER TABLE windmill.rls_probe_admin_only DISABLE ROW LEVEL SECURITY;
GRANT ALL ON windmill.rls_probe_admin_only TO windmill_user;
INSERT INTO windmill.rls_probe_admin_only (workspace_id) VALUES ('ws-a'), ('ws-b');

CREATE TABLE windmill.rls_probe_user_policy (
    id bigserial PRIMARY KEY,
    workspace_id text NOT NULL
);
CREATE POLICY admin_policy ON windmill.rls_probe_user_policy
    FOR ALL TO windmill_admin USING (true);
CREATE POLICY see_own ON windmill.rls_probe_user_policy
    FOR ALL TO windmill_user USING (workspace_id = 'ws-a');
ALTER TABLE windmill.rls_probe_user_policy DISABLE ROW LEVEL SECURITY;
GRANT ALL ON windmill.rls_probe_user_policy TO windmill_user;

CREATE TABLE windmill.rls_probe_public_policy (
    id bigserial PRIMARY KEY,
    workspace_id text NOT NULL
);
CREATE POLICY everyone_policy ON windmill.rls_probe_public_policy
    FOR ALL USING (workspace_id = 'ws-a');
ALTER TABLE windmill.rls_probe_public_policy DISABLE ROW LEVEL SECURITY;
GRANT ALL ON windmill.rls_probe_public_policy TO windmill_user;

CREATE TABLE windmill.rls_probe_no_policy (
    id bigserial PRIMARY KEY
);

-- ASSERT_AFTER_UP
DO $$
DECLARE
    visible int;
    fixed int;
BEGIN
    -- 1. the real offender shape gets fixed
    IF NOT (
        SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'windmill' AND c.relname = 'rls_probe_admin_only'
    ) THEN
        RAISE EXCEPTION 'fail: RLS not enabled on admin-only policy table';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policy p
        WHERE p.polrelid = 'windmill.rls_probe_admin_only'::regclass
          AND p.polname = 'kbve_windmill_user_all'
          AND 'windmill_user'::regrole = ANY (p.polroles)
    ) THEN
        RAISE EXCEPTION 'fail: compat policy for windmill_user missing';
    END IF;

    -- 2. the whole point: windmill_user still sees every row
    SET LOCAL ROLE windmill_user;
    SELECT count(*) INTO visible FROM windmill.rls_probe_admin_only;
    RESET ROLE;
    IF visible <> 2 THEN
        RAISE EXCEPTION 'fail: windmill_user sees % of 2 rows after RLS enable (deny-all regression)', visible;
    END IF;

    -- 3. guard cases stay untouched
    IF (
        SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'windmill' AND c.relname = 'rls_probe_user_policy'
    ) THEN
        RAISE EXCEPTION 'fail: sweep enabled RLS on a table that already had a windmill_user policy';
    END IF;

    IF (
        SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'windmill' AND c.relname = 'rls_probe_public_policy'
    ) THEN
        RAISE EXCEPTION 'fail: sweep enabled RLS on a table with a PUBLIC-scoped policy';
    END IF;

    IF EXISTS (
        SELECT 1 FROM windmill.rls_drift()
        WHERE relation IN ('windmill.rls_probe_user_policy', 'windmill.rls_probe_public_policy')
          AND auto_fixable
    ) THEN
        RAISE EXCEPTION 'fail: rls_drift() marked a windmill_user-visible policy table auto_fixable';
    END IF;

    IF (
        SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'windmill' AND c.relname = 'rls_probe_no_policy'
    ) THEN
        RAISE EXCEPTION 'fail: RLS enabled on windmill table that has no policies';
    END IF;

    -- 4. no auto-fixable drift left, and the sweep is idempotent
    IF EXISTS (SELECT 1 FROM windmill.rls_drift() WHERE auto_fixable) THEN
        RAISE EXCEPTION 'fail: auto-fixable offenders remain after up';
    END IF;

    SELECT windmill.enforce_policy_rls(true) INTO fixed;
    IF fixed <> 0 THEN
        RAISE EXCEPTION 'fail: enforce_policy_rls() not idempotent, changed % relation(s)', fixed;
    END IF;

    -- 5. the probe itself must detect a blackout and an empty table
    IF NOT windmill.rls_user_can_read('windmill.rls_probe_admin_only'::regclass) THEN
        RAISE EXCEPTION 'fail: probe reports the fixed table as unreadable';
    END IF;

    IF NOT windmill.rls_user_can_read('windmill.rls_probe_no_policy'::regclass) THEN
        RAISE EXCEPTION 'fail: probe must be vacuously true on an empty table';
    END IF;

    -- construct a real blackout: RLS on, rows present, no windmill_user policy
    DROP POLICY kbve_windmill_user_all ON windmill.rls_probe_admin_only;
    IF windmill.rls_user_can_read('windmill.rls_probe_admin_only'::regclass) THEN
        RAISE EXCEPTION 'fail: probe did not detect a windmill_user blackout';
    END IF;
    CREATE POLICY kbve_windmill_user_all ON windmill.rls_probe_admin_only
        FOR ALL TO windmill_user USING (true) WITH CHECK (true);

    -- 6. reconciliation: once Windmill ships its own windmill_user policy, our
    --    permissive compat policy must go, or it would OR-widen past theirs.
    CREATE POLICY see_own_upstream ON windmill.rls_probe_admin_only
        FOR ALL TO windmill_user USING (workspace_id = 'ws-a');
    PERFORM windmill.enforce_policy_rls(true);
    IF EXISTS (
        SELECT 1 FROM pg_policy p
        WHERE p.polrelid = 'windmill.rls_probe_admin_only'::regclass
          AND p.polname = 'kbve_windmill_user_all'
    ) THEN
        RAISE EXCEPTION 'fail: compat policy survived alongside an upstream windmill_user policy';
    END IF;

    SET LOCAL ROLE windmill_user;
    SELECT count(*) INTO visible FROM windmill.rls_probe_admin_only;
    RESET ROLE;
    IF visible <> 1 THEN
        RAISE EXCEPTION 'fail: upstream policy not in force after reconcile (saw % rows, expected 1)', visible;
    END IF;

    -- restore the fixture for the down-assertions
    DROP POLICY see_own_upstream ON windmill.rls_probe_admin_only;
    CREATE POLICY kbve_windmill_user_all ON windmill.rls_probe_admin_only
        FOR ALL TO windmill_user USING (true) WITH CHECK (true);

    -- 7. helpers are locked down and owned by postgres
    IF has_function_privilege('anon', 'windmill.enforce_policy_rls(boolean)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'windmill.rls_drift()', 'EXECUTE') THEN
        RAISE EXCEPTION 'fail: API roles can execute the windmill rls helpers';
    END IF;

    -- Owned by postgres, and deliberately NOT SECURITY DEFINER: the read probe
    -- needs SET/RESET ROLE, which postgres cannot do inside a definer function.
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        JOIN pg_roles r ON r.oid = p.proowner
        WHERE n.nspname = 'windmill'
          AND p.proname IN ('enforce_policy_rls', 'rls_drift', 'rls_user_can_read')
          AND (r.rolname <> 'postgres' OR p.prosecdef)
    ) THEN
        RAISE EXCEPTION 'fail: windmill rls helpers must be postgres-owned SECURITY INVOKER';
    END IF;
END;
$$;

-- ASSERT_AFTER_DOWN
DO $$
BEGIN
    IF (
        SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'windmill' AND c.relname = 'rls_probe_admin_only'
    ) THEN
        RAISE EXCEPTION 'fail: RLS still enabled after down';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_policy p
        WHERE p.polrelid = 'windmill.rls_probe_admin_only'::regclass
          AND p.polname = 'kbve_windmill_user_all'
    ) THEN
        RAISE EXCEPTION 'fail: compat policy survived down';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policy p
        WHERE p.polrelid = 'windmill.rls_probe_admin_only'::regclass
          AND p.polname = 'admin_policy'
    ) THEN
        RAISE EXCEPTION 'fail: down removed a Windmill-owned policy';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'windmill'
          AND p.proname IN ('enforce_policy_rls', 'rls_drift', 'rls_user_can_read')
    ) THEN
        RAISE EXCEPTION 'fail: windmill rls helpers still present after down';
    END IF;
END;
$$;
