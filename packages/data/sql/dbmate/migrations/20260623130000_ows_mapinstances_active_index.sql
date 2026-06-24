-- migrate:up transaction:false
SET search_path TO ows;

-- Partial index for the reaper's per-cycle candidate scan
-- (`WHERE customerguid = $1 AND status > 0 ORDER BY lastserveremptydate, mapinstanceid`).
-- Only active rows are indexed, so it stays small regardless of how many status=0 rows accrue.
-- CONCURRENTLY (transaction:false) so the build doesn't take a write-blocking lock on a table
-- that heartbeats write to continuously.
--
-- RECOVERY NOTE: a CONCURRENTLY build that is interrupted (pod killed / activeDeadlineSeconds /
-- deadlock) leaves an INVALID index behind. Because of `IF NOT EXISTS`, a re-run sees the name
-- already present and SKIPS the rebuild — so the reaper's candidate scan silently falls back to a
-- seq scan. To recover, drop the stranded index and re-apply this migration:
--     SET search_path TO ows;
--     -- confirm it is invalid:
--     SELECT c.relname FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
--       WHERE NOT i.indisvalid AND c.relname = 'idx_mapinstances_active';
--     DROP INDEX CONCURRENTLY IF EXISTS idx_mapinstances_active;  -- then re-run dbmate up
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mapinstances_active
    ON MapInstances (CustomerGUID, LastServerEmptyDate, MapInstanceID)
    WHERE Status > 0;

-- migrate:down transaction:false
SET search_path TO ows;

DROP INDEX CONCURRENTLY IF EXISTS idx_mapinstances_active;
