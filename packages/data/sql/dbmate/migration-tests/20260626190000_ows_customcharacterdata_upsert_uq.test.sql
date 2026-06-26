-- Companion test fixtures for 20260626190000_ows_customcharacterdata_upsert_uq.
-- Run via: ./test-migration.sh 20260626190000_ows_customcharacterdata_upsert_uq
--
-- NOTE: test-migration.sh can only fully exercise the *newest* migration (dbmate
-- `up` is all-or-nothing and the harness rolls back a single migration). Behavioral
-- coverage for the customdata dedup/upsert therefore rides on the sibling maps
-- fixture (20260626190100, currently the newest); this file keeps the constraint
-- existence/rollback invariants only. See the maps test for the upsert assertions.

-- SEED

SELECT 1;

-- ASSERT_AFTER_UP

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE n.nspname = 'ows'
          AND c.conname = 'uq_customcharacterdata_field'
          AND c.contype = 'u'
    ) THEN
        RAISE EXCEPTION 'fail: UQ_CustomCharacterData_Field unique constraint missing after up';
    END IF;
END;
$$;

-- ASSERT_AFTER_DOWN

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE n.nspname = 'ows'
          AND c.conname = 'uq_customcharacterdata_field'
    ) THEN
        RAISE EXCEPTION 'fail: UQ_CustomCharacterData_Field should be dropped after rollback';
    END IF;
END;
$$;
