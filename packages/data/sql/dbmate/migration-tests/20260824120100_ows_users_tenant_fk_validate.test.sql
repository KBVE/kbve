-- Companion test fixtures for 20260824120100_ows_users_tenant_fk_validate.
-- Run via: ./test-migration.sh 20260824120100_ows_users_tenant_fk_validate
--
-- 20260824120000 adds FK_Characters_UserGUID / FK_UserSessions_UserGUID NOT VALID; this migration
-- purges cross-tenant UserSessions and then validates both. A constraint left convalidated=false
-- silently stops constraining pre-existing rows, so assert the flag flipped.
--
-- The first prod run aborted here on real data:
--   pq: insert or update on table "usersessions" violates foreign key constraint
--       "fk_usersessions_userguid"
-- An empty database cannot reproduce that, which is exactly why ci-dbmate-validate went green on
-- the version that failed. The seed below reconstructs the offending shape.
--
-- Harness shape matters. By the time SEED runs, the staged `dbmate up` has already applied this
-- migration once and rolled it back -- and the down block is a no-op, so both FKs are still
-- VALIDATED and would reject the orphan rows outright. The seed therefore puts the constraints
-- back to the NOT VALID state 20260824120000 leaves them in, which is also the only state in which
-- these rows could ever have existed.

-- SEED

DO $$
DECLARE
    v_tenant_a UUID := '00000000-0000-4000-8000-00000000a001';
    v_tenant_b UUID := '00000000-0000-4000-8000-00000000b002';
    v_user     UUID := '00000000-0000-4000-8000-000000005ab0';
    v_ghost    UUID := '00000000-0000-4000-8000-0000000000de';
BEGIN
    INSERT INTO ows.Customers (CustomerGUID, CustomerName, CustomerEmail)
    VALUES (v_tenant_a, 'fkval-tenant-a', 'fkval-a@example.test'),
           (v_tenant_b, 'fkval-tenant-b', 'fkval-b@example.test')
    ON CONFLICT DO NOTHING;

    INSERT INTO ows.Users (CustomerGUID, UserGUID, FirstName, LastName, Email, PasswordHash, Role)
    VALUES (v_tenant_a, v_user, 'Cross', 'Tenant', 'fkval-shared@example.test', 'x', 'Player')
    ON CONFLICT DO NOTHING;

    -- Reproduce the pre-validation state. The constraints come OFF first: NOT VALID skips the
    -- scan of existing rows but still enforces new inserts, so the orphans cannot be written while
    -- either FK is attached. Dropping, inserting, then re-adding NOT VALID is also the real
    -- historical order -- the old UserGUID-only FK never checked CustomerGUID, so these rows were
    -- ordinary writes when they were made.
    -- The harness does not clean seed rows between runs, so make the seed re-runnable.
    DELETE FROM ows.UserSessions
     WHERE UserSessionGUID IN ('00000000-0000-4000-8000-00000000f001',
                               '00000000-0000-4000-8000-00000000f002',
                               '00000000-0000-4000-8000-00000000f003');

    ALTER TABLE ows.Characters   DROP CONSTRAINT IF EXISTS FK_Characters_UserGUID;
    ALTER TABLE ows.UserSessions DROP CONSTRAINT IF EXISTS FK_UserSessions_UserGUID;

    -- Orphan 1: the exact prod shape -- a session in tenant B for a user that only exists in
    -- tenant A. Legal under the old UserGUID-only FK, illegal under the composite one.
    INSERT INTO ows.UserSessions (CustomerGUID, UserSessionGUID, UserGUID, LoginDate)
    VALUES (v_tenant_b, '00000000-0000-4000-8000-00000000f001', v_user, NOW());

    -- Orphan 2: a session whose user is gone entirely.
    INSERT INTO ows.UserSessions (CustomerGUID, UserSessionGUID, UserGUID, LoginDate)
    VALUES (v_tenant_a, '00000000-0000-4000-8000-00000000f002', v_ghost, NOW());

    -- Control: a well-formed session that the purge must NOT touch.
    INSERT INTO ows.UserSessions (CustomerGUID, UserSessionGUID, UserGUID, LoginDate)
    VALUES (v_tenant_a, '00000000-0000-4000-8000-00000000f003', v_user, NOW());

    ALTER TABLE ows.Characters
        ADD CONSTRAINT FK_Characters_UserGUID
            FOREIGN KEY (CustomerGUID, UserGUID) REFERENCES ows.Users (CustomerGUID, UserGUID)
            NOT VALID;

    ALTER TABLE ows.UserSessions
        ADD CONSTRAINT FK_UserSessions_UserGUID
            FOREIGN KEY (CustomerGUID, UserGUID) REFERENCES ows.Users (CustomerGUID, UserGUID)
            NOT VALID;
END;
$$;

-- ASSERT_AFTER_UP

DO $$
DECLARE
    v_unvalidated TEXT;
BEGIN
    SELECT string_agg(c.conname, ', ')
      INTO v_unvalidated
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
     WHERE n.nspname = 'ows'
       AND c.conname IN ('fk_characters_userguid', 'fk_usersessions_userguid')
       AND c.contype = 'f'
       AND NOT c.convalidated;

    IF v_unvalidated IS NOT NULL THEN
        RAISE EXCEPTION 'fail: FK(s) still NOT VALID after up: %', v_unvalidated;
    END IF;
END;
$$;

DO $$
DECLARE
    v_orphans BIGINT;
BEGIN
    SELECT count(*)
      INTO v_orphans
      FROM ows.UserSessions s
      LEFT JOIN ows.Users u
        ON u.CustomerGUID = s.CustomerGUID AND u.UserGUID = s.UserGUID
     WHERE u.UserGUID IS NULL;

    IF v_orphans > 0 THEN
        RAISE EXCEPTION 'fail: % cross-tenant UserSessions rows survived the purge', v_orphans;
    END IF;
END;
$$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM ows.UserSessions
         WHERE UserSessionGUID IN ('00000000-0000-4000-8000-00000000f001',
                                   '00000000-0000-4000-8000-00000000f002')
    ) THEN
        RAISE EXCEPTION 'fail: a seeded orphan session was not deleted';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM ows.UserSessions
         WHERE UserSessionGUID = '00000000-0000-4000-8000-00000000f003'
    ) THEN
        RAISE EXCEPTION 'fail: purge deleted the valid control session';
    END IF;
END;
$$;

-- ASSERT_AFTER_DOWN

-- The down block is a no-op (there is no un-validate); nothing to assert.
