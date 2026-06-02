use axum::{
    extract::Request,
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    http::StatusCode,
    response::IntoResponse,
};
use futures_util::{SinkExt, StreamExt};
use std::time::Duration;
use tokio::time::{interval, timeout};
use tokio_tungstenite::connect_async;
use tracing::{error, info, warn};

use crate::auth::jwt;

const NO_USERNAME_MSG: &str = "No provider username configured. Set a username on your OAuth provider (Discord/GitHub/Twitch) before joining IRC.";

const WS_MAX_FRAME_BYTES: usize = 16 * 1024;
const WS_MAX_MESSAGE_BYTES: usize = 64 * 1024;
const WS_PING_INTERVAL: Duration = Duration::from_secs(30);
const WS_READ_DEADLINE: Duration = Duration::from_secs(90);

pub async fn ws_handler(ws: WebSocketUpgrade, req: Request) -> impl IntoResponse {
    let token = match jwt::extract_token(&req) {
        Some(t) => t,
        None => return StatusCode::UNAUTHORIZED.into_response(),
    };

    let claims = match jwt::validate_token(&token) {
        Ok(c) => c,
        Err(status) => return status.into_response(),
    };

    let username = match claims.irc_nick() {
        Some(n) => n,
        None => {
            warn!(sub = %claims.sub, "rejecting WS upgrade: no provider username");
            return (StatusCode::FORBIDDEN, NO_USERNAME_MSG).into_response();
        }
    };

    info!(user = %username, "WebSocket upgrade accepted");

    ws.max_frame_size(WS_MAX_FRAME_BYTES)
        .max_message_size(WS_MAX_MESSAGE_BYTES)
        .on_upgrade(move |socket| proxy_to_ergo(socket, username))
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

    if let Err(e) = ergo_sink
        .send(tokio_tungstenite::tungstenite::Message::Text(
            nick_cmd.into(),
        ))
        .await
    {
        error!("Failed to send NICK to Ergo: {e}");
        return;
    }
    if let Err(e) = ergo_sink
        .send(tokio_tungstenite::tungstenite::Message::Text(
            user_cmd.into(),
        ))
        .await
    {
        error!("Failed to send USER to Ergo: {e}");
        return;
    }

    info!(user = %username, "Connected to Ergo");

    let (client_pulse_tx, mut client_pulse_rx) = tokio::sync::mpsc::unbounded_channel::<()>();

    let client_to_ergo = async {
        loop {
            let msg = match timeout(WS_READ_DEADLINE, client_stream.next()).await {
                Ok(Some(Ok(m))) => m,
                Ok(Some(Err(_))) | Ok(None) => break,
                Err(_) => {
                    warn!(user = %username, "client idle past read deadline; closing");
                    break;
                }
            };
            let _ = client_pulse_tx.send(());
            let ergo_msg = match msg {
                Message::Text(t) => {
                    tokio_tungstenite::tungstenite::Message::Text(t.to_string().into())
                }
                Message::Binary(b) => tokio_tungstenite::tungstenite::Message::Binary(b.into()),
                Message::Ping(p) => tokio_tungstenite::tungstenite::Message::Ping(p.into()),
                Message::Pong(p) => tokio_tungstenite::tungstenite::Message::Pong(p.into()),
                Message::Close(_) => break,
            };
            if ergo_sink.send(ergo_msg).await.is_err() {
                break;
            }
        }
    };

    let ergo_to_client = async {
        let mut ping_timer = interval(WS_PING_INTERVAL);
        ping_timer.tick().await;
        loop {
            tokio::select! {
                msg = ergo_stream.next() => {
                    let msg = match msg {
                        Some(Ok(m)) => m,
                        _ => break,
                    };
                    let client_msg = match msg {
                        tokio_tungstenite::tungstenite::Message::Text(t) => {
                            Message::Text(t.to_string().into())
                        }
                        tokio_tungstenite::tungstenite::Message::Binary(b) => Message::Binary(b.into()),
                        tokio_tungstenite::tungstenite::Message::Ping(p) => Message::Ping(p.into()),
                        tokio_tungstenite::tungstenite::Message::Pong(p) => Message::Pong(p.into()),
                        tokio_tungstenite::tungstenite::Message::Close(_) => break,
                        _ => continue,
                    };
                    if client_sink.send(client_msg).await.is_err() {
                        break;
                    }
                }
                _ = ping_timer.tick() => {
                    if client_sink.send(Message::Ping(Default::default())).await.is_err() {
                        break;
                    }
                }
                _ = client_pulse_rx.recv() => {
                    ping_timer.reset();
                }
            }
        }
    };

    tokio::select! {
        _ = client_to_ergo => {},
        _ = ergo_to_client => {},
    }

    info!(user = %username, "WebSocket session ended");
}
