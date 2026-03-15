-- =============================================================================
-- Logflare ClickHouse Backend — Metrics Schema
-- =============================================================================
-- Extracted from Logflare source (QueryTemplates.ex).
-- OTEL-aligned metrics tables.
--
-- Engine: MergeTree (default)
-- TTL: 90 days
-- Partition: daily by timestamp
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Standard OTEL Metrics (JSON attribute columns)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS logflare.otel_metrics_template (
    `id`                          UUID,
    `source_uuid`                 LowCardinality(String)  CODEC(ZSTD(1)),
    `source_name`                 LowCardinality(String)  CODEC(ZSTD(1)),
    `project`                     String                  CODEC(ZSTD(1)),
    `time_unix`                   Nullable(DateTime64(9)) CODEC(Delta(8), ZSTD(1)),
    `start_time_unix`             Nullable(DateTime64(9)) CODEC(Delta(8), ZSTD(1)),
    `metric_name`                 LowCardinality(String)  CODEC(ZSTD(1)),
    `metric_description`          String                  CODEC(ZSTD(1)),
    `metric_unit`                 LowCardinality(String)  CODEC(ZSTD(1)),
    `metric_type`                 Enum8('gauge' = 1, 'sum' = 2, 'histogram' = 3, 'exponential_histogram' = 4, 'summary' = 5),
    `service_name`                LowCardinality(String)  CODEC(ZSTD(1)),
    `event_message`               String                  CODEC(ZSTD(1)),
    `scope_name`                  String                  CODEC(ZSTD(1)),
    `scope_version`               LowCardinality(String)  CODEC(ZSTD(1)),
    `scope_schema_url`            LowCardinality(String)  CODEC(ZSTD(1)),
    `resource_schema_url`         LowCardinality(String)  CODEC(ZSTD(1)),
    `resource_attributes`         JSON(max_dynamic_paths=0, max_dynamic_types=1) CODEC(ZSTD(1)),
    `scope_attributes`            JSON(max_dynamic_paths=0, max_dynamic_types=1) CODEC(ZSTD(1)),
    `attributes`                  JSON(max_dynamic_paths=0, max_dynamic_types=1) CODEC(ZSTD(1)),
    `aggregation_temporality`     LowCardinality(String)  CODEC(ZSTD(1)),
    `is_monotonic`                Bool,
    `flags`                       UInt32                  CODEC(ZSTD(1)),
    `value`                       Float64                 CODEC(ZSTD(1)),
    `count`                       UInt64                  CODEC(ZSTD(1)),
    `sum`                         Float64                 CODEC(ZSTD(1)),
    `bucket_counts`               Array(UInt64)           CODEC(ZSTD(1)),
    `explicit_bounds`             Array(Float64)          CODEC(ZSTD(1)),
    `min`                         Float64                 CODEC(ZSTD(1)),
    `max`                         Float64                 CODEC(ZSTD(1)),
    `scale`                       Int32                   CODEC(ZSTD(1)),
    `zero_count`                  UInt64                  CODEC(ZSTD(1)),
    `positive_offset`             Int32                   CODEC(ZSTD(1)),
    `positive_bucket_counts`      Array(UInt64)           CODEC(ZSTD(1)),
    `negative_offset`             Int32                   CODEC(ZSTD(1)),
    `negative_bucket_counts`      Array(UInt64)           CODEC(ZSTD(1)),
    `quantile_values`             Array(Float64)          CODEC(ZSTD(1)),
    `quantiles`                   Array(Float64)          CODEC(ZSTD(1)),
    `exemplars.filtered_attributes` Array(JSON(max_dynamic_paths=0, max_dynamic_types=1)) CODEC(ZSTD(1)),
    `exemplars.time_unix`         Array(DateTime64(9))    CODEC(ZSTD(1)),
    `exemplars.value`             Array(Float64)          CODEC(ZSTD(1)),
    `exemplars.span_id`           Array(String)           CODEC(ZSTD(1)),
    `exemplars.trace_id`          Array(String)           CODEC(ZSTD(1)),
    `mapping_config_id`           UUID,
    `timestamp`                   DateTime64(9)           CODEC(Delta(8), ZSTD(1)),
    `timestamp_hour`              DateTime                DEFAULT toStartOfHour(timestamp)
)
ENGINE = MergeTree
PARTITION BY toDate(timestamp)
ORDER BY (source_name, metric_name, project, timestamp_hour)
TTL toDateTime(timestamp) + INTERVAL 90 DAY
SETTINGS index_granularity = 8192, ttl_only_drop_parts = 1;


-- ---------------------------------------------------------------------------
-- Simple OTEL Metrics (Map attribute columns)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS logflare.simple_otel_metrics_template (
    `id`                          UUID,
    `source_uuid`                 LowCardinality(String)  CODEC(ZSTD(1)),
    `source_name`                 LowCardinality(String)  CODEC(ZSTD(1)),
    `project`                     String                  CODEC(ZSTD(1)),
    `time_unix`                   Nullable(DateTime64(9)) CODEC(Delta(8), ZSTD(1)),
    `start_time_unix`             Nullable(DateTime64(9)) CODEC(Delta(8), ZSTD(1)),
    `metric_name`                 LowCardinality(String)  CODEC(ZSTD(1)),
    `metric_description`          String                  CODEC(ZSTD(1)),
    `metric_unit`                 LowCardinality(String)  CODEC(ZSTD(1)),
    `metric_type`                 Enum8('gauge' = 1, 'sum' = 2, 'histogram' = 3, 'exponential_histogram' = 4, 'summary' = 5),
    `service_name`                LowCardinality(String)  CODEC(ZSTD(1)),
    `event_message`               String                  CODEC(ZSTD(1)),
    `scope_name`                  String                  CODEC(ZSTD(1)),
    `scope_version`               LowCardinality(String)  CODEC(ZSTD(1)),
    `scope_schema_url`            LowCardinality(String)  CODEC(ZSTD(1)),
    `resource_schema_url`         LowCardinality(String)  CODEC(ZSTD(1)),
    `resource_attributes`         Map(LowCardinality(String), String) CODEC(ZSTD(1)),
    `scope_attributes`            Map(LowCardinality(String), String) CODEC(ZSTD(1)),
    `attributes`                  Map(String, String)     CODEC(ZSTD(1)),
    `aggregation_temporality`     LowCardinality(String)  CODEC(ZSTD(1)),
    `is_monotonic`                Bool,
    `flags`                       UInt32                  CODEC(ZSTD(1)),
    `value`                       Float64                 CODEC(ZSTD(1)),
    `count`                       UInt64                  CODEC(ZSTD(1)),
    `sum`                         Float64                 CODEC(ZSTD(1)),
    `bucket_counts`               Array(UInt64)           CODEC(ZSTD(1)),
    `explicit_bounds`             Array(Float64)          CODEC(ZSTD(1)),
    `min`                         Float64                 CODEC(ZSTD(1)),
    `max`                         Float64                 CODEC(ZSTD(1)),
    `scale`                       Int32                   CODEC(ZSTD(1)),
    `zero_count`                  UInt64                  CODEC(ZSTD(1)),
    `positive_offset`             Int32                   CODEC(ZSTD(1)),
    `positive_bucket_counts`      Array(UInt64)           CODEC(ZSTD(1)),
    `negative_offset`             Int32                   CODEC(ZSTD(1)),
    `negative_bucket_counts`      Array(UInt64)           CODEC(ZSTD(1)),
    `quantile_values`             Array(Float64)          CODEC(ZSTD(1)),
    `quantiles`                   Array(Float64)          CODEC(ZSTD(1)),
    `exemplars.filtered_attributes` Array(Map(LowCardinality(String), String)) CODEC(ZSTD(1)),
    `exemplars.time_unix`         Array(DateTime64(9))    CODEC(ZSTD(1)),
    `exemplars.value`             Array(Float64)          CODEC(ZSTD(1)),
    `exemplars.span_id`           Array(String)           CODEC(ZSTD(1)),
    `exemplars.trace_id`          Array(String)           CODEC(ZSTD(1)),
    `mapping_config_id`           UUID,
    `timestamp`                   DateTime64(9)           CODEC(Delta(8), ZSTD(1)),
    `timestamp_hour`              DateTime                DEFAULT toStartOfHour(timestamp)
)
ENGINE = MergeTree
PARTITION BY toDate(timestamp)
ORDER BY (source_name, metric_name, project, timestamp_hour)
TTL toDateTime(timestamp) + INTERVAL 90 DAY
SETTINGS index_granularity = 8192, ttl_only_drop_parts = 1;
