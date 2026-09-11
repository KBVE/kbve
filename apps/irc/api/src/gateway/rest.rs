use axum::{
    Extension, Json, Router,
    extract::Query,
    http::StatusCode,
    middleware,
    response::IntoResponse,
    routing::{get, post},
};
use bevy_chat::{ChatMessage, MessageKind};
use serde::Deserialize;
use serde_json::json;

use crate::auth::jwt::{Claims, require_auth};
use crate::gateway::{ergo, history};

const DEFAULT_USERNAME_SETUP_URL: &str = "https://kbve.com/askama/profile";

pub fn api_router() -> Router {
    Router::new()
        .route("/status", get(status))
        .route("/channels", get(channels))
        .route("/users", get(users))
        .route("/me", get(me))
        .route("/history", get(history_get))
        .route("/mod/announce", post(announce))
        .layer(middleware::from_fn(require_auth))
}

#[derive(Deserialize)]
struct HistoryQuery {
    channel: String,
}

async fn history_get(Query(q): Query<HistoryQuery>) -> impl IntoResponse {
    if !history::is_tracked(&q.channel) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({ "error": "channel not tracked" })),
        )
            .into_response();
    }
    Json(history::recent(&q.channel).await).into_response()
}

#[derive(Deserialize)]
struct AnnounceBody {
    channel: String,
    message: String,
}

async fn announce(
    Extension(claims): Extension<Claims>,
    Json(body): Json<AnnounceBody>,
) -> impl IntoResponse {
    if !claims.is_staff() {
        return StatusCode::FORBIDDEN.into_response();
    }
    if !history::is_tracked(&body.channel) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({ "error": "channel not tracked" })),
        )
            .into_response();
    }
    if body.message.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "empty message" })),
        )
            .into_response();
    }

    let sender = claims.irc_nick().unwrap_or_else(|| "staff".to_string());
    let msg = ChatMessage {
        kind: MessageKind::System,
        sender: sender.clone(),
        platform: "system".to_string(),
        channel: body.channel.clone(),
        content: body.message.clone(),
        payload: None,
    };

    match ergo::announce(
        &body.channel,
        &format!("mod-{sender}"),
        &msg.to_irc_privmsg(),
    )
    .await
    {
        Ok(()) => (StatusCode::ACCEPTED, Json(json!({ "status": "sent" }))).into_response(),
        Err(e) => {
            tracing::error!(error = %e, "staff announce relay failed");
            (
                StatusCode::BAD_GATEWAY,
                Json(json!({ "error": "relay failed" })),
            )
                .into_response()
        }
    }
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
