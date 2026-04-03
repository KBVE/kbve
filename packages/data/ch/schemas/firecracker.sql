-- firecracker.vm_events — tracks microVM lifecycle events from firecracker-ctl.
-- Populated by firecracker-ctl logging to stdout → Vector → ClickHouse pipeline.
-- Partitioned by day, 90-day TTL for capacity planning analysis.

CREATE DATABASE IF NOT EXISTS firecracker ON CLUSTER 'cluster';

CREATE TABLE IF NOT EXISTS firecracker.vm_events ON CLUSTER 'cluster'
(
    timestamp       DateTime64(3, 'UTC'),
    vm_id           String,
    event           LowCardinality(String),  -- created, started, completed, failed, timeout, destroyed
    rootfs          LowCardinality(String),  -- alpine-minimal, alpine-python, etc.
    vcpu_count      UInt8 DEFAULT 1,
    mem_size_mib    UInt16 DEFAULT 128,
    boot_ms         UInt32 DEFAULT 0,        -- time from create to running
    duration_ms     UInt32 DEFAULT 0,        -- total wall-clock time
    exit_code       Int16 DEFAULT -1,        -- -1 = not yet completed
    pod_name        String DEFAULT '',
    metadata        String DEFAULT '{}',
    ingested_at     DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = MergeTree
ORDER BY (event, timestamp)
PARTITION BY toYYYYMMDD(timestamp)
TTL toDateTime(timestamp) + INTERVAL 90 DAY;

-- Materialized view: per-minute aggregates for dashboard panels
CREATE TABLE IF NOT EXISTS firecracker.vm_stats_1m ON CLUSTER 'cluster'
(
    window_start    DateTime('UTC'),
    event           LowCardinality(String),
    rootfs          LowCardinality(String),
    count           UInt64,
    avg_boot_ms     Float64,
    p95_boot_ms     Float64,
    avg_duration_ms Float64,
    p95_duration_ms Float64,
    avg_mem_mib     Float64
)
ENGINE = MergeTree
ORDER BY (window_start, event, rootfs)
PARTITION BY toYYYYMMDD(window_start)
TTL window_start + INTERVAL 90 DAY;

CREATE MATERIALIZED VIEW IF NOT EXISTS firecracker.vm_stats_1m_mv ON CLUSTER 'cluster'
TO firecracker.vm_stats_1m
AS
SELECT
    toStartOfMinute(timestamp) AS window_start,
    event,
    rootfs,
    count()                           AS count,
    avg(boot_ms)                      AS avg_boot_ms,
    quantile(0.95)(boot_ms)           AS p95_boot_ms,
    avg(duration_ms)                  AS avg_duration_ms,
    quantile(0.95)(duration_ms)       AS p95_duration_ms,
    avg(mem_size_mib)                 AS avg_mem_mib
FROM firecracker.vm_events
GROUP BY window_start, event, rootfs;
