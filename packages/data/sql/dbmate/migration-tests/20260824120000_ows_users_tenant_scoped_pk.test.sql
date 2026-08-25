-- Companion test fixtures for 20260824120000_ows_users_tenant_scoped_pk.
-- Run via: ./test-migration.sh 20260824120000_ows_users_tenant_scoped_pk
--
-- The property under test is the one the migration exists for: the SAME UserGUID (a Supabase
-- `sub`) must be provisionable into two different tenants, and the two rows must stay
-- independently addressable. The old global PK on Users.UserGUID made this impossible.
--
-- Also asserted: the widened FKs actually enforce tenancy, which the old UserGUID-only FKs did
-- not. FK validation (convalidated) is asserted by the companion test for 20260824120100 --
-- test-migration.sh stages only migrations up to its target, so the validate migration never
-- runs when this one is under test.
--
-- Harness shape matters here: SEED runs BEFORE the migration (old global PK still in force), and
-- seed rows are NOT removed before `dbmate rollback`. So the second-tenant row is inserted inside
-- ASSERT_AFTER_UP and removed again at its end, otherwise the seed would fail on the old PK and
-- the down block could not restore it.

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

    -- Only tenant A before the migration: the old PK rejects the same UserGUID twice.
    INSERT INTO ows.Users (CustomerGUID, UserGUID, FirstName, LastName, Email, PasswordHash, Role)
    VALUES (v_tenant_a, v_user, 'Cross', 'Tenant', 'shared@example.test', 'x', 'Player');

    INSERT INTO ows.UserSessions (CustomerGUID, UserSessionGUID, UserGUID, LoginDate)
    VALUES (v_tenant_a, gen_random_uuid(), v_user, NOW());
END;
$$;

-- ASSERT_AFTER_UP

-- 1. The same account can now be provisioned into a second tenant. AK_User is
--    (CustomerGUID, Email, Role) so the shared email is legal; the PK is what used to reject
--    this row.
DO $$
DECLARE
    v_tenant_b UUID := '00000000-0000-4000-8000-00000000b002';
    v_user     UUID := '00000000-0000-4000-8000-000000005ab0';
    n          BIGINT;
BEGIN
    INSERT INTO ows.Users (CustomerGUID, UserGUID, FirstName, LastName, Email, PasswordHash, Role)
    VALUES (v_tenant_b, v_user, 'Cross', 'Tenant', 'shared@example.test', 'x', 'Player');

    INSERT INTO ows.UserSessions (CustomerGUID, UserSessionGUID, UserGUID, LoginDate)
    VALUES (v_tenant_b, gen_random_uuid(), v_user, NOW());

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

-- 4. The widened FK rejects a child row pointing at a user that does not exist in this tenant.
--    Under the old UserGUID-only FK this insert succeeded.
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

-- 5. Remove the second-tenant rows again so the down block can restore PRIMARY KEY (UserGUID).
DO $$
DECLARE
    v_tenant_b UUID := '00000000-0000-4000-8000-00000000b002';
    v_user     UUID := '00000000-0000-4000-8000-000000005ab0';
BEGIN
    DELETE FROM ows.UserSessions WHERE CustomerGUID = v_tenant_b AND UserGUID = v_user;
    DELETE FROM ows.Users        WHERE CustomerGUID = v_tenant_b AND UserGUID = v_user;
END;
$$;

-- ASSERT_AFTER_DOWN

-- The down block restores the global PK; assert the shape.
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
