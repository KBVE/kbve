-- migrate:up

-- Same class of bug as 20260626190000: ZonesRepo::add_zone upserts with
--   INSERT INTO maps (...) ON CONFLICT (customerguid, mapname) DO UPDATE ...
-- but Maps only had PK (CustomerGUID, MapID) — a surrogate SERIAL — so the
-- conflict target matched no constraint and every add_zone raised
-- "there is no unique or exclusion constraint matching the ON CONFLICT specification".
-- MapName is the natural per-tenant key (it is what characters.mapname and the
-- tenant seed reference), so enforce it as UNIQUE.
SET search_path TO ows;

-- No dedup step: add_zone was the only writer keyed on mapname and it always
-- failed, so duplicates cannot have been introduced through it; the tenant seed
-- inserts exactly one Map per name. A pre-existing duplicate (data error) should
-- fail loudly here rather than be silently collapsed, since Maps is referenced by
-- MapInstances.MapID.
ALTER TABLE Maps
    ADD CONSTRAINT UQ_Maps_MapName
        UNIQUE (CustomerGUID, MapName);

-- migrate:down

SET search_path TO ows;

ALTER TABLE Maps
    DROP CONSTRAINT IF EXISTS UQ_Maps_MapName;
