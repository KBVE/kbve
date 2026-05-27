-- Factorio GameOps telemetry schema.
--
-- Source of truth for the `gameops` ClickHouse database, scoped to the
-- Agones-managed Factorio fleet (issue #11138). DB-level namespace is
-- `gameops` (not `factorio`) so MC + ROWS telemetry can land alongside
-- without another database rename later — future tables like
-- `gameops.mc_player_events_raw` slot in without touching what's here.
--
-- Cluster topology mirrors observability.logs_raw: 2 shards × 2 replicas.
-- Producers (relay sidecar at apps/agones/factorio/relay/) write to the
-- `*_raw` tables on whichever shard the round-robin lands on. Readers
-- (axum-kbve /dashboard/clickhouse/proxy + apps/kbve/edge/functions/factorio)
-- query through the `Distributed` twins so the result fans out across shards.
--
-- Retention:
--   - factorio_snapshots_raw    14 days  (fine-grained, hot for dashboards)
--   - factorio_player_events_raw 14 days  (raw join/leave, same window)
--   - factorio_rotations_raw    90 days  (history view + shelf-life decay
--                                          spans multiple maps)
--   - factorio_chat_log_raw      7 days  (moderation buffer only — drop the
--                                          table if Discord audit logs are
--                                          considered sufficient)
--
-- Apply: this file is canonical greenfield state. Run it against the
-- production cluster from a planned-window operator session, e.g.
--
--   kubectl -n clickhouse exec -i \
--     chi-clickhouse-cluster-cluster-0-0-0 -c clickhouse -- \
--     clickhouse-client --multiquery < packages/data/ch/schemas/factorio.sql
--
-- Every DDL below is `IF NOT EXISTS` + `ON CLUSTER 'cluster'`, so re-running
-- against a partially-applied cluster is safe. Record the apply in the
-- standard migrations ledger:
--
--   INSERT INTO observability.schema_migrations (name, applied_by)
--   VALUES ('factorio_gameops_init', '<operator>');

-- ---------------------------------------------------------------------------
-- Database
-- ---------------------------------------------------------------------------

CREATE DATABASE IF NOT EXISTS gameops ON CLUSTER 'cluster';

-- ---------------------------------------------------------------------------
-- factorio_snapshots_raw — periodic snapshot of one server's live state.
--
-- Producer writes one row every N seconds per server (default snapshot
-- cadence is 5s, knob lives on the relay env). Carries both `wall_ts` and
-- `game_tick` so the wall-vs-game-time divergence stays computable across
-- auto-pause regimes — Factorio pauses the simulation when no players are
-- connected, so wall-clock age and in-game time diverge and the server
-- browser sorts on the in-game value.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS gameops.factorio_snapshots_raw ON CLUSTER 'cluster'
(
    ts                  DateTime64(3, 'UTC'),
    server_id           LowCardinality(String),
    scenario            LowCardinality(String),
    rotation_id         UUID,
    seed                UInt64,
    players             UInt16,
    auto_pause_enabled  UInt8,
    map_age_wall_s      UInt64,
    map_age_game_s      UInt64,
    game_tick           UInt64,
    ups                 Float32,
    ingested_at         DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = ReplicatedMergeTree(
    '/clickhouse/tables/{shard}/gameops/factorio_snapshots_raw',
    '{replica}'
)
ORDER BY (server_id, ts)
PARTITION BY toYYYYMMDD(ts)
TTL toDateTime(ts) + INTERVAL 14 DAY;

CREATE TABLE IF NOT EXISTS gameops.factorio_snapshots ON CLUSTER 'cluster'
AS gameops.factorio_snapshots_raw
ENGINE = Distributed('cluster', 'gameops', 'factorio_snapshots_raw', rand());

-- ---------------------------------------------------------------------------
-- factorio_player_events_raw — one row per join / leave / kick.
--
-- Stamped with `game_tick` in addition to wall `ts`, so the rotation-history
-- view can compute "joins in first N in-game minutes" (i.e. the discovery
-- window measured in game-time, immune to auto-pause).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS gameops.factorio_player_events_raw ON CLUSTER 'cluster'
(
    ts          DateTime64(3, 'UTC'),
    server_id   LowCardinality(String),
    scenario    LowCardinality(String),
    rotation_id UUID,
    player      LowCardinality(String),
    event       Enum8('join' = 1, 'leave' = 2, 'kick' = 3),
    game_tick   UInt64,
    ingested_at DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = ReplicatedMergeTree(
    '/clickhouse/tables/{shard}/gameops/factorio_player_events_raw',
    '{replica}'
)
ORDER BY (server_id, ts)
PARTITION BY toYYYYMMDD(ts)
TTL toDateTime(ts) + INTERVAL 14 DAY;

CREATE TABLE IF NOT EXISTS gameops.factorio_player_events ON CLUSTER 'cluster'
AS gameops.factorio_player_events_raw
ENGINE = Distributed('cluster', 'gameops', 'factorio_player_events_raw', rand());

-- ---------------------------------------------------------------------------
-- factorio_rotations_raw — map lifecycle row, one per rotation.
--
-- `ReplacingMergeTree(ended_at)` so the producer can upsert the same
-- `rotation_id` repeatedly while the map is live: `end_reason` starts as
-- 'open', flips to the real reason on close, peak counters tick upward,
-- final aggregates land at close. Background merges collapse to the row
-- with the highest `ended_at`.
--
-- 90 day retention so "real shelf life" decay analysis (game-time hours
-- per rotation) can span the full lifecycle of long-form maps even after
-- the underlying 14-day snapshot rows expire.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS gameops.factorio_rotations_raw ON CLUSTER 'cluster'
(
    rotation_id            UUID,
    server_id              LowCardinality(String),
    scenario               LowCardinality(String),
    seed                   UInt64,
    started_at             DateTime64(3, 'UTC'),
    ended_at               Nullable(DateTime64(3, 'UTC')),
    end_reason             Enum8(
                              'open'        = 0,
                              'auto_reset'  = 1,
                              'admin_reset' = 2,
                              'corrupted'   = 3,
                              'crash'       = 4,
                              'migration'   = 5
                           ),
    auto_pause_enabled     UInt8,
    peak_players           UInt16,
    time_to_peak_s         Nullable(UInt64),
    joins_first_15m        UInt32,
    joins_first_60m        UInt32,
    total_player_seconds   UInt64,
    wall_age_s             UInt64,
    game_age_s             UInt64
)
ENGINE = ReplicatedReplacingMergeTree(
    '/clickhouse/tables/{shard}/gameops/factorio_rotations_raw',
    '{replica}',
    ended_at
)
ORDER BY (server_id, started_at)
PARTITION BY toYYYYMM(started_at)
TTL coalesce(toDateTime(ended_at), toDateTime(started_at)) + INTERVAL 90 DAY;

CREATE TABLE IF NOT EXISTS gameops.factorio_rotations ON CLUSTER 'cluster'
AS gameops.factorio_rotations_raw
ENGINE = Distributed('cluster', 'gameops', 'factorio_rotations_raw', rand());

-- ---------------------------------------------------------------------------
-- factorio_chat_log_raw — moderation buffer only.
--
-- Mirrors the [CHAT] line the relay sidecar already forwards to IRC, plus
-- a `mode` column distinguishing player chat from server messages so the
-- moderation queries don't drown in scenario noise.
--
-- 7 day retention — short window because the IRC bridge is the persistence
-- layer for chat; this table exists only so a moderator can look up "what
-- did <player> say in the last week" without needing IRC scrollback access.
-- Drop the table entirely if Discord audit logs cover the same need.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS gameops.factorio_chat_log_raw ON CLUSTER 'cluster'
(
    ts          DateTime64(3, 'UTC'),
    server_id   LowCardinality(String),
    scenario    LowCardinality(String),
    rotation_id UUID,
    player      LowCardinality(String),
    mode        Enum8('chat' = 1, 'command' = 2, 'system' = 3),
    message     String,
    game_tick   UInt64,
    ingested_at DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = ReplicatedMergeTree(
    '/clickhouse/tables/{shard}/gameops/factorio_chat_log_raw',
    '{replica}'
)
ORDER BY (server_id, ts)
PARTITION BY toYYYYMMDD(ts)
TTL toDateTime(ts) + INTERVAL 7 DAY;

CREATE TABLE IF NOT EXISTS gameops.factorio_chat_log ON CLUSTER 'cluster'
AS gameops.factorio_chat_log_raw
ENGINE = Distributed('cluster', 'gameops', 'factorio_chat_log_raw', rand());
