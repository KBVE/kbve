-- Companion test fixtures for 20260730030000_windmill_rls_hardening.
-- Run via: ./test-migration.sh 20260730030000_windmill_rls_hardening

-- SEED
-- Drift that arrives AFTER the one-shot sweep in 20260730020000, i.e. what a
-- future Windmill sqlx migration would create: a policy-bearing table with RLS
-- off, a table whose windmill_user policy must be left alone, a function with
-- no explicit ACL (relies on the implicit PUBLIC EXECUTE default, like the 19
-- real windmill functions do), and leaked grants to the API roles.
CREATE SCHEMA IF NOT EXISTS windmill;

DROP TABLE IF EXISTS windmill.rls_harden_probe;
DROP TABLE IF EXISTS windmill.rls_harden_user_policy;
DROP TABLE IF EXISTS windmill.rls_harden_no_policy;
DROP FUNCTION IF EXISTS windmill.harden_probe_fn();

CREATE TABLE windmill.rls_harden_probe (
    id bigserial PRIMARY KEY,
    workspace_id text NOT NULL
);
CREATE POLICY admin_policy ON windmill.rls_harden_probe
    FOR ALL TO windmill_admin USING (true);
ALTER TABLE windmill.rls_harden_probe DISABLE ROW LEVEL SECURITY;
GRANT ALL ON windmill.rls_harden_probe TO windmill_user;
GRANT SELECT ON windmill.rls_harden_probe TO anon;
GRANT SELECT, INSERT ON windmill.rls_harden_probe TO authenticated;
GRANT SELECT ON windmill.rls_harden_probe TO PUBLIC;
INSERT INTO windmill.rls_harden_probe (workspace_id) VALUES ('ws-a'), ('ws-b'), ('ws-c');

CREATE TABLE windmill.rls_harden_user_policy (
    id bigserial PRIMARY KEY,
    workspace_id text NOT NULL
);
CREATE POLICY admin_policy ON windmill.rls_harden_user_policy
    FOR ALL TO windmill_admin USING (true);
CREATE POLICY see_own ON windmill.rls_harden_user_policy
    FOR ALL TO windmill_user USING (workspace_id = 'ws-a');
ALTER TABLE windmill.rls_harden_user_policy DISABLE ROW LEVEL SECURITY;
GRANT ALL ON windmill.rls_harden_user_policy TO windmill_user;

CREATE TABLE windmill.rls_harden_no_policy (
    id bigserial PRIMARY KEY
);

-- Stand-in for set_session_context(): no explicit ACL at all.
CREATE FUNCTION windmill.harden_probe_fn() RETURNS int LANGUAGE sql AS 'SELECT 1';

-- ASSERT_AFTER_UP
DO $$
DECLARE
    drifted text;
    fixed int;
    visible int;
    probe int;
BEGIN
    IF NOT (
        SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'windmill' AND c.relname = 'rls_harden_probe'
    ) THEN
        RAISE EXCEPTION 'fail: hardening did not enable RLS on drifted table';
    END IF;

    SET LOCAL ROLE windmill_user;
    SELECT count(*) INTO visible FROM windmill.rls_harden_probe;
    SELECT windmill.harden_probe_fn() INTO probe;
    RESET ROLE;

    IF visible <> 3 THEN
        RAISE EXCEPTION 'fail: windmill_user sees % of 3 rows after hardening (deny-all regression)', visible;
    END IF;
    IF probe <> 1 THEN
        RAISE EXCEPTION 'fail: windmill_user could not execute an ACL-less windmill function';
    END IF;

    IF (
        SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'windmill' AND c.relname = 'rls_harden_user_policy'
    ) THEN
        RAISE EXCEPTION 'fail: hardening enabled RLS on a table with an existing windmill_user policy';
    END IF;

    IF (
        SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'windmill' AND c.relname = 'rls_harden_no_policy'
    ) THEN
        RAISE EXCEPTION 'fail: RLS enabled on windmill table with no policies';
    END IF;

    -- The manual-review table stays in rls_drift(), flagged not auto_fixable.
    SELECT string_agg(relation, ', ') INTO drifted FROM windmill.rls_drift() WHERE auto_fixable;
    IF drifted IS NOT NULL THEN
        RAISE EXCEPTION 'fail: auto-fixable offenders remain: %', drifted;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM windmill.rls_drift()
        WHERE relation = 'windmill.rls_harden_user_policy' AND NOT auto_fixable
    ) THEN
        RAISE EXCEPTION 'fail: rls_drift() must report the manual-review table as not auto_fixable';
    END IF;

    SELECT windmill.enforce_policy_rls() INTO fixed;
    IF fixed <> 0 THEN
        RAISE EXCEPTION 'fail: enforce_policy_rls() not idempotent, changed % relation(s)', fixed;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.role_table_grants
        WHERE table_schema = 'windmill' AND grantee IN ('PUBLIC', 'anon', 'authenticated')
    ) THEN
        RAISE EXCEPTION 'fail: API roles still hold table grants in windmill';
    END IF;

    IF has_function_privilege('anon', 'windmill.harden_probe_fn()', 'EXECUTE')
       OR has_function_privilege('authenticated', 'windmill.harden_probe_fn()', 'EXECUTE') THEN
        RAISE EXCEPTION 'fail: API roles can execute windmill functions';
    END IF;

    IF has_function_privilege('anon', 'windmill.enforce_policy_rls()', 'EXECUTE')
       OR has_function_privilege('authenticated', 'windmill.enforce_policy_rls()', 'EXECUTE') THEN
        RAISE EXCEPTION 'fail: API roles can execute windmill.enforce_policy_rls()';
    END IF;

    IF NOT (
        SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'windmill' AND p.proname = 'enforce_policy_rls'
    ) THEN
        RAISE EXCEPTION 'fail: enforce_policy_rls must be SECURITY DEFINER';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        JOIN pg_roles r ON r.oid = p.proowner
        WHERE n.nspname = 'windmill'
          AND p.proname IN ('enforce_policy_rls', 'rls_drift')
          AND r.rolname <> 'postgres'
    ) THEN
        RAISE EXCEPTION 'fail: windmill rls functions must be owned by postgres';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        IF NOT EXISTS (
            SELECT 1 FROM cron.job WHERE jobname = 'windmill-enforce-policy-rls'
        ) THEN
            RAISE EXCEPTION 'fail: windmill-enforce-policy-rls cron job not registered';
        END IF;
    END IF;
END;
$$;

-- ASSERT_AFTER_DOWN
DO $$
DECLARE
    probe int;
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'windmill' AND p.proname IN ('enforce_policy_rls', 'rls_drift')
    ) THEN
        RAISE EXCEPTION 'fail: windmill rls functions still present after down';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        IF EXISTS (
            SELECT 1 FROM cron.job WHERE jobname = 'windmill-enforce-policy-rls'
        ) THEN
            RAISE EXCEPTION 'fail: cron job still scheduled after down';
        END IF;
    END IF;

    -- Rollback must not leave Windmill's own functions unreachable.
    SET LOCAL ROLE windmill_user;
    SELECT windmill.harden_probe_fn() INTO probe;
    RESET ROLE;
    IF probe <> 1 THEN
        RAISE EXCEPTION 'fail: windmill_user lost EXECUTE after rollback';
    END IF;

    IF NOT (
        SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'windmill' AND c.relname = 'rls_harden_probe'
    ) THEN
        RAISE EXCEPTION 'fail: down must not disable RLS (owned by 20260730020000)';
    END IF;
END;
$$;
