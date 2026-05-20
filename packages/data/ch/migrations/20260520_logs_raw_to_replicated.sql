-- 20260520_logs_raw_to_replicated.sql
--
-- Convert observability.logs_raw from plain MergeTree (per-node, no
-- replication) to ReplicatedMergeTree across the 2 shard × 2 replica
-- cluster, matching the engine declared in
-- packages/data/ch/schemas/observability.sql.
--
-- Background: every node currently has `observability.logs_raw` as plain
-- `MergeTree`. The Distributed engine `Distributed('cluster', ..., rand())`
-- writes each row to a single replica per shard, so reads that load-balance
-- across replicas see a different slice each time — and short-window
-- dashboard queries return 0 when they land on the replica that did not
-- receive the recent batch.
--
-- This migration creates a new ReplicatedMergeTree under a `_new` name,
-- moves every partition into it per-node (since the data lives only on the
-- replica that the Distributed engine happened to write to), then atomically
-- swaps the two tables on the cluster.
--
-- DO NOT execute this file end-to-end with --multiquery. The
-- `ATTACH PARTITION` step is per-node and is described in
-- 20260520_logs_raw_to_replicated_runbook.md.
--
-- ---------------------------------------------------------------------------
-- STEP 1 — Create the replicated shadow table on every node.
-- ---------------------------------------------------------------------------
-- Same column shape as the legacy table. Engine matches schemas/observability.sql.
-- TTL is 8 DAY per the canonical schema; the legacy table drifted to 90 DAY
-- at some point. Operators who want to preserve the 90 DAY retention should
-- patch this DDL before applying.

CREATE TABLE IF NOT EXISTS observability.logs_raw_new ON CLUSTER 'cluster'
(
    timestamp       DateTime64(3, 'UTC'),
    service         LowCardinality(String),
    level           LowCardinality(String),
    message         String,
    metadata        String DEFAULT '{}',
    pod_name        String DEFAULT '',
    pod_namespace   LowCardinality(String) DEFAULT '',
    ingested_at     DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = ReplicatedMergeTree('/clickhouse/tables/{shard}/observability/logs_raw', '{replica}')
ORDER BY (service, timestamp)
PARTITION BY toYYYYMMDD(timestamp)
TTL toDateTime(timestamp) + INTERVAL 8 DAY;

-- ---------------------------------------------------------------------------
-- STEP 2 — Per-node ATTACH PARTITION (NOT executed by this file).
-- ---------------------------------------------------------------------------
-- Each replica holds a disjoint slice of the legacy data, so the ATTACH must
-- run on every node — `ON CLUSTER` distributes the DDL but does not move the
-- data across nodes. Generate and run the per-partition statements on each
-- pod individually; see the runbook for the loop.
--
-- Shape:
--   ALTER TABLE observability.logs_raw_new
--     ATTACH PARTITION ID '<YYYYMMDD>' FROM observability.logs_raw;

-- ---------------------------------------------------------------------------
-- STEP 3 — Atomic swap. After every partition has been attached on every
-- node, swap the two tables in one cluster-wide DDL. Inserts that race the
-- swap will land in whichever table is named `logs_raw` at the moment the
-- Distributed engine resolves the target — both halves of the swap contain
-- the same data after step 2.
-- ---------------------------------------------------------------------------

EXCHANGE TABLES observability.logs_raw AND observability.logs_raw_new ON CLUSTER 'cluster';

-- ---------------------------------------------------------------------------
-- STEP 4 — Drop the now-legacy MergeTree (formerly `logs_raw_new`, which
-- held a copy of the live table at the moment of the swap; after EXCHANGE,
-- the legacy MergeTree data lives under `logs_raw_new`).
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS observability.logs_raw_new ON CLUSTER 'cluster' SYNC;

-- ---------------------------------------------------------------------------
-- STEP 5 — Verification (read-only).
-- ---------------------------------------------------------------------------

-- Every node should now report ReplicatedMergeTree:
--   SELECT hostName(), engine
--     FROM clusterAllReplicas('cluster', system.tables)
--    WHERE database = 'observability' AND name = 'logs_raw';

-- Replica delay should be 0 (or trending to 0):
--   SELECT hostName(), absolute_delay, queue_size
--     FROM clusterAllReplicas('cluster', system.replicas)
--    WHERE database = 'observability' AND table = 'logs_raw';

-- Recent ingest should be visible from any node and any replica:
--   SELECT max(timestamp), max(ingested_at), count() FILTER (WHERE
--     ingested_at > now() - INTERVAL 5 MINUTE)
--   FROM observability.logs_distributed;

-- ---------------------------------------------------------------------------
-- STEP 6 — Record the migration as applied.
-- ---------------------------------------------------------------------------

INSERT INTO observability.schema_migrations (name, applied_by)
VALUES ('20260520_logs_raw_to_replicated', '<operator-handle>');
