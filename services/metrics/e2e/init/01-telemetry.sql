-- Single-node telemetry schema for the metrics e2e harness.
-- Production uses ReplicatedMergeTree + Distributed ON CLUSTER 'cluster'
-- (packages/data/ch/schemas/telemetry.sql); a one-node CH has no cluster, so
-- errors_distributed is a plain MergeTree the ingest writes to directly.

CREATE DATABASE IF NOT EXISTS telemetry;

CREATE TABLE IF NOT EXISTS telemetry.errors_distributed
(
    timestamp       DateTime64(3, 'UTC') DEFAULT now64(3),
    project         LowCardinality(String),
    platform        LowCardinality(String) DEFAULT 'web',
    release         LowCardinality(String) DEFAULT '',
    environment     LowCardinality(String) DEFAULT 'production',
    fingerprint     String,
    error_type      LowCardinality(String) DEFAULT '',
    message         String,
    stack           String DEFAULT '',
    url             String DEFAULT '',
    user_id         String DEFAULT '',
    session_id      String DEFAULT '',
    user_agent      String DEFAULT '',
    handled         UInt8 DEFAULT 0,
    extra           String DEFAULT '{}'
)
ENGINE = MergeTree
ORDER BY (project, fingerprint, timestamp)
PARTITION BY toYYYYMMDD(timestamp)
TTL toDateTime(timestamp) + INTERVAL 30 DAY;
