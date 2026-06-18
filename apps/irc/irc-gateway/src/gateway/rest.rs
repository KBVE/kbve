use axum::{Extension, Json, Router, middleware, response::IntoResponse, routing::get};
use serde_json::json;

use crate::auth::jwt::{Claims, require_auth};
use crate::gateway::ergo;

const DEFAULT_USERNAME_SETUP_URL: &str = "https://kbve.com/askama/profile";

pub fn api_router() -> Router {
    Router::new()
        .route("/status", get(status))
        .route("/channels", get(channels))
        .route("/users", get(users))
        .route("/me", get(me))
        .layer(middleware::from_fn(require_auth))
}

async fn me(Extension(claims): Extension<Claims>) -> impl IntoResponse {
    let username = claims.irc_nick();
    let setup_url = std::env::var("KBVE_USERNAME_SETUP_URL")
        .unwrap_or_else(|_| DEFAULT_USERNAME_SETUP_URL.to_string());

    Json(json!({
        "has_username": username.is_some(),
        "username": username,
        "sub": claims.sub,
        "setup_url": setup_url,
    }))
}

async fn status() -> impl IntoResponse {
    let ergo_ws = ergo::ws_url();
    let ergo_irc = format!("{}:{}", ergo::irc_host(), ergo::irc_port());

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
