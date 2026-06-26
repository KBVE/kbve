-- Companion test fixtures for 20260626190100_ows_maps_mapname_uq.
-- Run via: ./test-migration.sh 20260626190100_ows_maps_mapname_uq
--
-- Seeds one Map, then after the constraint exists replays ZonesRepo::add_zone's
-- ON CONFLICT (customerguid, mapname) DO UPDATE to prove it resolves and updates in
-- place instead of raising "no unique or exclusion constraint matching" or inserting
-- a duplicate.

-- SEED

SET search_path TO ows, public;

INSERT INTO Customers (CustomerGUID, CustomerName, CustomerEmail)
VALUES ('00000000-0000-0000-0000-0000000000aa', 'uqtest', 'uq@test.local')
ON CONFLICT DO NOTHING;

INSERT INTO Maps (CustomerGUID, MapName, Width, Height, ZoneName)
VALUES ('00000000-0000-0000-0000-0000000000aa', 'greenshire', 1, 1, 'greenshire')
ON CONFLICT DO NOTHING;

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

-- add_zone's upsert now updates the existing Map rather than erroring or duplicating.
DO $$
DECLARE
    cnt int;
    w   int;
BEGIN
    INSERT INTO ows.Maps (CustomerGUID, MapName, Width, Height, ZoneName, SoftPlayerCap, HardPlayerCap, MapMode)
    VALUES ('00000000-0000-0000-0000-0000000000aa', 'greenshire', 2, 2, 'greenshire', 70, 90, 1)
    ON CONFLICT (CustomerGUID, MapName)
    DO UPDATE SET Width = EXCLUDED.Width, Height = EXCLUDED.Height, ZoneName = EXCLUDED.ZoneName;

    SELECT count(*) INTO cnt
    FROM ows.Maps
    WHERE CustomerGUID = '00000000-0000-0000-0000-0000000000aa' AND MapName = 'greenshire';
    IF cnt <> 1 THEN
        RAISE EXCEPTION 'fail: maps upsert produced % rows for greenshire, expected 1 (duplicate instead of update)', cnt;
    END IF;

    SELECT Width INTO w
    FROM ows.Maps
    WHERE CustomerGUID = '00000000-0000-0000-0000-0000000000aa' AND MapName = 'greenshire';
    IF w <> 2 THEN
        RAISE EXCEPTION 'fail: maps upsert did not update existing row (Width=%)', w;
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
