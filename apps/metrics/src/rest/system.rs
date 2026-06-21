use std::sync::Arc;
use std::time::Duration;

use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use serde_json::json;

use crate::state::AppState;

const READINESS_TIMEOUT: Duration = Duration::from_secs(2);

pub async fn health() -> Json<serde_json::Value> {
    Json(json!({
        "status": "healthy",
        "service": "metrics",
        "version": env!("CARGO_PKG_VERSION"),
    }))
}

pub async fn readiness(State(app): State<Arc<AppState>>) -> impl IntoResponse {
    // Bounded so a hung ClickHouse fails fast to "degraded" instead of hanging
    // until the kube probe deadline.
    let ready = matches!(
        tokio::time::timeout(READINESS_TIMEOUT, app.ch.execute_select("SELECT 1")).await,
        Ok(Ok(_))
    );
    let status = if ready {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };
    let body = json!({
        "status": if ready { "ready" } else { "degraded" },
        "service": "metrics",
        "version": env!("CARGO_PKG_VERSION"),
        "uptime_seconds": app.started_at.elapsed().as_secs(),
        "clickhouse": ready,
    });
    (status, Json(body))
}
