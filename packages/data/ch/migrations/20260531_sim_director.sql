-- ---------------------------------------------------------------------------
-- Migration: introduce gameops.sim_snapshots_raw (+ Distributed twin) for the
-- agones-factorio-relay `sim_director` Phase 1 poller (issue #11138 / Phase 5
-- of the relay design map in apps/kbve/astro-kbve/src/content/docs/project/
-- agones-factorio-relay.mdx).
--
-- The canonical schema lives in packages/data/ch/schemas/factorio.sql; this
-- migration is the operator-runnable cut for an already-applied production
-- cluster. Idempotent — every DDL is `IF NOT EXISTS` + `ON CLUSTER 'cluster'`.
--
-- Apply (planned-window operator session):
--
--   kubectl -n clickhouse exec -i \
--     chi-clickhouse-cluster-cluster-0-0-0 -c clickhouse -- \
--     clickhouse-client --multiquery \
--     < packages/data/ch/migrations/20260531_sim_director.sql
--
-- Record the apply:
--
--   INSERT INTO observability.schema_migrations (name, applied_by)
--   VALUES ('20260531_sim_director', '<operator>');
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS gameops.sim_snapshots_raw ON CLUSTER 'cluster'
(
    ts          DateTime64(3, 'UTC'),
    server_id   LowCardinality(String),
    tick        UInt64,
    evolution   Float64,
    players     UInt16,
    pollution   Float64,
    ups         Float64,
    ingested_at DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = ReplicatedMergeTree(
    '/clickhouse/tables/{shard}/gameops/sim_snapshots_raw',
    '{replica}'
)
ORDER BY (server_id, ts)
PARTITION BY toYYYYMMDD(ts)
TTL toDateTime(ts) + INTERVAL 14 DAY;

CREATE TABLE IF NOT EXISTS gameops.sim_snapshots ON CLUSTER 'cluster'
AS gameops.sim_snapshots_raw
ENGINE = Distributed('cluster', 'gameops', 'sim_snapshots_raw', rand());
