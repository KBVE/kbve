use crate::state::AppState;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::get;
use axum::{Json, Router};
use std::sync::{Arc, OnceLock};

/// Reported version. APP_VERSION env is the single source of truth (set on the
/// k8s deployment + local compose, kept in sync with the image tag from the MDX
/// bump by utils-post-publish.yml). Falls back to the compile-time
/// CARGO_PKG_VERSION for plain `cargo run`. The builder re-copies the real
/// Cargo.toml (cargo-chef zeroes it in the cook skeleton) so the fallback is
/// accurate too.
fn version() -> &'static str {
    static VERSION: OnceLock<String> = OnceLock::new();
    VERSION.get_or_init(|| {
        std::env::var("APP_VERSION")
            .ok()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| env!("CARGO_PKG_VERSION").to_string())
    })
}

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/health", get(health))
        .route("/ready", get(readiness))
}

/// Routes merged under /api (SPA-facing). `dev` drives the dev-mode banner.
pub fn api_routes() -> Router<Arc<AppState>> {
    Router::new().route("/meta", get(meta))
}

async fn meta(State(app): State<Arc<AppState>>) -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "version": version(),
        "dev": app.dev(),
    }))
}

async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "status": "healthy",
        "service": "jobboard",
        "version": version(),
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
        "version": version(),
        "uptime_seconds": app.started_at.elapsed().as_secs(),
        "database": {
            "rw": health.rw.ok,
            "ro": health.ro.ok,
            "any": health.any.ok,
        },
    });
    (status, Json(body))
}
