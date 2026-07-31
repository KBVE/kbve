use std::sync::Arc;

use anyhow::Result;
use axum::{Json, Router, extract::State, http::header, response::IntoResponse, routing::get};
use serde::Serialize;
use tokio::sync::RwLock;
use tracing::info;

use crate::config::Config;
use crate::event_tail::{BossDefeat, SharedBosses};

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
}

#[derive(Debug, Clone, Serialize)]
struct LiveResponse {
    #[serde(flatten)]
    snap: LiveSnapshot,
    bosses: Vec<BossDefeat>,
}

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
    (
        [
            (header::ACCESS_CONTROL_ALLOW_ORIGIN, "*"),
            (header::CACHE_CONTROL, "no-store"),
        ],
        Json(LiveResponse { snap, bosses }),
    )
}

async fn healthz() -> &'static str {
    "ok"
}

pub async fn run(cfg: Config, state: LiveState) -> Result<()> {
    let app = Router::new()
        .route("/live/players", get(players))
        .route("/live/healthz", get(healthz))
        .with_state(state);
    let listener = tokio::net::TcpListener::bind(("0.0.0.0", cfg.live_api_port)).await?;
    info!(port = cfg.live_api_port, "live_api listening");
    axum::serve(listener, app).await?;
    Ok(())
}
