-- Companion test fixtures for 20260824120100_ows_users_tenant_fk_validate.
-- Run via: ./test-migration.sh 20260824120100_ows_users_tenant_fk_validate
--
-- 20260824120000 adds FK_Characters_UserGUID / FK_UserSessions_UserGUID NOT VALID; this migration
-- validates them. A constraint left convalidated=false silently stops constraining pre-existing
-- rows, so assert the flag flipped.

-- SEED

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

-- ASSERT_AFTER_DOWN

-- The down block is a no-op (there is no un-validate); nothing to assert.
