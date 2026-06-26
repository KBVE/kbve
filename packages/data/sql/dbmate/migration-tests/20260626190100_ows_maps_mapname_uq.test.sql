-- Companion test fixtures for 20260626190100_ows_maps_mapname_uq.
-- Run via: ./test-migration.sh 20260626190100_ows_maps_mapname_uq

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
          AND c.conname = 'uq_maps_mapname'
          AND c.contype = 'u'
    ) THEN
        RAISE EXCEPTION 'fail: UQ_Maps_MapName unique constraint missing after up';
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
          AND c.conname = 'uq_maps_mapname'
    ) THEN
        RAISE EXCEPTION 'fail: UQ_Maps_MapName should be dropped after rollback';
    END IF;
END;
$$;
