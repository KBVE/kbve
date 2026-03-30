//! Minimal HTTP health server for k8s probes and e2e smoke tests.
//!
//! Runs on a separate port (default 4322) alongside the Discord gateway.
//! Provides `/health` (JSON) and `/healthz` (plain text) endpoints.

use std::sync::Arc;

use axum::{Json, Router, extract::State, http::StatusCode, response::IntoResponse, routing::get};
use serde_json::json;

use crate::state::AppState;

const DEFAULT_PORT: u16 = 4322;

/// Start the health HTTP server. Runs until the task is cancelled.
pub async fn serve(state: Arc<AppState>) -> anyhow::Result<()> {
    let port: u16 = std::env::var("HEALTH_PORT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(DEFAULT_PORT);

    let app = Router::new()
        .route("/health", get(health_json))
        .route("/healthz", get(health_plain))
        .with_state(state);

    let addr = std::net::SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!(%addr, "Health server listening");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

async fn health_json(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let uptime = state.start_time.elapsed().as_secs();
    (
        StatusCode::OK,
        Json(json!({
            "status": "ok",
            "version": env!("CARGO_PKG_VERSION"),
            "uptime_secs": uptime,
        })),
    )
}

async fn health_plain() -> impl IntoResponse {
    (StatusCode::OK, "ok")
}
