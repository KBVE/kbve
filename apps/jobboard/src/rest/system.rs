use crate::state::AppState;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::get;
use axum::{Json, Router};
use std::sync::Arc;

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/health", get(health))
        .route("/ready", get(readiness))
}

async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "status": "healthy", "service": "jobboard" }))
}

async fn readiness(State(app): State<Arc<AppState>>) -> impl IntoResponse {
    let health = app.db.health().await;
    let db_ok = health.all_ok();
    let status = if db_ok {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };
    let body = serde_json::json!({
        "status": if db_ok { "ready" } else { "degraded" },
        "service": "jobboard",
        "database": db_ok,
        "uptime_seconds": app.started_at.elapsed().as_secs(),
    });
    (status, Json(body))
}
