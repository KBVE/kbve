-- migrate:up

-- UQ_Maps_MapName (20260626190100) made the ON CONFLICT arbiter resolvable, but
-- ZonesRepo::add_zone is STILL broken: its INSERT omits Width/Height, and Maps
-- declares both SMALLINT NOT NULL with no default. Postgres validates NOT NULL on
-- the candidate tuple BEFORE ON CONFLICT arbitration, so add_zone raises
--   "null value in column \"width\" of relation \"maps\" violates not-null constraint"
-- on EVERY call -- even when the conflicting row already exists. The constraint was
-- necessary but not sufficient.
--
-- Give Width/Height a default so the candidate tuple is valid. On the normal path the
-- map already exists, the INSERT conflicts, and DO UPDATE (which never touches
-- Width/Height) preserves the real dimensions seeded by the map-registration path;
-- only a genuinely new add_zone map lands 0/0 placeholders. Mirrors the other
-- defaulted Maps columns (MapMode/SoftPlayerCap/HardPlayerCap/...).
SET search_path TO ows;

ALTER TABLE Maps ALTER COLUMN Width SET DEFAULT 0;
ALTER TABLE Maps ALTER COLUMN Height SET DEFAULT 0;

-- migrate:down

SET search_path TO ows;

ALTER TABLE Maps ALTER COLUMN Width DROP DEFAULT;
ALTER TABLE Maps ALTER COLUMN Height DROP DEFAULT;
