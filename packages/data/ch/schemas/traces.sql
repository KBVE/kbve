-- =============================================================================
-- Logflare ClickHouse Backend — Traces Schema
-- =============================================================================
-- Extracted from Logflare source (QueryTemplates.ex).
-- OTEL-aligned traces tables.
--
-- Engine: MergeTree (default)
-- TTL: 45 days
-- Partition: daily by timestamp
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Standard OTEL Traces (JSON attribute columns)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS logflare.otel_traces_template (
    `id`                    UUID,
    `source_uuid`           LowCardinality(String)  CODEC(ZSTD(1)),
    `source_name`           LowCardinality(String)  CODEC(ZSTD(1)),
    `project`               String                  CODEC(ZSTD(1)),
    `trace_id`              String                  CODEC(ZSTD(1)),
    `span_id`               String                  CODEC(ZSTD(1)),
    `parent_span_id`        String                  CODEC(ZSTD(1)),
    `trace_state`           String                  CODEC(ZSTD(1)),
    `span_name`             LowCardinality(String)  CODEC(ZSTD(1)),
    `span_kind`             LowCardinality(String)  CODEC(ZSTD(1)),
    `service_name`          LowCardinality(String)  CODEC(ZSTD(1)),
    `event_message`         String                  CODEC(ZSTD(1)),
    `duration`              UInt64                  CODEC(ZSTD(1)),
    `status_code`           LowCardinality(String)  CODEC(ZSTD(1)),
    `status_message`        String                  CODEC(ZSTD(1)),
    `scope_name`            String                  CODEC(ZSTD(1)),
    `scope_version`         String                  CODEC(ZSTD(1)),
    `resource_attributes`   JSON(max_dynamic_paths=0, max_dynamic_types=1) CODEC(ZSTD(1)),
    `span_attributes`       JSON(max_dynamic_paths=0, max_dynamic_types=1) CODEC(ZSTD(1)),
    `events.timestamp`      Array(DateTime64(9))    CODEC(ZSTD(1)),
    `events.name`           Array(LowCardinality(String)) CODEC(ZSTD(1)),
    `events.attributes`     Array(JSON(max_dynamic_paths=0, max_dynamic_types=1)) CODEC(ZSTD(1)),
    `links.trace_id`        Array(String)           CODEC(ZSTD(1)),
    `links.span_id`         Array(String)           CODEC(ZSTD(1)),
    `links.trace_state`     Array(String)           CODEC(ZSTD(1)),
    `links.attributes`      Array(JSON(max_dynamic_paths=0, max_dynamic_types=1)) CODEC(ZSTD(1)),
    `mapping_config_id`     UUID,
    `timestamp`             DateTime64(9)           CODEC(Delta(8), ZSTD(1)),
    `timestamp_hour`        DateTime                DEFAULT toStartOfHour(timestamp),
    INDEX idx_trace_id trace_id TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_duration duration TYPE minmax GRANULARITY 1
)
ENGINE = MergeTree
PARTITION BY toDate(timestamp)
ORDER BY (source_name, span_name, project, timestamp_hour)
TTL toDateTime(timestamp) + INTERVAL 45 DAY
SETTINGS index_granularity = 8192, ttl_only_drop_parts = 1;


-- ---------------------------------------------------------------------------
-- Simple OTEL Traces (Map attribute columns)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS logflare.simple_otel_traces_template (
    `id`                    UUID,
    `source_uuid`           LowCardinality(String)  CODEC(ZSTD(1)),
    `source_name`           LowCardinality(String)  CODEC(ZSTD(1)),
    `project`               String                  CODEC(ZSTD(1)),
    `trace_id`              String                  CODEC(ZSTD(1)),
    `span_id`               String                  CODEC(ZSTD(1)),
    `parent_span_id`        String                  CODEC(ZSTD(1)),
    `trace_state`           String                  CODEC(ZSTD(1)),
    `span_name`             LowCardinality(String)  CODEC(ZSTD(1)),
    `span_kind`             LowCardinality(String)  CODEC(ZSTD(1)),
    `service_name`          LowCardinality(String)  CODEC(ZSTD(1)),
    `event_message`         String                  CODEC(ZSTD(1)),
    `duration`              UInt64                  CODEC(ZSTD(1)),
    `status_code`           LowCardinality(String)  CODEC(ZSTD(1)),
    `status_message`        String                  CODEC(ZSTD(1)),
    `scope_name`            String                  CODEC(ZSTD(1)),
    `scope_version`         String                  CODEC(ZSTD(1)),
    `resource_attributes`   Map(LowCardinality(String), String) CODEC(ZSTD(1)),
    `span_attributes`       Map(String, String)     CODEC(ZSTD(1)),
    `events.timestamp`      Array(DateTime64(9))    CODEC(ZSTD(1)),
    `events.name`           Array(LowCardinality(String)) CODEC(ZSTD(1)),
    `events.attributes`     Array(Map(LowCardinality(String), String)) CODEC(ZSTD(1)),
    `links.trace_id`        Array(String)           CODEC(ZSTD(1)),
    `links.span_id`         Array(String)           CODEC(ZSTD(1)),
    `links.trace_state`     Array(String)           CODEC(ZSTD(1)),
    `links.attributes`      Array(Map(LowCardinality(String), String)) CODEC(ZSTD(1)),
    `mapping_config_id`     UUID,
    `timestamp`             DateTime64(9)           CODEC(Delta(8), ZSTD(1)),
    `timestamp_hour`        DateTime                DEFAULT toStartOfHour(timestamp),
    INDEX idx_trace_id trace_id TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_duration duration TYPE minmax GRANULARITY 1
)
ENGINE = MergeTree
PARTITION BY toDate(timestamp)
ORDER BY (source_name, span_name, project, timestamp_hour)
TTL toDateTime(timestamp) + INTERVAL 45 DAY
SETTINGS index_granularity = 8192, ttl_only_drop_parts = 1;
