-- migrate:up

-- ============================================================
-- WINDMILL: ENABLE RLS ON TABLES THAT ALREADY HAVE POLICIES
--
-- The Supabase linter (policy_exists_rls_disabled, CRITICAL)
-- flags windmill.account, windmill.v2_job_completed,
-- windmill.v2_job_queue, windmill.v2_job_runtime and
-- windmill.v2_job_status: Windmill's sqlx migrations created
-- admin_policy on them but left ROW LEVEL SECURITY disabled, so
-- the policies are inert.
--
-- Naively flipping RLS on would BREAK Windmill. Verified against
-- the live cluster:
--
--   * each of the five carries exactly one policy, admin_policy,
--     FOR ALL TO windmill_admin USING (true) -- and windmill_admin
--     is BYPASSRLS, so that policy is a no-op either way;
--   * windmill_user holds full DML grants on all of them, is NOT
--     BYPASSRLS, and HAS NO POLICY of its own. pg_stat_statements
--     shows windmill_user actively selecting from v2_job_completed
--     and v2_job_queue (job lists / run detail).
--
-- So RLS-on with no windmill_user policy = deny-all for every
-- non-admin Windmill session. Workspace isolation for these
-- satellite tables is not their own job: Windmill's queries JOIN
-- v2_job, which already has RLS enabled plus the see_own /
-- see_member / see_folder_extra_perms_user policies.
--
-- Therefore, before enabling RLS on such a table, add a permissive
-- compat policy for windmill_user USING (true). That preserves the
-- CURRENT effective access exactly (RLS off == every granted role
-- sees every row) while making the existing policies live, so the
-- linter finding clears with no behaviour change.
--
-- If a table has policies, RLS off, AND already has a windmill_user
-- policy, we do NOT touch it: enabling RLS there would newly filter
-- rows, which is a judgement call for a human, not this sweep.
-- Windmill owns its table lifecycle, so nothing here names a table.
-- ============================================================

DO $$
DECLARE
    target record;
    enabled_count int := 0;
    skipped text[] := '{}';
BEGIN
    FOR target IN
        SELECT c.oid AS reloid,
               c.oid::regclass AS relident,
               EXISTS (
                   SELECT 1 FROM pg_policy p
                   WHERE p.polrelid = c.oid
                     AND 'windmill_user'::regrole = ANY (p.polroles)
               ) AS has_user_policy
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'windmill'
          AND c.relkind IN ('r', 'p')
          AND NOT c.relrowsecurity
          AND EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)
        ORDER BY 1
    LOOP
        IF target.has_user_policy THEN
            skipped := skipped || target.relident::text;
            RAISE NOTICE
                'windmill_rls_enable: skipping % (already has a windmill_user policy; enabling RLS would newly filter rows)',
                target.relident;
            CONTINUE;
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_policy p
            WHERE p.polrelid = target.reloid
              AND p.polname = 'kbve_windmill_user_all'
        ) THEN
            EXECUTE format(
                'CREATE POLICY kbve_windmill_user_all ON %s FOR ALL TO windmill_user USING (true) WITH CHECK (true)',
                target.relident
            );
        END IF;

        EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', target.relident);
        enabled_count := enabled_count + 1;
        RAISE NOTICE 'windmill_rls_enable: enabled RLS on % (compat policy in place)', target.relident;
    END LOOP;

    RAISE NOTICE 'windmill_rls_enable: % relation(s) switched to RLS, % skipped.',
        enabled_count, coalesce(array_length(skipped, 1), 0);

    IF array_length(skipped, 1) > 0 THEN
        RAISE NOTICE 'windmill_rls_enable: review manually: %', array_to_string(skipped, ', ');
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ===========================================
-- VERIFICATION
-- ===========================================

DO $$
DECLARE
    offenders text;
BEGIN
    SELECT string_agg(c.oid::regclass::text, ', ' ORDER BY c.oid::regclass::text)
    INTO offenders
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'windmill'
      AND c.relkind IN ('r', 'p')
      AND NOT c.relrowsecurity
      AND EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)
      -- tables intentionally left alone by the sweep
      AND NOT EXISTS (
          SELECT 1 FROM pg_policy p
          WHERE p.polrelid = c.oid
            AND 'windmill_user'::regrole = ANY (p.polroles)
      );

    IF offenders IS NOT NULL THEN
        RAISE EXCEPTION 'windmill relations still have policies with RLS disabled: %', offenders;
    END IF;

    -- Every table we switched on must be reachable by windmill_user.
    SELECT string_agg(c.oid::regclass::text, ', ' ORDER BY c.oid::regclass::text)
    INTO offenders
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

    IF offenders IS NOT NULL THEN
        RAISE EXCEPTION 'windmill_user has grants but no policy on RLS-enabled relation(s): %', offenders;
    END IF;

    RAISE NOTICE 'windmill_rls_enable: no policy-without-RLS relations remain; windmill_user reachable everywhere.';
END;
$$ LANGUAGE plpgsql;

-- migrate:down

DO $$
DECLARE
    target record;
BEGIN
    FOR target IN
        SELECT c.oid AS reloid, c.oid::regclass AS relident
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'windmill'
          AND c.relkind IN ('r', 'p')
          AND c.relrowsecurity
          AND EXISTS (
              SELECT 1 FROM pg_policy p
              WHERE p.polrelid = c.oid
                AND p.polname = 'kbve_windmill_user_all'
          )
        ORDER BY 1
    LOOP
        EXECUTE format('ALTER TABLE %s DISABLE ROW LEVEL SECURITY', target.relident);
        EXECUTE format('DROP POLICY kbve_windmill_user_all ON %s', target.relident);
    END LOOP;
END;
$$ LANGUAGE plpgsql;
