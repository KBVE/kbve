-- telemetry — replicated local tables for the in-house client telemetry pipeline.
-- Frontend SDK (@kbve/observ) → metrics ingest (services/metrics) → ClickHouse direct.
--
-- Three lenses, one per table, all keyed by session_id so a slow page view, the
-- errors it threw and what the user did next line up:
--   errors_raw  window errors / promise rejections, fingerprinted for rollup
--   perf_raw    Web Vitals samples, rolled up to quantiles
--   events_raw  named product events
-- Every table carries a 30-day TTL.
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

-- =============================================================================
-- Performance lens — Web Vitals and any other single-number client measurement.
-- =============================================================================
-- One row per metric sample rather than one wide row per page view: a vital is
-- reported when the browser settles it (INP can land after LCP by minutes), so
-- a wide row would have to be updated after the fact, which MergeTree does not
-- do cheaply. Rolling up by (project, metric) is a read-side concern instead.
--
-- Sharded on session_id, NOT on the errors table's fingerprint: the lens this
-- feeds correlates a slow page view with the errors from the same session, and
-- co-locating a session's perf rows makes that a per-shard scan. Errors keep
-- sharding by fingerprint (changing it would mean rewriting the table), so a
-- cross-lens join still fans out — acceptable at this volume, and the tradeoff
-- is recorded here rather than discovered later.
CREATE TABLE IF NOT EXISTS telemetry.perf_raw ON CLUSTER 'cluster'
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

    -- As on errors_raw: the ingest clamps every one of these, so these caps sit
    -- above the app limits and only fire for a writer that bypassed it.
    CONSTRAINT chk_perf_project_len CHECK length(project) > 0 AND length(project) <= 256,
    CONSTRAINT chk_perf_metric_len  CHECK length(metric) > 0 AND length(metric) <= 64,
    CONSTRAINT chk_perf_url_len     CHECK length(url) <= 2048,
    -- A vital is a duration in ms or a unitless ratio; negative is never valid
    -- and the upper bound keeps one broken client from skewing every quantile.
    CONSTRAINT chk_perf_value_range CHECK value >= 0 AND value <= 3600000
)
ENGINE = ReplicatedMergeTree('/clickhouse/tables/{shard}/telemetry/perf_raw', '{replica}')
ORDER BY (project, metric, timestamp)
PARTITION BY toYYYYMMDD(timestamp)
TTL toDateTime(timestamp) + INTERVAL 30 DAY;

CREATE TABLE IF NOT EXISTS telemetry.perf_distributed ON CLUSTER 'cluster'
AS telemetry.perf_raw
ENGINE = Distributed('cluster', 'telemetry', 'perf_raw', cityHash64(session_id));

-- perf_summary — the quantiles the dashboard actually plots.
-- p75 is the headline because that is the threshold Web Vitals is defined
-- against; p50 and p95 are carried so a regression in the tail is visible
-- without a second query.
CREATE VIEW IF NOT EXISTS telemetry.perf_summary ON CLUSTER 'cluster'
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

-- =============================================================================
-- Product lens — named client events (page views, feature use, funnel steps).
-- =============================================================================
-- `name` is LowCardinality because a product event vocabulary is a small fixed
-- set by design; the ingest length-caps it and the per-project rate limiter
-- bounds how fast a misbehaving client can invent new ones.
CREATE TABLE IF NOT EXISTS telemetry.events_raw ON CLUSTER 'cluster'
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
    CONSTRAINT chk_event_name_len    CHECK length(name) > 0 AND length(name) <= 128,
    CONSTRAINT chk_event_url_len     CHECK length(url) <= 2048
)
ENGINE = ReplicatedMergeTree('/clickhouse/tables/{shard}/telemetry/events_raw', '{replica}')
ORDER BY (project, name, timestamp)
PARTITION BY toYYYYMMDD(timestamp)
TTL toDateTime(timestamp) + INTERVAL 30 DAY;

CREATE TABLE IF NOT EXISTS telemetry.events_distributed ON CLUSTER 'cluster'
AS telemetry.events_raw
ENGINE = Distributed('cluster', 'telemetry', 'events_raw', cityHash64(session_id));

-- event_counts — name rollup for the product dashboard.
CREATE VIEW IF NOT EXISTS telemetry.event_counts ON CLUSTER 'cluster'
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
