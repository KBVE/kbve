use std::sync::Arc;

use anyhow::Result;
use axum::{Json, Router, extract::State, http::header, response::IntoResponse, routing::get};
use serde::Serialize;
use tokio::sync::RwLock;
use tracing::info;

use crate::config::Config;

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

async fn players(State(live): State<SharedLive>) -> impl IntoResponse {
    let snap = live.read().await.clone();
    (
        [
            (header::ACCESS_CONTROL_ALLOW_ORIGIN, "*"),
            (header::CACHE_CONTROL, "no-store"),
        ],
        Json(snap),
    )
}

async fn healthz() -> &'static str {
    "ok"
}

pub async fn run(cfg: Config, live: SharedLive) -> Result<()> {
    let app = Router::new()
        .route("/live/players", get(players))
        .route("/live/healthz", get(healthz))
        .with_state(live);
    let listener = tokio::net::TcpListener::bind(("0.0.0.0", cfg.live_api_port)).await?;
    info!(port = cfg.live_api_port, "live_api listening");
    axum::serve(listener, app).await?;
    Ok(())
}
