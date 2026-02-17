use axum::{
    routing::get,
    response::IntoResponse,
    Json, Router,
    middleware,
};
use serde_json::json;

use crate::auth::jwt::require_auth;

pub fn api_router() -> Router {
    Router::new()
        .route("/status", get(status))
        .route("/channels", get(channels))
        .route("/users", get(users))
        .layer(middleware::from_fn(require_auth))
}

async fn status() -> impl IntoResponse {
    let ergo_ws = std::env::var("ERGO_WS_URL")
        .unwrap_or_else(|_| "ws://ergo-irc-service.irc.svc.cluster.local:8080".into());
    let ergo_irc = format!(
        "{}:{}",
        std::env::var("ERGO_IRC_HOST").unwrap_or_else(|_| "ergo-irc-service.irc.svc.cluster.local".into()),
        std::env::var("ERGO_IRC_PORT").unwrap_or_else(|_| "6667".into()),
    );

    Json(json!({
        "status": "ok",
        "version": env!("CARGO_PKG_VERSION"),
        "ergo_ws": ergo_ws,
        "ergo_irc": ergo_irc,
    }))
}

async fn channels() -> impl IntoResponse {
    // Placeholder — will query Ergo's channel list in future
    Json(json!({
        "channels": ["#general", "#help"]
    }))
}

async fn users() -> impl IntoResponse {
    // Placeholder — will track connected users in future
    Json(json!({
        "count": 0,
        "users": []
    }))
}
