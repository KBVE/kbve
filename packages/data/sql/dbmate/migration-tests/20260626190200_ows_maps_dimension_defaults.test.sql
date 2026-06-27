-- Companion test fixtures for 20260626190200_ows_maps_dimension_defaults.
-- Run via: ./test-migration.sh 20260626190200_ows_maps_dimension_defaults
--
-- Replays the LITERAL ZonesRepo::add_zone statement (column list copied verbatim,
-- NO Width/Height) so it exercises the exact tuple the endpoint sends. Before the
-- defaults this errored with "null value in column width"; after, the candidate
-- tuple is valid. Covers both the conflict-update path (real dimensions preserved)
-- and the fresh-insert path (lands the 0/0 placeholder).

-- SEED

SET search_path TO ows, public;

INSERT INTO Customers (CustomerGUID, CustomerName, CustomerEmail)
VALUES ('00000000-0000-0000-0000-0000000000aa', 'uqtest', 'uq@test.local')
ON CONFLICT DO NOTHING;

-- A map registered with real dimensions, as the map-registration path / seed does.
INSERT INTO Maps (CustomerGUID, MapName, Width, Height, ZoneName)
VALUES ('00000000-0000-0000-0000-0000000000aa', 'greenshire', 10, 12, 'old_zone')
ON CONFLICT DO NOTHING;

-- ASSERT_AFTER_UP

-- Conflict-update path: literal add_zone tuple (no Width/Height) must succeed and
-- update in place WITHOUT clobbering the existing real dimensions.
DO $$
DECLARE
    cnt int;
    w   int;
    h   int;
    z   text;
BEGIN
    INSERT INTO ows.Maps (customerguid, mapname, zonename, softplayercap, hardplayercap, mapmode)
    VALUES ('00000000-0000-0000-0000-0000000000aa', 'greenshire', 'new_zone', 70, 90, 1)
    ON CONFLICT (customerguid, mapname) DO UPDATE
        SET zonename = EXCLUDED.zonename,
            softplayercap = EXCLUDED.softplayercap,
            hardplayercap = EXCLUDED.hardplayercap,
            mapmode = EXCLUDED.mapmode;

    SELECT count(*) INTO cnt FROM ows.Maps
     WHERE customerguid = '00000000-0000-0000-0000-0000000000aa' AND mapname = 'greenshire';
    IF cnt <> 1 THEN
        RAISE EXCEPTION 'fail: add_zone upsert produced % rows for greenshire, expected 1', cnt;
    END IF;

    SELECT width, height, zonename INTO w, h, z FROM ows.Maps
     WHERE customerguid = '00000000-0000-0000-0000-0000000000aa' AND mapname = 'greenshire';
    IF w <> 10 OR h <> 12 THEN
        RAISE EXCEPTION 'fail: add_zone clobbered dimensions to (%,%), expected (10,12)', w, h;
    END IF;
    IF z <> 'new_zone' THEN
        RAISE EXCEPTION 'fail: add_zone did not update zonename (got %)', z;
    END IF;
END;
$$;

-- Fresh-insert path: a brand-new map with the literal add_zone tuple lands the
-- 0/0 default rather than raising a NOT NULL violation.
DO $$
DECLARE
    w int;
    h int;
BEGIN
    INSERT INTO ows.Maps (customerguid, mapname, zonename, softplayercap, hardplayercap, mapmode)
    VALUES ('00000000-0000-0000-0000-0000000000aa', 'brandnew', 'z', 70, 90, 1)
    ON CONFLICT (customerguid, mapname) DO UPDATE SET zonename = EXCLUDED.zonename;

    SELECT width, height INTO w, h FROM ows.Maps
     WHERE customerguid = '00000000-0000-0000-0000-0000000000aa' AND mapname = 'brandnew';
    IF w <> 0 OR h <> 0 THEN
        RAISE EXCEPTION 'fail: fresh add_zone map got dimensions (%,%), expected default (0,0)', w, h;
    END IF;
END;
$$;

-- ASSERT_AFTER_DOWN

-- Defaults removed: the literal add_zone tuple must once again violate NOT NULL,
-- proving the down truly reverts the fix.
DO $$
DECLARE
    raised boolean := false;
BEGIN
    BEGIN
        INSERT INTO ows.Maps (customerguid, mapname, zonename, softplayercap, hardplayercap, mapmode)
        VALUES ('00000000-0000-0000-0000-0000000000aa', 'afterdown', 'z', 70, 90, 1);
    EXCEPTION WHEN not_null_violation THEN
        raised := true;
    END;
    IF NOT raised THEN
        RAISE EXCEPTION 'fail: expected NOT NULL violation on Width/Height after default dropped';
    END IF;
END;
$$;
