-- migrate:up

-- ============================================================
-- WINDMILL: ENABLE RLS ON TABLES THAT ALREADY HAVE POLICIES
--
-- The Supabase linter (policy_exists_rls_disabled, CRITICAL)
-- flags windmill.account, windmill.v2_job_completed,
-- windmill.v2_job_queue, windmill.v2_job_runtime and
-- windmill.v2_job_status: Windmill's sqlx migrations created
-- admin_policy / per-workspace policies on them but left
-- ROW LEVEL SECURITY disabled, so the policies are inert.
--
-- Windmill owns its table lifecycle (see 20260707000000), so we
-- do not name tables here. We sweep every relation in the
-- windmill schema that has at least one policy and no RLS, and
-- turn RLS on. Idempotent: relations already using RLS, and a
-- fresh database where Windmill has not run yet, are no-ops.
--
-- Safety: the windmill tables are owned by postgres (superuser)
-- and the Windmill server connects as postgres, so RLS is
-- bypassed for the engine itself. Workers SET ROLE to
-- windmill_user / windmill_admin (BYPASSRLS), which is exactly
-- the enforcement path the policies were written for.
-- ============================================================

DO $$
DECLARE
    target record;
    enabled_count int := 0;
BEGIN
    FOR target IN
        SELECT c.oid::regclass AS relident
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'windmill'
          AND c.relkind IN ('r', 'p')
          AND NOT c.relrowsecurity
          AND EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)
        ORDER BY 1
    LOOP
        EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', target.relident);
        enabled_count := enabled_count + 1;
        RAISE NOTICE 'windmill_rls_enable: enabled RLS on %', target.relident;
    END LOOP;

    RAISE NOTICE 'windmill_rls_enable: % relation(s) switched to RLS.', enabled_count;
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
      AND EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid);

    IF offenders IS NOT NULL THEN
        RAISE EXCEPTION 'windmill relations still have policies with RLS disabled: %', offenders;
    END IF;

    RAISE NOTICE 'windmill_rls_enable: no policy-without-RLS relations remain.';
END;
$$ LANGUAGE plpgsql;

-- migrate:down

DO $$
DECLARE
    target record;
BEGIN
    FOR target IN
        SELECT c.oid::regclass AS relident
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'windmill'
          AND c.relkind IN ('r', 'p')
          AND c.relrowsecurity
          AND EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)
        ORDER BY 1
    LOOP
        EXECUTE format('ALTER TABLE %s DISABLE ROW LEVEL SECURITY', target.relident);
    END LOOP;
END;
$$ LANGUAGE plpgsql;
