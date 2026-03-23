use axum::{Json, Router, routing::get};
use serde_json::json;

pub fn router() -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/api/v1/status", get(status))
}

async fn health() -> Json<serde_json::Value> {
    Json(json!({ "status": "healthy", "service": "rows" }))
}

async fn status() -> Json<serde_json::Value> {
    Json(json!({
        "service": "rows",
        "version": env!("CARGO_PKG_VERSION"),
    }))
}
