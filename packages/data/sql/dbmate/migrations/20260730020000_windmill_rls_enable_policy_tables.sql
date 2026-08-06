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
-- Flipping RLS on naively BREAKS Windmill. Measured on the live
-- cluster inside a rolled-back transaction:
--
--                       windmill_user rows visible
--   table               RLS off   naive RLS on   RLS on + compat
--   v2_job_completed      257          0              257
--   v2_job_queue            1          0                1
--   v2_job_runtime          1          0                1
--
-- Why: each table carries exactly one policy, admin_policy FOR ALL
-- TO windmill_admin USING (true), and windmill_admin is BYPASSRLS,
-- so that policy is a no-op either way. windmill_user holds full
-- DML grants, is NOT BYPASSRLS, and has no policy of its own --
-- RLS-on therefore means deny-all for every non-admin session, and
-- pg_stat_statements confirms windmill_user actively selects from
-- v2_job_completed and v2_job_queue.
--
-- These satellite tables are not where isolation lives. Windmill's
-- queries JOIN v2_job, which already has RLS on plus see_own /
-- see_member / see_folder_extra_perms_user. The same dry run
-- confirmed it: `v2_job JOIN v2_job_completed` as windmill_user
-- with a bogus session identity returns 0 rows even with the
-- compat policy in place.
--
-- So: add a permissive compat policy for windmill_user USING (true)
-- BEFORE enabling RLS. That preserves current effective access
-- exactly (RLS off == every granted role sees every row) and clears
-- the linter finding with no behaviour change.
--
-- Safety layers, in order of application:
--   * lock_timeout, so a wedged ALTER TABLE can never block the
--     live engine -- the migration fails fast instead;
--   * preflight: bail out cleanly if the windmill roles are absent;
--   * skip any table where a policy ALREADY applies to windmill_user
--     (directly, via role membership, or via a PUBLIC-scoped policy),
--     because enabling RLS there would newly filter rows;
--   * skip partitions -- the parent governs;
--   * per-table probe AFTER the flip: read the table as windmill_user
--     and compare against the owner's count. Any regression aborts
--     (strict mode) or reverts just that table (cron mode);
--   * reconcile on every run: permissive policies are OR-ed, so if a
--     Windmill upgrade ever ships real windmill_user policies on a
--     table we hold a compat policy on, ours is dropped rather than
--     left to widen access past theirs -- but only once upstream
--     covers ALL of SELECT/INSERT/UPDATE/DELETE. Policies apply per
--     command and an uncovered command is deny-all, so dropping the
--     FOR ALL compat policy against a partial (e.g. SELECT-only)
--     upstream policy would silently break the engine's writes.
--     Partial coverage keeps the compat policy and raises a WARNING.
--
-- Upstream context: backend/migrations/20260125000000_v2_finalize
-- explicitly runs `ALTER TABLE v2_job_queue/v2_job_completed DISABLE
-- ROW LEVEL SECURITY`. RLS-off on the satellites is deliberate, and
-- the leftover admin_policy is what the linter trips over. Enabling
-- RLS with a permissive compat policy keeps their access model and
-- clears the finding without deleting anything Windmill created.
--
-- Windmill owns its table lifecycle, so nothing here names a table.
-- ============================================================

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';

-- ===========================================
-- AUDIT: which relations violate the invariant
-- ===========================================

CREATE OR REPLACE FUNCTION windmill.rls_drift()
RETURNS TABLE (relation text, policy_count int, auto_fixable boolean)
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $$
    SELECT c.oid::regclass::text,
           (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid = c.oid),
           -- Auto-fixable only when NO existing policy already applies to
           -- windmill_user. polroles = {0} means PUBLIC, which covers every
           -- role; membership matters too, since a policy granted to a role
           -- windmill_user belongs to also applies to it.
           NOT EXISTS (
               SELECT 1
               FROM pg_policy p
               WHERE p.polrelid = c.oid
                 AND (
                     0 = ANY (p.polroles)
                     OR EXISTS (
                         SELECT 1 FROM unnest(p.polroles) AS pr(roleoid)
                         WHERE pg_has_role('windmill_user', pr.roleoid, 'MEMBER')
                     )
                 )
           )
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'windmill'
      AND c.relkind IN ('r', 'p')
      AND NOT c.relispartition
      AND NOT c.relrowsecurity
      AND EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)
    ORDER BY 1;
$$;

ALTER FUNCTION windmill.rls_drift() OWNER TO postgres;
REVOKE ALL ON FUNCTION windmill.rls_drift() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION windmill.rls_drift() TO postgres;

COMMENT ON FUNCTION windmill.rls_drift() IS
    'Lists windmill tables carrying policies while RLS is disabled (Supabase linter policy_exists_rls_disabled). auto_fixable=false means a policy already applies to windmill_user, so enabling RLS would newly filter rows -- review by hand. Empty result = healthy.';

-- ===========================================
-- PROBE: can windmill_user still read the table?
--
-- Bounded (LIMIT 1000) so it stays cheap on hot tables. Returns
-- true when windmill_user sees what the owner sees. SET ROLE plus
-- the session GUCs Windmill's own policies read, pre-set so that
-- evaluating them cannot error on an unset parameter. Role is reset
-- on every exit path.
--
-- Deliberately SECURITY INVOKER: postgres cannot SET/RESET ROLE
-- inside a SECURITY DEFINER function, and every caller (dbmate,
-- pg_cron) already connects as postgres. EXECUTE stays postgres-only.
-- ===========================================

CREATE OR REPLACE FUNCTION windmill.rls_user_can_read(p_relation regclass)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = pg_catalog
SET lock_timeout = '2s'
AS $$
DECLARE
    owner_rows int;
    user_rows  int;
BEGIN
    EXECUTE format('SELECT count(*) FROM (SELECT 1 FROM %s LIMIT 1000) s', p_relation)
       INTO owner_rows;

    IF owner_rows = 0 THEN
        RETURN true;
    END IF;

    BEGIN
        SET LOCAL ROLE windmill_user;
        PERFORM set_config('session.user', 'kbve_rls_probe', true);
        PERFORM set_config('session.groups', '', true);
        PERFORM set_config('session.folders_read', '', true);

        EXECUTE format('SELECT count(*) FROM (SELECT 1 FROM %s LIMIT 1000) s', p_relation)
           INTO user_rows;

        RESET ROLE;
    EXCEPTION WHEN OTHERS THEN
        RESET ROLE;
        RAISE NOTICE 'windmill.rls_user_can_read: probe of % errored (%), treating as unreadable',
            p_relation, SQLERRM;
        RETURN false;
    END;

    RETURN user_rows = owner_rows;
END;
$$;

ALTER FUNCTION windmill.rls_user_can_read(regclass) OWNER TO postgres;
REVOKE ALL ON FUNCTION windmill.rls_user_can_read(regclass) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION windmill.rls_user_can_read(regclass) TO postgres;

COMMENT ON FUNCTION windmill.rls_user_can_read(regclass) IS
    'True when windmill_user sees the same (bounded) row count as the table owner. Used to prove an RLS flip did not black out the engine. Vacuously true on empty tables.';

-- ===========================================
-- ENFORCE: compat policy, flip RLS, verify, revert on regression
-- ===========================================

CREATE OR REPLACE FUNCTION windmill.enforce_policy_rls(p_strict boolean DEFAULT false)
RETURNS int
LANGUAGE plpgsql
SET search_path = pg_catalog
SET lock_timeout = '2s'
AS $$
DECLARE
    target record;
    fixed int := 0;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'windmill_user') THEN
        RAISE NOTICE 'windmill.enforce_policy_rls: windmill_user role absent; nothing to do';
        RETURN 0;
    END IF;

    -- Reconcile first. Permissive policies are OR-ed, so if a Windmill upgrade
    -- ever ships its own windmill_user policies on a table we hold a compat
    -- policy on, ours would nullify theirs and widen access across workspaces.
    -- Theirs wins -- but ONLY once they cover every command. Policies apply
    -- per command (SELECT/INSERT/UPDATE/DELETE), and a command with no
    -- applicable policy is deny-all: dropping our FOR ALL compat policy while
    -- upstream ships only e.g. FOR SELECT would silently kill the engine's
    -- writes. So require, for each of r/a/w/d, a non-compat PERMISSIVE policy
    -- applying to windmill_user before dropping ours; partial coverage keeps
    -- the compat policy and is reported for manual review.
    FOR target IN
        SELECT c.oid::regclass::text AS relation
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'windmill'
          AND c.relkind IN ('r', 'p')
          AND EXISTS (
              SELECT 1 FROM pg_policy p
              WHERE p.polrelid = c.oid AND p.polname = 'kbve_windmill_user_all'
          )
          AND NOT EXISTS (
              SELECT 1
              FROM unnest(ARRAY['r', 'a', 'w', 'd']) AS cmd(cmd)
              WHERE NOT EXISTS (
                  SELECT 1 FROM pg_policy p
                  WHERE p.polrelid = c.oid
                    AND p.polname <> 'kbve_windmill_user_all'
                    AND p.polpermissive
                    AND p.polcmd::text IN ('*', cmd.cmd)
                    AND (
                        0 = ANY (p.polroles)
                        OR EXISTS (
                            SELECT 1 FROM unnest(p.polroles) AS pr(roleoid)
                            WHERE pg_has_role('windmill_user', pr.roleoid, 'MEMBER')
                        )
                    )
              )
          )
        ORDER BY 1
    LOOP
        EXECUTE format('DROP POLICY kbve_windmill_user_all ON %s', target.relation);
        RAISE NOTICE
            'windmill.enforce_policy_rls: dropped compat policy on % (Windmill now ships full-command windmill_user coverage)',
            target.relation;
    END LOOP;

    -- Partial upstream coverage: our permissive compat policy still OR-widens
    -- the commands upstream DOES cover, but dropping it would deny the rest.
    -- Availability wins; surface the overlap for manual review.
    FOR target IN
        SELECT c.oid::regclass::text AS relation
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'windmill'
          AND c.relkind IN ('r', 'p')
          AND EXISTS (
              SELECT 1 FROM pg_policy p
              WHERE p.polrelid = c.oid AND p.polname = 'kbve_windmill_user_all'
          )
          AND EXISTS (
              SELECT 1 FROM pg_policy p
              WHERE p.polrelid = c.oid
                AND p.polname <> 'kbve_windmill_user_all'
                AND (
                    0 = ANY (p.polroles)
                    OR EXISTS (
                        SELECT 1 FROM unnest(p.polroles) AS pr(roleoid)
                        WHERE pg_has_role('windmill_user', pr.roleoid, 'MEMBER')
                    )
                )
          )
        ORDER BY 1
    LOOP
        RAISE WARNING
            'windmill.enforce_policy_rls: % has upstream windmill_user policies covering only some commands; compat policy kept to protect the rest -- review by hand',
            target.relation;
    END LOOP;

    FOR target IN SELECT relation, auto_fixable FROM windmill.rls_drift() LOOP
        IF NOT target.auto_fixable THEN
            RAISE NOTICE
                'windmill.enforce_policy_rls: skipping % (a policy already applies to windmill_user; needs manual review)',
                target.relation;
            CONTINUE;
        END IF;

        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_policy
                WHERE polrelid = target.relation::regclass
                  AND polname = 'kbve_windmill_user_all'
            ) THEN
                EXECUTE format(
                    'CREATE POLICY kbve_windmill_user_all ON %s FOR ALL TO windmill_user USING (true) WITH CHECK (true)',
                    target.relation
                );
            END IF;

            EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', target.relation);

            IF NOT windmill.rls_user_can_read(target.relation::regclass) THEN
                RAISE EXCEPTION
                    'enabling RLS on % hid rows from windmill_user; refusing to leave the engine blacked out',
                    target.relation;
            END IF;

            fixed := fixed + 1;
            RAISE NOTICE 'windmill.enforce_policy_rls: enabled RLS on % (compat policy in place, read verified)',
                target.relation;
        EXCEPTION WHEN OTHERS THEN
            IF p_strict THEN
                RAISE;
            END IF;
            RAISE WARNING 'windmill.enforce_policy_rls: left % untouched: %', target.relation, SQLERRM;
        END;
    END LOOP;

    RETURN fixed;
END;
$$;

ALTER FUNCTION windmill.enforce_policy_rls(boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION windmill.enforce_policy_rls(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION windmill.enforce_policy_rls(boolean) TO postgres;

COMMENT ON FUNCTION windmill.enforce_policy_rls(boolean) IS
    'Adds a permissive windmill_user compat policy, enables RLS, and probes the result on every windmill table that has policies, RLS off, and no policy already applying to windmill_user. Returns the number of relations changed. p_strict=true re-raises (migration apply); false reverts the offending table and continues (cron). Idempotent.';

-- ===========================================
-- ONE-SHOT: clear the current offenders
-- ===========================================

DO $$
DECLARE
    fixed int;
    skipped text;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'windmill') THEN
        RAISE NOTICE 'windmill_rls_enable: windmill schema absent; nothing to do';
        RETURN;
    END IF;

    SELECT windmill.enforce_policy_rls(true) INTO fixed;

    SELECT string_agg(relation, ', ') INTO skipped
    FROM windmill.rls_drift() WHERE NOT auto_fixable;

    RAISE NOTICE 'windmill_rls_enable: % relation(s) switched to RLS.', fixed;
    IF skipped IS NOT NULL THEN
        RAISE NOTICE 'windmill_rls_enable: left for manual review: %', skipped;
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
    SELECT string_agg(relation, ', ') INTO offenders
    FROM windmill.rls_drift() WHERE auto_fixable;
    IF offenders IS NOT NULL THEN
        RAISE EXCEPTION 'windmill relations still have policies with RLS disabled: %', offenders;
    END IF;

    -- No RLS-enabled windmill table may be a black hole for windmill_user.
    SELECT string_agg(c.oid::regclass::text, ', ' ORDER BY c.oid::regclass::text)
    INTO offenders
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'windmill'
      AND c.relkind IN ('r', 'p')
      AND NOT c.relispartition
      AND c.relrowsecurity
      AND has_table_privilege('windmill_user', c.oid, 'SELECT')
      AND EXISTS (
          SELECT 1 FROM pg_policy p
          WHERE p.polrelid = c.oid AND p.polname = 'kbve_windmill_user_all'
      )
      AND NOT windmill.rls_user_can_read(c.oid::regclass);

    IF offenders IS NOT NULL THEN
        RAISE EXCEPTION 'windmill_user cannot read RLS-enabled relation(s): %', offenders;
    END IF;

    RAISE NOTICE 'windmill_rls_enable: no policy-without-RLS relations remain; windmill_user reads verified.';
END;
$$ LANGUAGE plpgsql;

-- migrate:down

SET LOCAL lock_timeout = '2s';

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
          AND EXISTS (
              SELECT 1 FROM pg_policy p
              WHERE p.polrelid = c.oid AND p.polname = 'kbve_windmill_user_all'
          )
        ORDER BY 1
    LOOP
        EXECUTE format('ALTER TABLE %s DISABLE ROW LEVEL SECURITY', target.relident);
        EXECUTE format('DROP POLICY kbve_windmill_user_all ON %s', target.relident);
    END LOOP;
END;
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS windmill.enforce_policy_rls(boolean);
DROP FUNCTION IF EXISTS windmill.rls_user_can_read(regclass);
DROP FUNCTION IF EXISTS windmill.rls_drift();
