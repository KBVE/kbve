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
    -- 1. drift healed, engine still reads everything, function still callable
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

    IF NOT windmill.rls_user_can_read('windmill.rls_harden_probe'::regclass) THEN
        RAISE EXCEPTION 'fail: probe reports the healed table as unreadable';
    END IF;

    -- 2. manual-review table untouched but still reported
    IF (
        SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'windmill' AND c.relname = 'rls_harden_user_policy'
    ) THEN
        RAISE EXCEPTION 'fail: hardening enabled RLS on a table with an existing windmill_user policy';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM windmill.rls_drift()
        WHERE relation = 'windmill.rls_harden_user_policy' AND NOT auto_fixable
    ) THEN
        RAISE EXCEPTION 'fail: rls_drift() must report the manual-review table as not auto_fixable';
    END IF;

    IF (
        SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'windmill' AND c.relname = 'rls_harden_no_policy'
    ) THEN
        RAISE EXCEPTION 'fail: RLS enabled on windmill table with no policies';
    END IF;

    SELECT string_agg(relation, ', ') INTO drifted FROM windmill.rls_drift() WHERE auto_fixable;
    IF drifted IS NOT NULL THEN
        RAISE EXCEPTION 'fail: auto-fixable offenders remain: %', drifted;
    END IF;

    -- 3. both modes idempotent; non-strict is what cron runs
    SELECT windmill.enforce_policy_rls(true) INTO fixed;
    IF fixed <> 0 THEN
        RAISE EXCEPTION 'fail: enforce_policy_rls(true) not idempotent, changed % relation(s)', fixed;
    END IF;
    SELECT windmill.enforce_policy_rls(false) INTO fixed;
    IF fixed <> 0 THEN
        RAISE EXCEPTION 'fail: enforce_policy_rls(false) not idempotent, changed % relation(s)', fixed;
    END IF;

    -- 4. API roles walled off
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

    -- 5. the sweep helpers stay postgres-only, even after the blanket GRANT
    IF has_function_privilege('windmill_user', 'windmill.enforce_policy_rls(boolean)', 'EXECUTE')
       OR has_function_privilege('windmill_user', 'windmill.rls_drift()', 'EXECUTE')
       OR has_function_privilege('windmill_user', 'windmill.rls_user_can_read(regclass)', 'EXECUTE') THEN
        RAISE EXCEPTION 'fail: windmill_user can execute the privileged rls helpers';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        IF NOT EXISTS (
            SELECT 1 FROM cron.job
            WHERE jobname = 'windmill-enforce-policy-rls'
              AND command LIKE '%enforce_policy_rls(false)%'
        ) THEN
            RAISE EXCEPTION 'fail: cron job missing or not running in non-strict mode';
        END IF;
    END IF;
END;
$$;

-- ASSERT_AFTER_DOWN
DO $$
DECLARE
    probe int;
BEGIN
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

    -- ...but the privileged helpers must not become PUBLIC again.
    IF has_function_privilege('windmill_user', 'windmill.enforce_policy_rls(boolean)', 'EXECUTE') THEN
        RAISE EXCEPTION 'fail: rollback exposed enforce_policy_rls to windmill_user';
    END IF;

    IF NOT (
        SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'windmill' AND c.relname = 'rls_harden_probe'
    ) THEN
        RAISE EXCEPTION 'fail: down must not disable RLS (owned by 20260730020000)';
    END IF;
END;
$$;
