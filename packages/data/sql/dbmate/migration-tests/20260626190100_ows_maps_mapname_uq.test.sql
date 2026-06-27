-- Companion test fixtures for 20260626190100_ows_maps_mapname_uq.
-- Run via: ./test-migration.sh 20260626190100_ows_maps_mapname_uq
--
-- Constraint existence/rollback invariants only. Behavioral add_zone coverage lives
-- in the sibling 20260626190200_ows_maps_dimension_defaults test (the newest
-- migration, which test-migration.sh can fully exercise) and replays the LITERAL
-- repo SQL there. An earlier version of this file replayed a hand-written upsert
-- that supplied Width/Height, which masked the real add_zone NOT NULL bug — removed.

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
