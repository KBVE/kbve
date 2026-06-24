-- migrate:up transaction:false
SET search_path TO ows;

-- Partial index for the reaper's per-cycle candidate scan
-- (`WHERE customerguid = $1 AND status > 0 ORDER BY lastserveremptydate, mapinstanceid`).
-- Only active rows are indexed, so it stays small regardless of how many status=0 rows accrue.
-- CONCURRENTLY (transaction:false) so the build doesn't take a write-blocking lock on a table
-- that heartbeats write to continuously.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mapinstances_active
    ON MapInstances (CustomerGUID, LastServerEmptyDate, MapInstanceID)
    WHERE Status > 0;

-- migrate:down transaction:false
SET search_path TO ows;

DROP INDEX CONCURRENTLY IF EXISTS idx_mapinstances_active;
