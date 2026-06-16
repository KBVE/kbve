use crate::state::AppState;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::get;
use axum::{Json, Router};
use std::sync::Arc;

const VERSION: &str = env!("CARGO_PKG_VERSION");

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/health", get(health))
        .route("/ready", get(readiness))
}

async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "status": "healthy",
        "service": "jobboard",
        "version": VERSION,
    }))
}

async fn readiness(State(app): State<Arc<AppState>>) -> impl IntoResponse {
    let health = app.db.health().await;
    let ready = health.rw.ok;
    let status = if ready {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };
    let body = serde_json::json!({
        "status": if ready { "ready" } else { "degraded" },
        "service": "jobboard",
        "version": VERSION,
        "uptime_seconds": app.started_at.elapsed().as_secs(),
        "database": {
            "rw": health.rw.ok,
            "ro": health.ro.ok,
            "any": health.any.ok,
        },
    });
    (status, Json(body))
}
