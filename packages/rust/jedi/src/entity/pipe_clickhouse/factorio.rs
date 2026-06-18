// Typed query builders for the gameops.factorio_* Distributed tables.
//
// Mirrors logs.rs: build SQL inside Rust so axum-kbve can hit ClickHouse
// directly via ClickHouseConfig::execute_select. Tables are the Distributed
// twins defined in packages/data/ch/schemas/factorio.sql and fed by the relay
// sidecar (apps/agones/factorio/relay). Fully-qualified `gameops.*` names so
// the query is independent of the connection's default database.
//
// Bounds match logs.rs (minutes 1..=10080, limit 1..=500). The optional
// server_id filter is escaped + inlined the same way.

use serde::{Deserialize, Serialize};

use super::super::super::error::JediError;
use super::super::super::state::sidecar::ClickHouseConfig;
use super::logs::{LogsResult, MAX_LIMIT, MAX_MINUTES};

const DEFAULT_MINUTES: u32 = 60;
const DEFAULT_LIMIT: u32 = 200;

fn escape(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for ch in input.chars() {
        match ch {
            '\\' => out.push_str("\\\\"),
            '\'' => out.push_str("\\'"),
            c => out.push(c),
        }
    }
    out
}

fn clamped_minutes(raw: Option<u32>) -> u32 {
    raw.unwrap_or(DEFAULT_MINUTES).clamp(1, MAX_MINUTES)
}

fn clamped_limit(raw: Option<u32>) -> u32 {
    raw.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT)
}

fn server_filter(server_id: &Option<String>) -> String {
    match server_id.as_deref().filter(|s| !s.is_empty()) {
        Some(id) => format!(" AND server_id = '{}'", escape(id)),
        None => String::new(),
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct FactorioParams {
    #[serde(default)]
    pub server_id: Option<String>,
    #[serde(default)]
    pub minutes: Option<u32>,
    #[serde(default)]
    pub limit: Option<u32>,
}

/// Latest snapshot per server — the "current status" view.
pub fn build_current_sql(params: &FactorioParams) -> String {
    let minutes = clamped_minutes(params.minutes);
    format!(
        "SELECT server_id, scenario, toString(rotation_id) AS rotation_id, \
		 seed, players, ups, map_age_game_s, map_age_wall_s, \
		 auto_pause_enabled, game_tick, ts \
		 FROM gameops.factorio_snapshots \
		 WHERE ts > now() - INTERVAL {minutes} MINUTE{server} \
		 ORDER BY ts DESC \
		 LIMIT 1 BY server_id",
        minutes = minutes,
        server = server_filter(&params.server_id),
    )
}

/// Raw snapshot time-series (player count / UPS / map age over time).
pub fn build_snapshots_sql(params: &FactorioParams) -> String {
    let minutes = clamped_minutes(params.minutes);
    let limit = clamped_limit(params.limit);
    format!(
        "SELECT ts, server_id, players, ups, map_age_game_s, map_age_wall_s \
		 FROM gameops.factorio_snapshots \
		 WHERE ts > now() - INTERVAL {minutes} MINUTE{server} \
		 ORDER BY ts DESC \
		 LIMIT {limit}",
        minutes = minutes,
        server = server_filter(&params.server_id),
        limit = limit,
    )
}

/// Recent player join / leave / kick events.
pub fn build_players_sql(params: &FactorioParams) -> String {
    let minutes = clamped_minutes(params.minutes);
    let limit = clamped_limit(params.limit);
    format!(
        "SELECT ts, server_id, player, event, game_tick \
		 FROM gameops.factorio_player_events \
		 WHERE ts > now() - INTERVAL {minutes} MINUTE{server} \
		 ORDER BY ts DESC \
		 LIMIT {limit}",
        minutes = minutes,
        server = server_filter(&params.server_id),
        limit = limit,
    )
}

/// Recent chat / command / system lines (moderation buffer).
pub fn build_chat_sql(params: &FactorioParams) -> String {
    let minutes = clamped_minutes(params.minutes);
    let limit = clamped_limit(params.limit);
    format!(
        "SELECT ts, server_id, player, mode, message, game_tick \
		 FROM gameops.factorio_chat_log \
		 WHERE ts > now() - INTERVAL {minutes} MINUTE{server} \
		 ORDER BY ts DESC \
		 LIMIT {limit}",
        minutes = minutes,
        server = server_filter(&params.server_id),
        limit = limit,
    )
}

/// Map rotation history. `FINAL` collapses the ReplacingMergeTree so the
/// latest upsert of each rotation_id wins. No time window — bounded by limit.
pub fn build_rotations_sql(params: &FactorioParams) -> String {
    let limit = clamped_limit(params.limit);
    let server = match params.server_id.as_deref().filter(|s| !s.is_empty()) {
        Some(id) => format!("WHERE server_id = '{}' ", escape(id)),
        None => String::new(),
    };
    format!(
        "SELECT toString(rotation_id) AS rotation_id, server_id, scenario, seed, \
		 started_at, ended_at, end_reason, auto_pause_enabled, peak_players, \
		 time_to_peak_s, joins_first_15m, joins_first_60m, total_player_seconds, \
		 wall_age_s, game_age_s \
		 FROM gameops.factorio_rotations FINAL \
		 {server}\
		 ORDER BY started_at DESC \
		 LIMIT {limit}",
        server = server,
        limit = limit,
    )
}

async fn run(config: &ClickHouseConfig, sql: String) -> Result<LogsResult, JediError> {
    let rows = config.execute_select(&sql).await?;
    Ok(LogsResult {
        count: rows.len(),
        rows,
    })
}

pub async fn run_current(
    config: &ClickHouseConfig,
    params: &FactorioParams,
) -> Result<LogsResult, JediError> {
    run(config, build_current_sql(params)).await
}

pub async fn run_snapshots(
    config: &ClickHouseConfig,
    params: &FactorioParams,
) -> Result<LogsResult, JediError> {
    run(config, build_snapshots_sql(params)).await
}

pub async fn run_players(
    config: &ClickHouseConfig,
    params: &FactorioParams,
) -> Result<LogsResult, JediError> {
    run(config, build_players_sql(params)).await
}

pub async fn run_chat(
    config: &ClickHouseConfig,
    params: &FactorioParams,
) -> Result<LogsResult, JediError> {
    run(config, build_chat_sql(params)).await
}

pub async fn run_rotations(
    config: &ClickHouseConfig,
    params: &FactorioParams,
) -> Result<LogsResult, JediError> {
    run(config, build_rotations_sql(params)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn server_filter_escapes_and_omits() {
        let none = FactorioParams::default();
        assert!(!build_snapshots_sql(&none).contains("server_id ="));
        let some = FactorioParams {
            server_id: Some("factorio-1".into()),
            ..Default::default()
        };
        assert!(build_snapshots_sql(&some).contains("server_id = 'factorio-1'"));
        let inject = FactorioParams {
            server_id: Some("x' OR '1'='1".into()),
            ..Default::default()
        };
        assert!(build_snapshots_sql(&inject).contains("\\' OR"));
    }

    #[test]
    fn clamps_bounds() {
        let p = FactorioParams {
            minutes: Some(999_999),
            limit: Some(999_999),
            ..Default::default()
        };
        let sql = build_snapshots_sql(&p);
        assert!(sql.contains(&format!("INTERVAL {MAX_MINUTES} MINUTE")));
        assert!(sql.contains(&format!("LIMIT {MAX_LIMIT}")));
    }
}
