-- Palworld GameOps telemetry schema.
--
-- Source of truth for the `gameops.palworld_*` tables (issue #15362). The
-- relay sidecar at apps/agones/palworld/relay/ has been producing these rows
-- since it shipped, but the tables were never created — every insert failed
-- (and was swallowed as a warn). This file closes that gap.
--
-- Producers write to the `*_raw` tables; readers (discordsh-bot
-- /palworld-online, dashboards) query through the `Distributed` twins so the
-- factorio reader convention carries over unchanged. Column sets are dictated
-- by the producer's json! literals in ch_writer.rs.
--
-- Retention: 14 days on both tables, matching factorio_snapshots_raw /
-- factorio_player_events_raw.
--
-- Apply: every DDL is `IF NOT EXISTS` + `ON CLUSTER 'cluster'`, so re-running
-- against a partially-applied cluster is safe.
--
--   kubectl -n clickhouse exec -i \
--     chi-clickhouse-cluster-cluster-0-0-0 -c clickhouse -- \
--     clickhouse-client --multiquery < packages/data/ch/schemas/palworld.sql
--
-- Record the apply in the standard migrations ledger:
--
--   INSERT INTO observability.schema_migrations (name, applied_by)
--   VALUES ('palworld_gameops_init', '<operator>');

-- ---------------------------------------------------------------------------
-- Database
-- ---------------------------------------------------------------------------

CREATE DATABASE IF NOT EXISTS gameops ON CLUSTER 'cluster';

-- ---------------------------------------------------------------------------
-- palworld_snapshots_raw — periodic snapshot of the server's live state.
--
-- One row per relay poll (default 10s). `fps`/`frametime_ms` come from the
-- Palworld REST /v1/api/metrics payload; `map_age_wall_s` is the relay
-- process uptime, a proxy for time since the pod (and world) came up.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS gameops.palworld_snapshots_raw ON CLUSTER 'cluster'
(
    ts             DateTime64(3, 'UTC'),
    server_id      LowCardinality(String),
    rotation_id    UUID,
    players        UInt16,
    fps            Int32,
    uptime_s       UInt64,
    frametime_ms   Float32,
    map_age_wall_s UInt64,
    ingested_at    DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = ReplicatedMergeTree(
    '/clickhouse/tables/{shard}/gameops/palworld_snapshots_raw',
    '{replica}'
)
ORDER BY (server_id, ts)
PARTITION BY toYYYYMMDD(ts)
TTL toDateTime(ts) + INTERVAL 14 DAY;

CREATE TABLE IF NOT EXISTS gameops.palworld_snapshots ON CLUSTER 'cluster'
AS gameops.palworld_snapshots_raw
ENGINE = Distributed('cluster', 'gameops', 'palworld_snapshots_raw', rand());

-- ---------------------------------------------------------------------------
-- palworld_player_events_raw — one row per join / leave.
--
-- `player` is the display name for both events (relay resolves leaves
-- through a persistent id→name map; see poller.rs). Roster queries group by
-- `player` and take argMax(event, ts).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS gameops.palworld_player_events_raw ON CLUSTER 'cluster'
(
    ts          DateTime64(3, 'UTC'),
    server_id   LowCardinality(String),
    rotation_id UUID,
    player      LowCardinality(String),
    event       Enum8('join' = 1, 'leave' = 2),
    ingested_at DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = ReplicatedMergeTree(
    '/clickhouse/tables/{shard}/gameops/palworld_player_events_raw',
    '{replica}'
)
ORDER BY (server_id, ts)
PARTITION BY toYYYYMMDD(ts)
TTL toDateTime(ts) + INTERVAL 14 DAY;

CREATE TABLE IF NOT EXISTS gameops.palworld_player_events ON CLUSTER 'cluster'
AS gameops.palworld_player_events_raw
ENGINE = Distributed('cluster', 'gameops', 'palworld_player_events_raw', rand());
