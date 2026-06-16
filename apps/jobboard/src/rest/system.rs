use crate::state::AppState;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::get;
use axum::{Json, Router};
use std::sync::{Arc, OnceLock};

/// Resolve the reported version at RUNTIME, not compile time. `env!` bakes the
/// value into the binary, but the Docker build's sccache mount doesn't key on
/// CARGO_PKG_VERSION — so a version-only bump gets a cache hit and the baked
/// string goes stale (image tag advances, /health stays behind). Reading at
/// runtime sidesteps that: APP_VERSION env, else the version.txt the Dockerfile
/// writes from Cargo.toml, else the compile-time fallback (fine for local cargo).
fn version() -> &'static str {
    static VERSION: OnceLock<String> = OnceLock::new();
    VERSION.get_or_init(|| {
        std::env::var("APP_VERSION")
            .ok()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .or_else(|| {
                std::fs::read_to_string("/app/version.txt")
                    .ok()
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
            })
            .unwrap_or_else(|| env!("CARGO_PKG_VERSION").to_string())
    })
}

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/health", get(health))
        .route("/ready", get(readiness))
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
