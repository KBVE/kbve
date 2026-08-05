//! `/palworld-online` — who is currently on the Palworld server.
//!
//! The Palworld relay runs as a sidecar *inside* the Agones GameServer pod, so
//! it cannot be extended without recreating the pod (which restarts the game
//! server). Instead this reads the telemetry the relay already writes to
//! ClickHouse:
//!
//! - `gameops.palworld_snapshots_raw` — one row per poll tick (default 10s)
//!   with the authoritative player count, fps and uptime.
//! - `gameops.palworld_player_events_raw` — one row per join/leave.
//!
//! Player *names* come from the event table, scoped to the `rotation_id` of
//! the newest snapshot. A relay restart mints a fresh `rotation_id` and its
//! poller re-emits a join for everyone currently connected, so ghosts left
//! behind by a crashed rotation never leak into the roster.

use std::sync::Arc;

use jedi::state::sidecar::ClickHouseConfig;
use poise::serenity_prelude as serenity;

use crate::discord::bot::{Context, Error};
use crate::discord::branding;

/// A snapshot is considered stale once the relay has missed several poll
/// ticks. The relay polls every 10s by default.
const STALE_AFTER_SECS: i64 = 60;

/// Upper bound on names rendered in the roster field.
const MAX_ROSTER: usize = 50;

/// ClickHouse-backed reader for Palworld telemetry.
pub struct PalworldStats {
    ch: ClickHouseConfig,
    /// Restricts queries to a single server when `PALWORLD_SERVER_ID` is set.
    server_id: Option<String>,
}

/// Newest snapshot row.
pub struct Snapshot {
    pub server_id: String,
    pub rotation_id: String,
    pub players: i64,
    pub fps: i64,
    pub uptime_s: i64,
    pub age_secs: i64,
}

impl PalworldStats {
    /// `None` when `CLICKHOUSE_URL` is unset — the command then reports that
    /// it is not configured rather than failing at query time.
    pub fn from_env() -> Option<Self> {
        let url = std::env::var("CLICKHOUSE_URL")
            .ok()
            .filter(|s| !s.trim().is_empty())?;

        let server_id = std::env::var("PALWORLD_SERVER_ID")
            .ok()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());

        Some(Self {
            ch: ClickHouseConfig {
                url,
                user: std::env::var("CLICKHOUSE_USER").unwrap_or_default(),
                password: std::env::var("CLICKHOUSE_PASSWORD").unwrap_or_default(),
                database: std::env::var("CLICKHOUSE_DATABASE")
                    .unwrap_or_else(|_| "gameops".into()),
            },
            server_id,
        })
    }

    pub async fn latest_snapshot(&self) -> Result<Option<Snapshot>, Error> {
        let filter = match &self.server_id {
            Some(id) => format!("WHERE server_id = '{}'", escape_sql(id)),
            None => String::new(),
        };
        let query = format!(
            "SELECT server_id, rotation_id, players, fps, uptime_s, \
             toUnixTimestamp(now()) - toUnixTimestamp(ts) AS age_secs \
             FROM gameops.palworld_snapshots_raw {filter} ORDER BY ts DESC LIMIT 1"
        );

        let rows = self.ch.execute_select(&query).await?;
        let Some(row) = rows.into_iter().next() else {
            return Ok(None);
        };

        Ok(Some(Snapshot {
            server_id: str_field(&row, "server_id"),
            rotation_id: str_field(&row, "rotation_id"),
            players: int_field(&row, "players"),
            fps: int_field(&row, "fps"),
            uptime_s: int_field(&row, "uptime_s"),
            age_secs: int_field(&row, "age_secs"),
        }))
    }

    /// Players whose most recent event in `rotation_id` was a join, oldest
    /// session first.
    pub async fn online_players(&self, rotation_id: &str) -> Result<Vec<String>, Error> {
        let query = format!(
            "SELECT player, argMax(event, ts) AS last_event, max(ts) AS last_ts \
             FROM gameops.palworld_player_events_raw \
             WHERE rotation_id = '{}' \
             GROUP BY player HAVING last_event = 'join' \
             ORDER BY last_ts ASC LIMIT {}",
            escape_sql(rotation_id),
            MAX_ROSTER
        );

        let rows = self.ch.execute_select(&query).await?;
        Ok(rows.iter().map(|r| str_field(r, "player")).collect())
    }
}

/// Escapes a value for single-quoted SQL literal interpolation. Inputs are a
/// ClickHouse-supplied UUID and an operator-set env var, but both are still
/// escaped so neither can terminate the literal.
fn escape_sql(value: &str) -> String {
    value.replace('\\', "\\\\").replace('\'', "\\'")
}

fn str_field(row: &serde_json::Value, key: &str) -> String {
    row.get(key)
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string()
}

/// ClickHouse renders 64-bit integers as JSON strings by default
/// (`output_format_json_quote_64bit_integers`), while 32-bit ones stay
/// numbers — accept either.
fn int_field(row: &serde_json::Value, key: &str) -> i64 {
    match row.get(key) {
        Some(serde_json::Value::Number(n)) => n.as_i64().unwrap_or(0),
        Some(serde_json::Value::String(s)) => s.parse().unwrap_or(0),
        _ => 0,
    }
}

fn format_uptime(secs: i64) -> String {
    let secs = secs.max(0);
    let (d, h, m) = (secs / 86_400, (secs % 86_400) / 3_600, (secs % 3_600) / 60);
    if d > 0 {
        format!("{d}d {h}h {m}m")
    } else if h > 0 {
        format!("{h}h {m}m")
    } else {
        format!("{m}m")
    }
}

fn format_roster(players: &[String], count: i64) -> String {
    if players.is_empty() {
        return if count > 0 {
            // The snapshot says people are connected but no join event is on
            // record for this rotation yet (relay just restarted).
            "_Names not available yet — waiting on the next join event._".to_owned()
        } else {
            "_Nobody is online right now._".to_owned()
        };
    }

    let mut body = players
        .iter()
        .map(|p| format!("• {p}"))
        .collect::<Vec<_>>()
        .join("\n");

    if players.len() >= MAX_ROSTER {
        body.push_str(&format!("\n_…roster truncated at {MAX_ROSTER}._"));
    }
    body
}

/// Lists the players currently connected to the Palworld server.
#[poise::command(slash_command, rename = "palworld-online")]
pub async fn palworld_online(ctx: Context<'_>) -> Result<(), Error> {
    let Some(stats) = ctx.data().app.palworld.clone() else {
        ctx.say("Palworld stats are not configured (set `CLICKHOUSE_URL`).")
            .await?;
        return Ok(());
    };

    // The ClickHouse round-trips can outlast Discord's 3s interaction window.
    ctx.defer().await?;

    let Some(snap) = stats.latest_snapshot().await? else {
        ctx.say("No Palworld telemetry recorded yet.").await?;
        return Ok(());
    };

    let players = stats.online_players(&snap.rotation_id).await?;
    let stale = snap.age_secs > STALE_AFTER_SECS;

    let mut embed = serenity::CreateEmbed::new()
        .title("Palworld — Online")
        .url(branding::PROJECT_URL)
        .color(if stale { 0xFEE75C } else { 0x57F287 })
        .author(branding::embed_author())
        .field("Players", snap.players.to_string(), true)
        .field("Server FPS", snap.fps.to_string(), true)
        .field("Uptime", format_uptime(snap.uptime_s), true)
        .field("Roster", format_roster(&players, snap.players), false)
        .footer(serenity::CreateEmbedFooter::new(format!(
            "{} • updated {}s ago",
            snap.server_id, snap.age_secs
        )));

    if stale {
        embed = embed.description(format!(
            ":warning: Last telemetry is {}s old — the server or relay may be down.",
            snap.age_secs
        ));
    }

    ctx.send(poise::CreateReply::default().embed(embed)).await?;
    Ok(())
}

/// Convenience alias so callers can build the state field without importing
/// the struct path directly.
pub fn stats_from_env() -> Option<Arc<PalworldStats>> {
    PalworldStats::from_env().map(Arc::new)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn int_field_accepts_quoted_and_bare_integers() {
        let row = json!({ "players": "7", "fps": 58, "missing": null });
        assert_eq!(int_field(&row, "players"), 7);
        assert_eq!(int_field(&row, "fps"), 58);
        assert_eq!(int_field(&row, "missing"), 0);
        assert_eq!(int_field(&row, "absent"), 0);
    }

    #[test]
    fn escape_sql_neutralizes_quote_and_backslash() {
        assert_eq!(escape_sql("o'brien"), "o\\'brien");
        assert_eq!(escape_sql("a\\b"), "a\\\\b");
        assert_eq!(escape_sql("plain-id"), "plain-id");
    }

    #[test]
    fn uptime_formats_by_magnitude() {
        assert_eq!(format_uptime(90), "1m");
        assert_eq!(format_uptime(3_720), "1h 2m");
        assert_eq!(format_uptime(90_000), "1d 1h 0m");
        assert_eq!(format_uptime(-5), "0m");
    }

    #[test]
    fn empty_roster_distinguishes_idle_from_pending_names() {
        assert!(format_roster(&[], 0).contains("Nobody is online"));
        assert!(format_roster(&[], 3).contains("Names not available yet"));
    }

    #[test]
    fn roster_lists_players_and_flags_truncation() {
        let few = vec!["Al".to_string(), "Bo".to_string()];
        assert_eq!(format_roster(&few, 2), "• Al\n• Bo");

        let many: Vec<String> = (0..MAX_ROSTER).map(|i| format!("p{i}")).collect();
        assert!(format_roster(&many, MAX_ROSTER as i64).contains("roster truncated"));
    }
}
