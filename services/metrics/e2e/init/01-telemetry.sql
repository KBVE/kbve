-- AUTO-GENERATED from packages/data/ch/schemas/telemetry.sql by packages/data/codegen/gen-ch-telemetry.mjs
-- DO NOT EDIT -- regenerate with:
--   node packages/data/codegen/gen-ch-telemetry.mjs
--
-- Single-node telemetry schema for the metrics e2e harness. Production is
-- ReplicatedMergeTree + Distributed ON CLUSTER 'cluster'; a one-node CH has
-- neither, so each raw/distributed pair collapses to one plain MergeTree
-- under the distributed name the service queries.

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
    extra           String DEFAULT '{}',
    CONSTRAINT chk_project_len CHECK length(project) > 0 AND length(project) <= 256,
    CONSTRAINT chk_fingerprint_len CHECK length(fingerprint) <= 64,
    CONSTRAINT chk_message_len CHECK length(message) <= 8192,
    CONSTRAINT chk_stack_len CHECK length(stack) <= 32768,
    CONSTRAINT chk_url_len CHECK length(url) <= 2048,
    CONSTRAINT chk_handled_bit CHECK handled <= 1
)
ENGINE = MergeTree
ORDER BY (project, fingerprint, timestamp)
PARTITION BY toYYYYMMDD(timestamp)
TTL toDateTime(timestamp) + INTERVAL 30 DAY;

CREATE TABLE IF NOT EXISTS telemetry.perf_distributed
(
    timestamp       DateTime64(3, 'UTC') DEFAULT now64(3),
    project         LowCardinality(String),
    platform        LowCardinality(String) DEFAULT 'web',
    release         LowCardinality(String) DEFAULT '',
    environment     LowCardinality(String) DEFAULT 'production',
    metric          LowCardinality(String),
    value           Float64,
    rating          LowCardinality(String) DEFAULT '',
    navigation_type LowCardinality(String) DEFAULT '',
    url             String DEFAULT '',
    user_id         String DEFAULT '',
    session_id      String DEFAULT '',
    user_agent      String DEFAULT '',
    extra           String DEFAULT '{}',
    CONSTRAINT chk_perf_project_len CHECK length(project) > 0 AND length(project) <= 256,
    CONSTRAINT chk_perf_metric_len CHECK length(metric) > 0 AND length(metric) <= 64,
    CONSTRAINT chk_perf_url_len CHECK length(url) <= 2048,
    CONSTRAINT chk_perf_value_range CHECK value >= 0 AND value <= 3600000
)
ENGINE = MergeTree
ORDER BY (project, metric, timestamp)
PARTITION BY toYYYYMMDD(timestamp)
TTL toDateTime(timestamp) + INTERVAL 30 DAY;

CREATE TABLE IF NOT EXISTS telemetry.events_distributed
(
    timestamp       DateTime64(3, 'UTC') DEFAULT now64(3),
    project         LowCardinality(String),
    platform        LowCardinality(String) DEFAULT 'web',
    release         LowCardinality(String) DEFAULT '',
    environment     LowCardinality(String) DEFAULT 'production',
    name            LowCardinality(String),
    url             String DEFAULT '',
    user_id         String DEFAULT '',
    session_id      String DEFAULT '',
    user_agent      String DEFAULT '',
    extra           String DEFAULT '{}',
    CONSTRAINT chk_event_project_len CHECK length(project) > 0 AND length(project) <= 256,
    CONSTRAINT chk_event_name_len CHECK length(name) > 0 AND length(name) <= 128,
    CONSTRAINT chk_event_url_len CHECK length(url) <= 2048
)
ENGINE = MergeTree
ORDER BY (project, name, timestamp)
PARTITION BY toYYYYMMDD(timestamp)
TTL toDateTime(timestamp) + INTERVAL 30 DAY;

CREATE VIEW IF NOT EXISTS telemetry.error_groups
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

CREATE VIEW IF NOT EXISTS telemetry.perf_summary
AS SELECT
    project,
    metric,
    count()                    AS samples,
    uniq(session_id)           AS sessions,
    quantile(0.50)(value)      AS p50,
    quantile(0.75)(value)      AS p75,
    quantile(0.95)(value)      AS p95,
    min(timestamp)             AS first_seen,
    max(timestamp)             AS last_seen
FROM telemetry.perf_distributed
GROUP BY project, metric;

CREATE VIEW IF NOT EXISTS telemetry.event_counts
AS SELECT
    project,
    name,
    count()          AS events,
    uniq(session_id) AS sessions,
    uniq(user_id)    AS users,
    min(timestamp)   AS first_seen,
    max(timestamp)   AS last_seen
FROM telemetry.events_distributed
GROUP BY project, name;
