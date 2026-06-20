use std::sync::Arc;

use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use serde_json::json;

use crate::state::AppState;

pub async fn health() -> Json<serde_json::Value> {
    Json(json!({
        "status": "healthy",
        "service": "metrics",
        "version": env!("CARGO_PKG_VERSION"),
    }))
}

pub async fn readiness(State(app): State<Arc<AppState>>) -> impl IntoResponse {
    let ready = app.ch.execute_select("SELECT 1").await.is_ok();
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
