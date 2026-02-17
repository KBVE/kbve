use axum::{
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    extract::Request,
    http::StatusCode,
    response::IntoResponse,
};
use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::connect_async;
use tracing::{info, warn, error};

use crate::auth::jwt;

/// Handle WebSocket upgrade — validate JWT first, then proxy to Ergo
pub async fn ws_handler(ws: WebSocketUpgrade, req: Request) -> impl IntoResponse {
    let token = match jwt::extract_token(&req) {
        Some(t) => t,
        None => return StatusCode::UNAUTHORIZED.into_response(),
    };

    let claims = match jwt::validate_token(&token) {
        Ok(c) => c,
        Err(status) => return status.into_response(),
    };

    let username = claims.email
        .as_deref()
        .unwrap_or(&claims.sub)
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '_')
        .take(32)
        .collect::<String>();

    info!(user = %username, "WebSocket upgrade accepted");

    ws.on_upgrade(move |socket| proxy_to_ergo(socket, username))
        .into_response()
}

async fn proxy_to_ergo(client_ws: WebSocket, username: String) {
    let ergo_url = std::env::var("ERGO_WS_URL")
        .unwrap_or_else(|_| "ws://ergo-irc-service.irc.svc.cluster.local:8080".into());

    let ergo_ws = match connect_async(&ergo_url).await {
        Ok((ws, _)) => ws,
        Err(e) => {
            error!("Failed to connect to Ergo: {e}");
            return;
        }
    };

    let (mut ergo_sink, mut ergo_stream) = ergo_ws.split();
    let (mut client_sink, mut client_stream) = client_ws.split();

    // Auto-register with Ergo using authenticated identity
    let nick_cmd = format!("NICK {username}\r\n");
    let user_cmd = format!("USER {username} 0 * :{username}\r\n");

    if let Err(e) = ergo_sink.send(tokio_tungstenite::tungstenite::Message::Text(nick_cmd.into())).await {
        error!("Failed to send NICK to Ergo: {e}");
        return;
    }
    if let Err(e) = ergo_sink.send(tokio_tungstenite::tungstenite::Message::Text(user_cmd.into())).await {
        error!("Failed to send USER to Ergo: {e}");
        return;
    }

    info!(user = %username, "Connected to Ergo");

    // Bidirectional proxy
    let client_to_ergo = async {
        while let Some(Ok(msg)) = client_stream.next().await {
            let ergo_msg = match msg {
                Message::Text(t) => tokio_tungstenite::tungstenite::Message::Text(t),
                Message::Binary(b) => tokio_tungstenite::tungstenite::Message::Binary(b),
                Message::Ping(p) => tokio_tungstenite::tungstenite::Message::Ping(p),
                Message::Pong(p) => tokio_tungstenite::tungstenite::Message::Pong(p),
                Message::Close(_) => break,
            };
            if ergo_sink.send(ergo_msg).await.is_err() {
                break;
            }
        }
    };

    let ergo_to_client = async {
        while let Some(Ok(msg)) = ergo_stream.next().await {
            let client_msg = match msg {
                tokio_tungstenite::tungstenite::Message::Text(t) => Message::Text(t),
                tokio_tungstenite::tungstenite::Message::Binary(b) => Message::Binary(b),
                tokio_tungstenite::tungstenite::Message::Ping(p) => Message::Ping(p),
                tokio_tungstenite::tungstenite::Message::Pong(p) => Message::Pong(p),
                tokio_tungstenite::tungstenite::Message::Close(_) => break,
                _ => continue,
            };
            if client_sink.send(client_msg).await.is_err() {
                break;
            }
        }
    };

    tokio::select! {
        _ = client_to_ergo => {},
        _ = ergo_to_client => {},
    }

    info!(user = %username, "WebSocket session ended");
}
