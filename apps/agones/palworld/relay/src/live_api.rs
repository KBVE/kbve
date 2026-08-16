use std::sync::Arc;

use anyhow::Result;
use axum::{Json, Router, extract::State, http::header, response::IntoResponse, routing::get};
use serde::Serialize;
use tokio::sync::RwLock;
use tracing::info;

use crate::config::Config;
use crate::event_tail::{BossDefeat, SharedBosses, SharedEvents, WorldEvent};

#[derive(Debug, Clone, Serialize, Default)]
pub struct LivePlayer {
    pub name: String,
    pub level: i64,
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct LiveSnapshot {
    pub ts: i64,
    pub fps: i64,
    pub uptime_s: i64,
    pub player_count: i64,
    pub players: Vec<LivePlayer>,
}

pub type SharedLive = Arc<RwLock<LiveSnapshot>>;

#[derive(Clone)]
pub struct LiveState {
    pub snap: SharedLive,
    pub bosses: SharedBosses,
    pub events: SharedEvents,
    pub intel_path: Arc<str>,
}

#[derive(Debug, Clone, Serialize)]
struct LiveResponse {
    #[serde(flatten)]
    snap: LiveSnapshot,
    bosses: Vec<BossDefeat>,
    events: Vec<WorldEvent>,
}

#[derive(Debug, Clone, Serialize)]
struct EventsResponse {
    ts: i64,
    events: Vec<WorldEvent>,
}

const LIVE_HEADERS: [(header::HeaderName, &str); 2] = [
    (header::ACCESS_CONTROL_ALLOW_ORIGIN, "*"),
    (header::CACHE_CONTROL, "no-store"),
];

async fn players(State(state): State<LiveState>) -> impl IntoResponse {
    let snap = state.snap.read().await.clone();
    let now = chrono::Utc::now().timestamp_millis();
    let mut bosses: Vec<BossDefeat> = state
        .bosses
        .read()
        .await
        .values()
        .filter(|b| b.respawn_at > now)
        .cloned()
        .collect();
    bosses.sort_by_key(|b| b.respawn_at);
    let events = state.events.read().await.clone();
    (
        LIVE_HEADERS,
        Json(LiveResponse {
            snap,
            bosses,
            events,
        }),
    )
}

async fn events(State(state): State<LiveState>) -> impl IntoResponse {
    let events = state.events.read().await.clone();
    (
        LIVE_HEADERS,
        Json(EventsResponse {
            ts: chrono::Utc::now().timestamp_millis(),
            events,
        }),
    )
}

pub fn parse_intel(raw: &str) -> Option<serde_json::Value> {
    match serde_json::from_str::<serde_json::Value>(raw) {
        Ok(v) if v.is_object() => Some(v),
        _ => None,
    }
}

async fn bases(State(state): State<LiveState>) -> impl IntoResponse {
    let intel = tokio::fs::read_to_string(state.intel_path.as_ref())
        .await
        .ok()
        .and_then(|raw| parse_intel(&raw));
    let body = intel.unwrap_or_else(|| {
        serde_json::json!({
            "ts": chrono::Utc::now().timestamp_millis(),
            "available": false,
            "guilds": [],
        })
    });
    (LIVE_HEADERS, Json(body))
}

async fn healthz() -> &'static str {
    "ok"
}

async fn landing() -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "text/html; charset=utf-8")],
        crate::landing::LANDING_HTML,
    )
}

pub async fn run(cfg: Config, state: LiveState) -> Result<()> {
    let app = Router::new()
        .route("/", get(landing))
        .route("/live/players", get(players))
        .route("/live/events", get(events))
        .route("/live/bases", get(bases))
        .route("/live/healthz", get(healthz))
        .with_state(state);
    let listener = tokio::net::TcpListener::bind(("0.0.0.0", cfg.live_api_port)).await?;
    info!(port = cfg.live_api_port, "live_api listening");
    axum::serve(listener, app).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::parse_intel;

    #[test]
    fn parse_intel_accepts_snapshot_object() {
        let v = parse_intel(r#"{"ts":1,"guild_count":1,"guilds":[{"name":"KBVE"}]}"#).unwrap();
        assert_eq!(v["guilds"][0]["name"], "KBVE");
    }

    #[test]
    fn parse_intel_rejects_partial_or_non_object() {
        assert!(parse_intel("{\"ts\":1,").is_none());
        assert!(parse_intel("[]").is_none());
        assert!(parse_intel("").is_none());
    }
}
