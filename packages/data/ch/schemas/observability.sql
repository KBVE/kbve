-- observability.logs_raw — replicated local table for Vector → ClickHouse direct pipeline
-- All services (kong, auth, rest, realtime, storage, functions, db, analytics, meta, studio)
-- land in one table, partitioned by day, 45-day TTL.
--
-- Cluster topology: 2 shards × 2 replicas.
-- Vector writes to logs_raw (local); queries go through logs_distributed.

CREATE DATABASE IF NOT EXISTS observability ON CLUSTER 'cluster';

CREATE TABLE IF NOT EXISTS observability.logs_raw ON CLUSTER 'cluster'
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
TTL toDateTime(timestamp) + INTERVAL 45 DAY;

-- Distributed table — fans out reads/writes across all shards.
-- Queries should use this table; Vector writes to logs_raw (local) directly.
CREATE TABLE IF NOT EXISTS observability.logs_distributed ON CLUSTER 'cluster'
AS observability.logs_raw
ENGINE = Distributed('cluster', 'observability', 'logs_raw', rand());
