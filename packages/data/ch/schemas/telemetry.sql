-- telemetry.errors_raw — replicated local table for the in-house client telemetry pipeline.
-- Frontend SDK (@kbve/observ) → metrics ingest (apps/metrics) → ClickHouse direct.
-- Captures window errors / promise rejections; fingerprinted for rollup. 30-day TTL.
--
-- Cluster topology: 2 shards × 2 replicas.
-- metrics writes to errors_raw (local); queries go through errors_distributed.

CREATE DATABASE IF NOT EXISTS telemetry ON CLUSTER 'cluster';

CREATE TABLE IF NOT EXISTS telemetry.errors_raw ON CLUSTER 'cluster'
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
    extra           String DEFAULT '{}',

    -- Last-resort tripwires: the metrics ingest already clamps every field, so
    -- these caps sit ABOVE the app limits and only fire if a writer bypasses it
    -- (e.g. direct CH access with the ingest creds). A violating row rejects its
    -- INSERT batch by design — fail loud.
    CONSTRAINT chk_project_len     CHECK length(project) > 0 AND length(project) <= 256,
    CONSTRAINT chk_fingerprint_len CHECK length(fingerprint) <= 64,
    CONSTRAINT chk_message_len     CHECK length(message) <= 8192,
    CONSTRAINT chk_stack_len       CHECK length(stack) <= 32768,
    CONSTRAINT chk_url_len         CHECK length(url) <= 2048,
    CONSTRAINT chk_handled_bit     CHECK handled <= 1
)
ENGINE = ReplicatedMergeTree('/clickhouse/tables/{shard}/telemetry/errors_raw', '{replica}')
ORDER BY (project, fingerprint, timestamp)
PARTITION BY toYYYYMMDD(timestamp)
TTL toDateTime(timestamp) + INTERVAL 30 DAY;

-- Distributed table — fans out reads/writes across all shards.
-- Queries should use this table; the ingest sharding key is cityHash64(fingerprint)
-- so all events for a fingerprint co-locate on one shard.
CREATE TABLE IF NOT EXISTS telemetry.errors_distributed ON CLUSTER 'cluster'
AS telemetry.errors_raw
ENGINE = Distributed('cluster', 'telemetry', 'errors_raw', cityHash64(fingerprint));

-- error_groups — fingerprint rollup for the errors dashboard.
CREATE VIEW IF NOT EXISTS telemetry.error_groups ON CLUSTER 'cluster'
AS SELECT
    project,
    fingerprint,
    any(error_type)  AS error_type,
    any(message)     AS sample_message,
    count()          AS events,
    uniq(session_id) AS sessions,
    min(timestamp)   AS first_seen,
    max(timestamp)   AS last_seen
FROM telemetry.errors_distributed
GROUP BY project, fingerprint;
