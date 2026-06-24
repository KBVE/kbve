-- migrate:up
SET search_path TO ows;

-- Partial index for the reaper's per-cycle candidate scan
-- (`WHERE customerguid = $1 AND status > 0 ORDER BY lastserveremptydate, mapinstanceid`).
-- Only active rows are indexed, so it stays small regardless of how many status=0 rows accrue.
CREATE INDEX IF NOT EXISTS idx_mapinstances_active
    ON MapInstances (CustomerGUID, LastServerEmptyDate, MapInstanceID)
    WHERE Status > 0;

-- migrate:down
SET search_path TO ows;

DROP INDEX IF EXISTS idx_mapinstances_active;
