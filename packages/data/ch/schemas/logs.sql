-- =============================================================================
-- Logflare ClickHouse Backend — Logs Schema
-- =============================================================================
-- Extracted from Logflare source (QueryTemplates.ex).
-- Logflare creates tables per source token (otel_logs_<token>).
-- These are reference templates using MergeTree (Logflare default).
--
-- Engine: MergeTree (default). Logflare config overrides for production:
--   config :logflare, :clickhouse_backend_adaptor, engine: "ReplicatedMergeTree"
-- TTL: 45 days
-- Partition: daily by timestamp
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Standard OTEL Logs (JSON attribute columns)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS logflare.otel_logs_template (
    `id`                    UUID,
    `source_uuid`           LowCardinality(String)  CODEC(ZSTD(1)),
    `source_name`           LowCardinality(String)  CODEC(ZSTD(1)),
    `project`               String                  CODEC(ZSTD(1)),
    `trace_id`              String                  CODEC(ZSTD(1)),
    `span_id`               String                  CODEC(ZSTD(1)),
    `trace_flags`           UInt8,
    `severity_text`         LowCardinality(String)  CODEC(ZSTD(1)),
    `severity_number`       UInt8,
    `service_name`          LowCardinality(String)  CODEC(ZSTD(1)),
    `event_message`         String                  CODEC(ZSTD(1)),
    `scope_name`            String                  CODEC(ZSTD(1)),
    `scope_version`         LowCardinality(String)  CODEC(ZSTD(1)),
    `scope_schema_url`      LowCardinality(String)  CODEC(ZSTD(1)),
    `resource_schema_url`   LowCardinality(String)  CODEC(ZSTD(1)),
    `resource_attributes`   JSON(max_dynamic_paths=0, max_dynamic_types=1) CODEC(ZSTD(1)),
    `scope_attributes`      JSON(max_dynamic_paths=0, max_dynamic_types=1) CODEC(ZSTD(1)),
    `log_attributes`        JSON(max_dynamic_paths=0, max_dynamic_types=1) CODEC(ZSTD(1)),
    `mapping_config_id`     UUID,
    `timestamp`             DateTime64(9)           CODEC(Delta(8), ZSTD(1)),
    `timestamp_time`        DateTime                DEFAULT toDateTime(timestamp),
    `timestamp_hour`        DateTime                DEFAULT toStartOfHour(timestamp),
    INDEX idx_trace_id trace_id TYPE bloom_filter(0.001) GRANULARITY 1
)
ENGINE = MergeTree
PARTITION BY toDate(timestamp)
PRIMARY KEY (project, source_name, toDateTime(timestamp))
ORDER BY (project, source_name, toDateTime(timestamp), timestamp)
TTL toDateTime(timestamp) + INTERVAL 45 DAY
SETTINGS index_granularity = 8192, ttl_only_drop_parts = 1;


-- ---------------------------------------------------------------------------
-- Simple OTEL Logs (Map attribute columns)
-- ---------------------------------------------------------------------------
-- For ClickHouse versions without JSON type support.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS logflare.simple_otel_logs_template (
    `id`                    UUID,
    `source_uuid`           LowCardinality(String)  CODEC(ZSTD(1)),
    `source_name`           LowCardinality(String)  CODEC(ZSTD(1)),
    `project`               String                  CODEC(ZSTD(1)),
    `trace_id`              String                  CODEC(ZSTD(1)),
    `span_id`               String                  CODEC(ZSTD(1)),
    `trace_flags`           UInt8,
    `severity_text`         LowCardinality(String)  CODEC(ZSTD(1)),
    `severity_number`       UInt8,
    `service_name`          LowCardinality(String)  CODEC(ZSTD(1)),
    `event_message`         String                  CODEC(ZSTD(1)),
    `scope_name`            String                  CODEC(ZSTD(1)),
    `scope_version`         LowCardinality(String)  CODEC(ZSTD(1)),
    `scope_schema_url`      LowCardinality(String)  CODEC(ZSTD(1)),
    `resource_schema_url`   LowCardinality(String)  CODEC(ZSTD(1)),
    `resource_attributes`   Map(LowCardinality(String), String) CODEC(ZSTD(1)),
    `scope_attributes`      Map(LowCardinality(String), String) CODEC(ZSTD(1)),
    `log_attributes`        Map(String, String)     CODEC(ZSTD(1)),
    `mapping_config_id`     UUID,
    `timestamp`             DateTime64(9)           CODEC(Delta(8), ZSTD(1)),
    `timestamp_time`        DateTime                DEFAULT toDateTime(timestamp),
    `timestamp_hour`        DateTime                DEFAULT toStartOfHour(timestamp),
    INDEX idx_trace_id trace_id TYPE bloom_filter(0.001) GRANULARITY 1
)
ENGINE = MergeTree
PARTITION BY toDate(timestamp)
ORDER BY (source_name, project, timestamp_hour)
TTL toDateTime(timestamp) + INTERVAL 45 DAY
SETTINGS index_granularity = 8192, ttl_only_drop_parts = 1;
