-- migrate:up

-- Same class of bug as 20260626190000: ZonesRepo::add_zone upserts with
--   INSERT INTO maps (...) ON CONFLICT (customerguid, mapname) DO UPDATE ...
-- but Maps only had PK (CustomerGUID, MapID) — a surrogate SERIAL — so the
-- conflict target matched no constraint and every add_zone raised
-- "there is no unique or exclusion constraint matching the ON CONFLICT specification".
-- MapName is the natural per-tenant key (it is what characters.mapname and the
-- tenant seed reference), so enforce it as UNIQUE.
SET search_path TO ows;

-- Hold writers off for the gap between the duplicate check and ADD CONSTRAINT so a
-- concurrent insert can't slip a duplicate in and revive the opaque error. Reads
-- still proceed.
LOCK TABLE Maps IN SHARE ROW EXCLUSIVE MODE;

-- No dedup step: add_zone was the only writer keyed on mapname and it always
-- failed, so duplicates cannot have been introduced through it; the tenant seed
-- inserts exactly one Map per name. A pre-existing duplicate (data error) should
-- fail loudly here rather than be silently collapsed, since Maps is referenced by
-- MapInstances.MapID.
--
-- Pre-flight: surface any such duplicate with an actionable message instead of the
-- opaque "could not create unique index ... is duplicated" the bare ADD CONSTRAINT
-- emits. We deliberately do NOT auto-dedup (unlike 20260626190000): collapsing a Map
-- row could orphan MapInstances that FK its MapID, so a human must repoint and delete
-- the stale row by hand before this migration can apply.
DO $$
DECLARE
    dup RECORD;
BEGIN
    SELECT CustomerGUID, MapName, count(*) AS n
      INTO dup
      FROM Maps
     GROUP BY CustomerGUID, MapName
    HAVING count(*) > 1
     LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION
            'UQ_Maps_MapName cannot be added: % rows share (CustomerGUID=%, MapName=%). Repoint MapInstances.MapID off the stale Map and delete it by hand before applying.',
            dup.n, dup.CustomerGUID, dup.MapName
            USING ERRCODE = 'unique_violation';
    END IF;
END;
$$;

ALTER TABLE Maps
    ADD CONSTRAINT UQ_Maps_MapName
        UNIQUE (CustomerGUID, MapName);

-- migrate:down

SET search_path TO ows;

ALTER TABLE Maps
    DROP CONSTRAINT IF EXISTS UQ_Maps_MapName;
