-- migrate:up transaction:false
-- NB: no `SET search_path` here. With transaction:false dbmate sends the body as one batch, and a
-- multi-statement batch runs as an implicit transaction block — which CREATE INDEX CONCURRENTLY
-- rejects. The CONCURRENTLY statement must be the only statement, so the schema is qualified inline.
--
-- Partial index for the reaper's per-cycle candidate scan
-- (`WHERE customerguid = $1 AND status > 0 ORDER BY lastserveremptydate, mapinstanceid`).
-- Only active rows are indexed, so it stays small regardless of how many status=0 rows accrue.
-- CONCURRENTLY so the build doesn't take a write-blocking lock on a table heartbeats write to.
--
-- RECOVERY NOTE: a CONCURRENTLY build that is interrupted (pod killed / activeDeadlineSeconds /
-- deadlock) leaves an INVALID index behind. Because of `IF NOT EXISTS`, a re-run sees the name
-- already present and SKIPS the rebuild — so the reaper's candidate scan silently falls back to a
-- seq scan. To recover, drop the stranded index and re-apply this migration:
--     -- confirm it is invalid:
--     SELECT c.relname FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
--       JOIN pg_namespace n ON n.oid = c.relnamespace
--       WHERE NOT i.indisvalid AND c.relname = 'idx_mapinstances_active' AND n.nspname = 'ows';
--     DROP INDEX CONCURRENTLY IF EXISTS ows.idx_mapinstances_active;  -- then re-run dbmate up
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mapinstances_active
    ON ows.MapInstances (CustomerGUID, LastServerEmptyDate, MapInstanceID)
    WHERE Status > 0;

-- migrate:down transaction:false
DROP INDEX CONCURRENTLY IF EXISTS ows.idx_mapinstances_active;
