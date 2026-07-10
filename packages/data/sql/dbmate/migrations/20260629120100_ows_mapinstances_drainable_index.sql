-- migrate:up transaction:false
-- NB: no `SET search_path` here. With transaction:false dbmate sends the body as one batch, and a
-- multi-statement batch runs as an implicit transaction block — which CREATE INDEX CONCURRENTLY
-- rejects. The CONCURRENTLY statement must be the only statement, so the schema is qualified inline.
--
-- Backs the fleet-restart reconcile's per-tick `list_drainable_instances` scan
-- (`WHERE customerguid = $1 AND status > 0 AND drainstate IS NULL ORDER BY mapinstanceid LIMIT $2`).
-- Shape matches the query exactly: PARTIAL on the scan's predicate (only not-yet-draining active
-- rows are indexed — the index stays tiny no matter how many status=0 rows accrue) with
-- (CustomerGUID, MapInstanceID) key columns so the ORDER BY … LIMIT is a plain ordered index scan,
-- no sort. (A non-partial (CustomerGUID, Status, DrainState) composite would NOT serve this:
-- `Status > 0` is a range predicate, demoting DrainState to filter-only and providing no
-- mapinstanceid ordering.) `mapinstances` is a hot table (spin-up/teardown write it constantly),
-- so a plain CREATE INDEX would take a write-blocking SHARE lock; CONCURRENTLY avoids that.
--
-- RECOVERY NOTE: a CONCURRENTLY build that is interrupted leaves an INVALID index behind that
-- Postgres silently refuses to use (the scan degrades to a seq-scan with no error). Because of
-- `IF NOT EXISTS`, a re-run sees the name already present and SKIPS the rebuild. ROWS detects this
-- at startup via pg_index.indisvalid and logs a warn (repo::check_drainable_index_valid). Recovery:
--     -- confirm it is invalid:
--     SELECT c.relname FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
--       JOIN pg_namespace n ON n.oid = c.relnamespace
--       WHERE NOT i.indisvalid AND c.relname = 'idx_mapinstances_drainable' AND n.nspname = 'ows';
--     DROP INDEX CONCURRENTLY IF EXISTS ows.idx_mapinstances_drainable;  -- then re-run dbmate up
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mapinstances_drainable
    ON ows.MapInstances (CustomerGUID, MapInstanceID)
    WHERE Status > 0 AND DrainState IS NULL;

-- migrate:down transaction:false
DROP INDEX CONCURRENTLY IF EXISTS ows.idx_mapinstances_drainable;
