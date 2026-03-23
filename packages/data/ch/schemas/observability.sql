-- observability.logs_raw — single raw log table for Vector → ClickHouse direct pipeline
-- All services (kong, auth, rest, realtime, storage, functions, db, analytics, meta, studio)
-- land in one table, partitioned by day, 45-day TTL.

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
ENGINE = MergeTree
ORDER BY (service, timestamp)
PARTITION BY toYYYYMMDD(timestamp)
TTL toDateTime(timestamp) + INTERVAL 45 DAY;
