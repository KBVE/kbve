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
use crate::gateway::ergo;
use crate::gateway::filter;
use crate::gateway::ratelimit;

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
    let ergo_url = ergo::ws_url();

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
    // Raw IRC NOTICE lines pushed back to the web client when a message is
    // blocked. ergo_to_client owns the client sink, so c2e hands notices off
    // through this channel.
    let (notice_tx, mut notice_rx) = tokio::sync::mpsc::unbounded_channel::<String>();

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
                    let text = t.to_string();
                    // The web client speaks raw IRC. Gate every PRIVMSG line
                    // through the same anti-spam + content filter the game path
                    // uses, so a web client can't bypass it with a raw frame.
                    match gate_text(&username, &text).await {
                        Gate::Forward => tokio_tungstenite::tungstenite::Message::Text(text.into()),
                        Gate::Block { channel, reason } => {
                            let _ = notice_tx.send(format!(
                                ":gateway NOTICE {channel} :message blocked: {reason}\r\n"
                            ));
                            continue;
                        }
                        Gate::Kick => {
                            warn!(user = %username, "flood detected; disconnecting session");
                            break;
                        }
                    }
                }
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
                _ = ping_timer.tick() => {
                    if client_sink.send(Message::Ping(Default::default())).await.is_err() {
                        break;
                    }
                }
                _ = client_pulse_rx.recv() => {
                    ping_timer.reset();
                }
                notice = notice_rx.recv() => {
                    match notice {
                        Some(line) => {
                            if client_sink.send(Message::Text(line.into())).await.is_err() {
                                break;
                            }
                        }
                        None => break,
                    }
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

/// What to do with a raw text frame from the web client.
enum Gate {
    /// Forward unchanged.
    Forward,
    /// Drop it and notice the sender on `channel` with `reason`.
    Block {
        channel: String,
        reason: &'static str,
    },
    /// Sustained flood — disconnect.
    Kick,
}

/// Run anti-spam + content filtering over every PRIVMSG line in a raw frame.
/// Non-PRIVMSG control lines (NICK/JOIN/PONG/…) pass straight through. The
/// first offending line decides the whole frame, so a blocked PRIVMSG drops
/// the frame rather than leaking part of it to ergo.
async fn gate_text(user: &str, text: &str) -> Gate {
    for line in text.split("\r\n").flat_map(|l| l.split('\n')) {
        let line = line.trim_end_matches('\r');
        if line.is_empty() {
            continue;
        }
        let Some((_, channel, payload)) = ergo::parse_privmsg(line) else {
            continue;
        };
        match ratelimit::verdict(user).await {
            ratelimit::Verdict::Allow => {}
            ratelimit::Verdict::Throttle => {
                return Gate::Block {
                    channel,
                    reason: "rate limit",
                };
            }
            ratelimit::Verdict::Kick => return Gate::Kick,
        }
        if let filter::Decision::Block(reason) = filter::check(user, &payload) {
            return Gate::Block { channel, reason };
        }
    }
    Gate::Forward
}
