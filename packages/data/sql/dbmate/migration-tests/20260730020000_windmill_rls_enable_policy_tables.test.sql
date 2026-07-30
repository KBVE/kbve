-- Companion test fixtures for 20260730020000_windmill_rls_enable_policy_tables.
-- Run via: ./test-migration.sh 20260730020000_windmill_rls_enable_policy_tables

-- SEED
-- Three shapes, mirroring the live windmill schema:
--   admin_only  = the actual offenders (v2_job_*, account): one admin_policy
--                 for BYPASSRLS windmill_admin, RLS off, windmill_user has
--                 grants and no policy -> must gain a compat policy + RLS.
--   user_policy = has a windmill_user policy already -> must be LEFT ALONE.
--   no_policy   = no policies at all -> must stay RLS-off.
CREATE SCHEMA IF NOT EXISTS windmill;

DROP TABLE IF EXISTS windmill.rls_probe_admin_only;
DROP TABLE IF EXISTS windmill.rls_probe_user_policy;
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

CREATE TABLE windmill.rls_probe_no_policy (
    id bigserial PRIMARY KEY
);

-- ASSERT_AFTER_UP
DO $$
DECLARE
    visible int;
BEGIN
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

    -- The whole point: windmill_user must still see every row, exactly as it
    -- did while RLS was off.
    SET LOCAL ROLE windmill_user;
    SELECT count(*) INTO visible FROM windmill.rls_probe_admin_only;
    RESET ROLE;
    IF visible <> 2 THEN
        RAISE EXCEPTION 'fail: windmill_user sees % of 2 rows after RLS enable (deny-all regression)', visible;
    END IF;

    IF (
        SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'windmill' AND c.relname = 'rls_probe_user_policy'
    ) THEN
        RAISE EXCEPTION 'fail: sweep enabled RLS on a table that already had a windmill_user policy';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_policy p
        WHERE p.polrelid = 'windmill.rls_probe_user_policy'::regclass
          AND p.polname = 'kbve_windmill_user_all'
    ) THEN
        RAISE EXCEPTION 'fail: compat policy added to a table the sweep must leave alone';
    END IF;

    IF (
        SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'windmill' AND c.relname = 'rls_probe_no_policy'
    ) THEN
        RAISE EXCEPTION 'fail: RLS enabled on windmill table that has no policies';
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
END;
$$;
