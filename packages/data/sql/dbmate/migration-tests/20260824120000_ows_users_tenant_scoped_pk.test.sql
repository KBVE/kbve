-- Companion test fixtures for 20260824120000_ows_users_tenant_scoped_pk.
-- Run via: ./test-migration.sh 20260824120000_ows_users_tenant_scoped_pk
--
-- The property under test is the one the migration exists for: the SAME UserGUID (a Supabase
-- `sub`) must be provisionable into two different tenants, and the two rows must stay
-- independently addressable. The old global PK on Users.UserGUID made this impossible.
--
-- Also asserted: the widened FKs actually enforce tenancy, which the old UserGUID-only FKs did
-- not, and that the FKs are VALIDATED (20260824120100 adds them NOT VALID then validates -- a
-- constraint left convalidated=false silently stops constraining pre-existing rows).

-- SEED

DO $$
DECLARE
    v_tenant_a UUID := '00000000-0000-4000-8000-00000000a001';
    v_tenant_b UUID := '00000000-0000-4000-8000-00000000b002';
    v_user     UUID := '00000000-0000-4000-8000-000000005ab0';
BEGIN
    INSERT INTO ows.Customers (CustomerGUID, CustomerName, CustomerEmail)
    VALUES (v_tenant_a, 'tenant-a', 'a@example.test'),
           (v_tenant_b, 'tenant-b', 'b@example.test');

    -- Same Supabase account, same email, both tenants. AK_User is (CustomerGUID, Email, Role) so
    -- the shared email is legal; the PK is what used to reject the second row.
    INSERT INTO ows.Users (CustomerGUID, UserGUID, FirstName, LastName, Email, PasswordHash, Role)
    VALUES (v_tenant_a, v_user, 'Cross', 'Tenant', 'shared@example.test', 'x', 'Player'),
           (v_tenant_b, v_user, 'Cross', 'Tenant', 'shared@example.test', 'x', 'Player');

    INSERT INTO ows.UserSessions (CustomerGUID, UserSessionGUID, UserGUID, LoginDate)
    VALUES (v_tenant_a, gen_random_uuid(), v_user, NOW()),
           (v_tenant_b, gen_random_uuid(), v_user, NOW());
END;
$$;

-- ASSERT_AFTER_UP

-- 1. Both tenants hold the account.
DO $$
DECLARE
    v_user UUID := '00000000-0000-4000-8000-000000005ab0';
    n      BIGINT;
BEGIN
    SELECT count(*) INTO n FROM ows.Users WHERE UserGUID = v_user;
    IF n <> 2 THEN
        RAISE EXCEPTION 'fail: expected the same UserGUID in 2 tenants, found %', n;
    END IF;
END;
$$;

-- 2. The PK is the composite, not UserGUID alone.
DO $$
DECLARE
    v_cols TEXT;
BEGIN
    SELECT string_agg(lower(a.attname), ',' ORDER BY k.ord)
      INTO v_cols
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
     WHERE n.nspname = 'ows' AND c.conname = 'pk_users' AND c.contype = 'p';

    IF v_cols IS DISTINCT FROM 'customerguid,userguid' THEN
        RAISE EXCEPTION 'fail: PK_Users is (%), expected (customerguid,userguid)', v_cols;
    END IF;
END;
$$;

-- 3. A duplicate WITHIN one tenant is still rejected.
DO $$
DECLARE
    v_tenant_a UUID := '00000000-0000-4000-8000-00000000a001';
    v_user     UUID := '00000000-0000-4000-8000-000000005ab0';
BEGIN
    BEGIN
        INSERT INTO ows.Users (CustomerGUID, UserGUID, FirstName, LastName, Email, PasswordHash, Role)
        VALUES (v_tenant_a, v_user, 'Dup', 'Dup', 'dup@example.test', 'x', 'Player');
        RAISE EXCEPTION 'fail: duplicate (CustomerGUID, UserGUID) was accepted';
    EXCEPTION WHEN unique_violation THEN
        NULL;
    END;
END;
$$;

-- 4. The widened FK rejects a child row pointing at another tenant's user. Under the old
--    UserGUID-only FK this insert succeeded.
DO $$
DECLARE
    v_tenant_a UUID := '00000000-0000-4000-8000-00000000a001';
    v_orphan   UUID := '00000000-0000-4000-8000-00000000dead';
BEGIN
    BEGIN
        INSERT INTO ows.UserSessions (CustomerGUID, UserSessionGUID, UserGUID, LoginDate)
        VALUES (v_tenant_a, gen_random_uuid(), v_orphan, NOW());
        RAISE EXCEPTION 'fail: UserSessions accepted a UserGUID with no Users row in the tenant';
    EXCEPTION WHEN foreign_key_violation THEN
        NULL;
    END;
END;
$$;

-- 5. Both FKs are validated, not left NOT VALID by a half-applied deploy.
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

-- ASSERT_AFTER_DOWN

-- The down block restores the global PK, so the cross-tenant pair cannot survive it. This
-- section runs only in the local test-migration.sh flow, where the SEED above is rolled back
-- with it; assert the shape, not the data.
DO $$
DECLARE
    v_cols TEXT;
BEGIN
    SELECT string_agg(lower(a.attname), ',' ORDER BY k.ord)
      INTO v_cols
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
     WHERE n.nspname = 'ows' AND c.conname = 'pk_users' AND c.contype = 'p';

    IF v_cols IS DISTINCT FROM 'userguid' THEN
        RAISE EXCEPTION 'fail: PK_Users is (%) after rollback, expected (userguid)', v_cols;
    END IF;
END;
$$;
