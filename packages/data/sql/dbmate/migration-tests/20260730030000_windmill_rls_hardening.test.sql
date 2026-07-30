-- Companion test fixtures for 20260730030000_windmill_rls_hardening.
-- Run via: ./test-migration.sh 20260730030000_windmill_rls_hardening

-- SEED
-- Two stand-ins for Windmill-owned tables. The drifted one arrives AFTER
-- the one-shot sweep in 20260730020000 (i.e. what a future Windmill sqlx
-- migration would do) and additionally leaks grants to the API roles.
CREATE SCHEMA IF NOT EXISTS windmill;

DROP TABLE IF EXISTS windmill.rls_harden_probe;
DROP TABLE IF EXISTS windmill.rls_harden_no_policy;

CREATE TABLE windmill.rls_harden_probe (
    id bigserial PRIMARY KEY,
    workspace_id text NOT NULL
);

CREATE POLICY admin_policy ON windmill.rls_harden_probe
    TO windmill_admin
    USING (true);

ALTER TABLE windmill.rls_harden_probe DISABLE ROW LEVEL SECURITY;

GRANT SELECT ON windmill.rls_harden_probe TO anon;
GRANT SELECT, INSERT ON windmill.rls_harden_probe TO authenticated;
GRANT SELECT ON windmill.rls_harden_probe TO PUBLIC;

CREATE TABLE windmill.rls_harden_no_policy (
    id bigserial PRIMARY KEY
);

-- ASSERT_AFTER_UP
DO $$
DECLARE
    drifted text;
    fixed int;
BEGIN
    IF NOT (
        SELECT c.relrowsecurity
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'windmill' AND c.relname = 'rls_harden_probe'
    ) THEN
        RAISE EXCEPTION 'fail: hardening did not enable RLS on drifted table';
    END IF;

    IF (
        SELECT c.relrowsecurity
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'windmill' AND c.relname = 'rls_harden_no_policy'
    ) THEN
        RAISE EXCEPTION 'fail: RLS enabled on windmill table with no policies';
    END IF;

    SELECT string_agg(relation, ', ') INTO drifted FROM windmill.rls_drift();
    IF drifted IS NOT NULL THEN
        RAISE EXCEPTION 'fail: rls_drift() still reports offenders: %', drifted;
    END IF;

    SELECT windmill.enforce_policy_rls() INTO fixed;
    IF fixed <> 0 THEN
        RAISE EXCEPTION 'fail: enforce_policy_rls() not idempotent, changed % relation(s)', fixed;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.role_table_grants
        WHERE table_schema = 'windmill'
          AND grantee IN ('PUBLIC', 'anon', 'authenticated')
    ) THEN
        RAISE EXCEPTION 'fail: API roles still hold table grants in windmill';
    END IF;

    IF has_function_privilege('anon', 'windmill.enforce_policy_rls()', 'EXECUTE')
       OR has_function_privilege('authenticated', 'windmill.enforce_policy_rls()', 'EXECUTE') THEN
        RAISE EXCEPTION 'fail: API roles can execute windmill.enforce_policy_rls()';
    END IF;

    IF NOT (
        SELECT p.prosecdef FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'windmill' AND p.proname = 'enforce_policy_rls'
    ) THEN
        RAISE EXCEPTION 'fail: enforce_policy_rls must be SECURITY DEFINER';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        JOIN pg_roles r ON r.oid = p.proowner
        WHERE n.nspname = 'windmill'
          AND p.proname IN ('enforce_policy_rls', 'rls_drift')
          AND r.rolname = 'postgres'
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
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'windmill'
          AND p.proname IN ('enforce_policy_rls', 'rls_drift')
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

    IF NOT (
        SELECT c.relrowsecurity
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'windmill' AND c.relname = 'rls_harden_probe'
    ) THEN
        RAISE EXCEPTION 'fail: down must not disable RLS (owned by 20260730020000)';
    END IF;
END;
$$;
