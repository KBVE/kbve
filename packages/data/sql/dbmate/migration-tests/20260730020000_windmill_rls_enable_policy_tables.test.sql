-- Companion test fixtures for 20260730020000_windmill_rls_enable_policy_tables.
-- Run via: ./test-migration.sh 20260730020000_windmill_rls_enable_policy_tables

-- SEED
-- Stand in for the Windmill-owned tables (windmill.account, v2_job_*):
-- a policy exists, RLS is off. Also seed a control table with no policy,
-- which must stay RLS-disabled.
CREATE SCHEMA IF NOT EXISTS windmill;

DROP TABLE IF EXISTS windmill.rls_probe_with_policy;
DROP TABLE IF EXISTS windmill.rls_probe_no_policy;

CREATE TABLE windmill.rls_probe_with_policy (
    id bigserial PRIMARY KEY,
    workspace_id text NOT NULL
);

CREATE POLICY admin_policy ON windmill.rls_probe_with_policy
    TO windmill_admin
    USING (true);

ALTER TABLE windmill.rls_probe_with_policy DISABLE ROW LEVEL SECURITY;

CREATE TABLE windmill.rls_probe_no_policy (
    id bigserial PRIMARY KEY
);

-- ASSERT_AFTER_UP
DO $$
BEGIN
    IF NOT (
        SELECT c.relrowsecurity
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'windmill' AND c.relname = 'rls_probe_with_policy'
    ) THEN
        RAISE EXCEPTION 'fail: RLS not enabled on policy-bearing windmill table';
    END IF;

    IF (
        SELECT c.relrowsecurity
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'windmill' AND c.relname = 'rls_probe_no_policy'
    ) THEN
        RAISE EXCEPTION 'fail: RLS enabled on windmill table that has no policies';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'windmill'
          AND c.relkind IN ('r', 'p')
          AND NOT c.relrowsecurity
          AND EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)
    ) THEN
        RAISE EXCEPTION 'fail: windmill relations with policies still have RLS disabled';
    END IF;
END;
$$;

-- ASSERT_AFTER_DOWN
DO $$
BEGIN
    IF (
        SELECT c.relrowsecurity
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'windmill' AND c.relname = 'rls_probe_with_policy'
    ) THEN
        RAISE EXCEPTION 'fail: RLS still enabled after down';
    END IF;
END;
$$;
