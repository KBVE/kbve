-- Companion test fixtures for 20260707000000_windmill_schema_init.
-- Run via: ./test-migration.sh 20260707000000_windmill_schema_init

-- SEED
-- No fixtures needed; migration only creates schema, roles, and grants.
SELECT 1;

-- ASSERT_AFTER_UP
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.schemata WHERE schema_name = 'windmill'
    ) THEN
        RAISE EXCEPTION 'fail: windmill schema missing after up';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'windmill_user') THEN
        RAISE EXCEPTION 'fail: windmill_user role missing after up';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_roles WHERE rolname = 'windmill_admin' AND rolbypassrls
    ) THEN
        RAISE EXCEPTION 'fail: windmill_admin role missing or lacks BYPASSRLS';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_auth_members m
        JOIN pg_roles r ON r.oid = m.roleid
        JOIN pg_roles g ON g.oid = m.member
        WHERE r.rolname = 'windmill_user' AND g.rolname = 'windmill_admin'
    ) THEN
        RAISE EXCEPTION 'fail: windmill_admin not member of windmill_user';
    END IF;

    IF NOT has_schema_privilege('windmill_user', 'windmill', 'USAGE') THEN
        RAISE EXCEPTION 'fail: windmill_user lacks USAGE on windmill schema';
    END IF;

    IF has_schema_privilege('anon', 'windmill', 'USAGE') THEN
        RAISE EXCEPTION 'fail: anon must not have USAGE on windmill schema';
    END IF;

    IF has_schema_privilege('authenticated', 'windmill', 'USAGE') THEN
        RAISE EXCEPTION 'fail: authenticated must not have USAGE on windmill schema';
    END IF;
END;
$$;

-- ASSERT_AFTER_DOWN
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.schemata WHERE schema_name = 'windmill'
    ) THEN
        RAISE EXCEPTION 'fail: windmill schema still present after down';
    END IF;
END;
$$;
