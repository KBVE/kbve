//! `/minechat` — JSON-framed WebSocket endpoint for Minecraft/Unity clients.
//!
//! ## Why this exists
//!
//! The existing `/ws` endpoint proxies raw IRC protocol frames so browser
//! IRC clients can talk to ergo as if they spoke IRC directly. That's great
//! for people running an IRC client in the browser, but it makes every new
//! game client re-implement an IRC parser just to say "hello".
//!
//! `/minechat` terminates the IRC protocol on the server side. Clients send
//! and receive structured [`ChatMessage`] JSON frames and never see a PRIVMSG
//! in their lives. The gateway translates JSON ↔ IRC internally, auto-joins
//! the game channel on connect, and enforces a channel + kind whitelist so a
//! malicious client can't send arbitrary raw IRC.
//!
//! ## Wire format (both directions)
//!
//! ```json
//! { "kind": "chat", "sender": "mc-abcd1234", "platform": "minecraft",
//!   "channel": "#world-events", "content": "hello", "payload": null }
//! ```
//!
//! ## Auth
//!
//! Reuses the JWT flow from [`/ws`]. The client nick is deterministically
//! derived from the JWT subject so a player can't impersonate another
//! player on the wire: `mc-<first 8 alnum chars of sub>`.
//!
//! ## Safety rails
//!
//! - **Channel whitelist** — clients can only publish to channels in
//!   [`ALLOWED_CHANNELS`]. Attempts on other channels are silently dropped
//!   (logged at debug).
//! - **Server-side platform tag** — the client's `platform` field is
//!   overwritten with the authenticated session's platform ("minecraft"
//!   for now). Prevents a client from claiming to be someone else's
//!   platform.
//! - **Server-side sender tag** — same treatment as `platform`; the server
//!   pins it to the authenticated nick.
//! - **No raw IRC passthrough** — there is no escape hatch to send arbitrary
//!   IRC commands from this endpoint. If you want raw IRC, use `/ws`.

use axum::{
    extract::Request,
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    http::StatusCode,
    response::IntoResponse,
};
use bevy_chat::{ChatMessage, MessageKind};
use futures_util::{SinkExt, StreamExt};
use std::sync::Arc;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpStream;
use tokio::sync::Mutex;
use tokio::time::{interval, timeout};
use tracing::{debug, error, info, warn};

const WS_PING_INTERVAL: Duration = Duration::from_secs(30);
const WS_READ_DEADLINE: Duration = Duration::from_secs(90);

use crate::auth::jwt;

/// Handle to the ergo writer, shared between the two session tasks so
/// either one can emit a line (PONG replies, publishes, etc.) without
/// fighting over ownership of the TCP socket.
type ErgoWriter = Arc<Mutex<tokio::net::tcp::OwnedWriteHalf>>;

/// Channels a `/minechat` client is allowed to publish to.
///
/// Kept static and tiny on purpose — expanding this set is a deliberate
/// decision, not something clients can negotiate. If a channel isn't in
/// this list, publishes are dropped.
const ALLOWED_CHANNELS: &[&str] = &["#world-events", "#mc-global"];

/// Platform tag stamped onto every message leaving this endpoint.
const PLATFORM: &str = "minecraft";

/// Upgrade the HTTP request to a WebSocket, authenticate, and hand off to
/// the session loop.
pub async fn ws_handler(ws: WebSocketUpgrade, req: Request) -> impl IntoResponse {
    let token = match jwt::extract_token(&req) {
        Some(t) => t,
        None => return StatusCode::UNAUTHORIZED.into_response(),
    };

    let claims = match jwt::validate_token(&token) {
        Ok(c) => c,
        Err(status) => return status.into_response(),
    };

    // Derive the game nick from the JWT subject. We keep it short and
    // prefixed so it's obvious in channel activity which identities are
    // game clients vs. browser-IRC clients.
    let nick = format!("mc-{}", sanitize_sub(&claims.sub, 8));

    info!(user = %nick, "minechat upgrade accepted");
    ws.max_frame_size(16 * 1024)
        .max_message_size(64 * 1024)
        .on_upgrade(move |socket| session(socket, nick))
        .into_response()
}

/// Per-connection state machine. Runs until the WebSocket closes or ergo
/// drops the IRC connection. Two independent futures fan JSON↔IRC in each
/// direction; either one returning ends the session via `tokio::select!`.
async fn session(client_ws: WebSocket, nick: String) {
    let ergo_host = std::env::var("ERGO_IRC_HOST")
        .unwrap_or_else(|_| "ergo-irc-service.irc.svc.cluster.local".into());
    let ergo_port: u16 = std::env::var("ERGO_IRC_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(6667);

    let ergo = match TcpStream::connect(format!("{ergo_host}:{ergo_port}")).await {
        Ok(s) => s,
        Err(e) => {
            error!(user = %nick, "failed to connect to ergo: {e}");
            return;
        }
    };

    let (ergo_r, ergo_w_raw) = ergo.into_split();
    let mut ergo_reader = BufReader::new(ergo_r);
    let ergo_w: ErgoWriter = Arc::new(Mutex::new(ergo_w_raw));

    // Register with ergo: NICK + USER + auto-join each allowed channel.
    // We send these before splitting into tasks so the client sees a
    // ready session once JOIN replies arrive.
    if let Err(e) = write_irc_line(&ergo_w, &format!("NICK {nick}")).await {
        error!(user = %nick, "NICK write failed: {e}");
        return;
    }
    if let Err(e) = write_irc_line(&ergo_w, &format!("USER {nick} 0 * :minechat gateway")).await {
        error!(user = %nick, "USER write failed: {e}");
        return;
    }
    for ch in ALLOWED_CHANNELS {
        if let Err(e) = write_irc_line(&ergo_w, &format!("JOIN {ch}")).await {
            warn!(user = %nick, channel = ch, "JOIN write failed: {e}");
        }
    }

    let (mut client_tx, mut client_rx) = client_ws.split();
    let (pulse_tx, mut pulse_rx) = tokio::sync::mpsc::unbounded_channel::<()>();

    let nick_c2i = nick.clone();
    let ergo_w_c2i = Arc::clone(&ergo_w);
    let pulse_tx_c2i = pulse_tx.clone();
    let c2i = async move {
        loop {
            let msg = match timeout(WS_READ_DEADLINE, client_rx.next()).await {
                Ok(Some(Ok(m))) => m,
                Ok(Some(Err(_))) | Ok(None) => break,
                Err(_) => {
                    warn!(user = %nick_c2i, "minechat client idle past read deadline");
                    break;
                }
            };
            let _ = pulse_tx_c2i.send(());
            let text = match msg {
                Message::Text(t) => t.to_string(),
                Message::Close(_) => break,
                Message::Ping(_) | Message::Pong(_) => continue,
                Message::Binary(_) => {
                    debug!(user = %nick_c2i, "ignoring binary frame");
                    continue;
                }
            };

            let mut parsed = match serde_json::from_str::<ChatMessage>(&text) {
                Ok(m) => m,
                Err(e) => {
                    debug!(user = %nick_c2i, "dropping malformed JSON frame: {e}");
                    continue;
                }
            };

            // Channel whitelist — silently drop anything unexpected.
            if !ALLOWED_CHANNELS.iter().any(|c| *c == parsed.channel) {
                debug!(user = %nick_c2i, channel = %parsed.channel, "channel not allowed");
                continue;
            }

            // Keep the Custom kind tag tight so it can't smuggle control
            // characters through the IRC wire format.
            if let MessageKind::Custom(ref s) = parsed.kind {
                if s.is_empty()
                    || s.len() > 32
                    || !s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
                {
                    debug!(user = %nick_c2i, "dropping malformed custom kind");
                    continue;
                }
            }

            // Pin sender + platform server-side so clients can't spoof.
            parsed.sender = nick_c2i.clone();
            parsed.platform = PLATFORM.to_string();

            let line = parsed.to_irc_privmsg();
            if let Err(e) = write_irc_line(&ergo_w_c2i, &line).await {
                warn!(user = %nick_c2i, "ergo write failed: {e}");
                break;
            }
        }
    };

    let nick_i2c = nick.clone();
    let ergo_w_i2c = Arc::clone(&ergo_w);
    let i2c = async move {
        let mut line = String::new();
        let mut ping_timer = interval(WS_PING_INTERVAL);
        ping_timer.tick().await;
        loop {
            tokio::select! {
                read = ergo_reader.read_line(&mut line) => {
                    let n = match read {
                        Ok(0) => break,
                        Ok(n) => n,
                        Err(e) => {
                            warn!(user = %nick_i2c, "ergo read failed: {e}");
                            break;
                        }
                    };
                    let raw = line[..n].trim_end_matches(['\r', '\n']).to_string();
                    line.clear();
                    if let Some(rest) = raw.strip_prefix("PING ") {
                        let pong = format!("PONG {rest}");
                        if let Err(e) = write_irc_line(&ergo_w_i2c, &pong).await {
                            warn!(user = %nick_i2c, "PONG write failed: {e}");
                            break;
                        }
                        continue;
                    }
                    if let Some((channel, payload)) = parse_privmsg(&raw) {
                        if let Some(mut msg) = ChatMessage::from_irc_privmsg(&channel, &payload) {
                            if msg.platform.is_empty() {
                                msg.platform = "irc".into();
                            }
                            if send_json(&mut client_tx, &msg).await.is_err() {
                                break;
                            }
                        }
                    }
                }
                _ = ping_timer.tick() => {
                    if client_tx.send(Message::Ping(Default::default())).await.is_err() {
                        break;
                    }
                }
                _ = pulse_rx.recv() => {
                    ping_timer.reset();
                }
            }
        }
    };

    tokio::select! {
        _ = c2i => {},
        _ = i2c => {},
    }

    info!(user = %nick, "minechat session ended");
}

/// Write a single IRC command to ergo, terminated with CRLF. Acquires
/// the writer mutex briefly — both session tasks share the same TCP
/// writer half, so this is how they cooperate.
async fn write_irc_line(w: &ErgoWriter, line: &str) -> std::io::Result<()> {
    let mut guard = w.lock().await;
    guard.write_all(line.as_bytes()).await?;
    guard.write_all(b"\r\n").await?;
    guard.flush().await
}

/// Serialise a [`ChatMessage`] and push it to the WebSocket client.
async fn send_json(
    tx: &mut futures_util::stream::SplitSink<WebSocket, Message>,
    msg: &ChatMessage,
) -> Result<(), ()> {
    let text = serde_json::to_string(msg).map_err(|_| ())?;
    tx.send(Message::Text(text.into())).await.map_err(|_| ())
}

/// Parse `:nick!user@host PRIVMSG #channel :payload` → `(channel, payload)`.
/// Returns `None` for any other IRC line (JOIN, PING, numerics, etc.).
fn parse_privmsg(line: &str) -> Option<(String, String)> {
    // Strip leading `:prefix ` if present.
    let rest = if let Some(rest) = line.strip_prefix(':') {
        rest.split_once(' ').map(|(_p, r)| r)?
    } else {
        line
    };
    let mut parts = rest.splitn(3, ' ');
    let cmd = parts.next()?;
    if cmd != "PRIVMSG" {
        return None;
    }
    let channel = parts.next()?.to_string();
    let trailing = parts.next()?;
    let payload = trailing.strip_prefix(':').unwrap_or(trailing).to_string();
    Some((channel, payload))
}

/// Keep only ASCII alphanumerics from a JWT sub and truncate.
fn sanitize_sub(sub: &str, max_len: usize) -> String {
    sub.chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .take(max_len)
        .collect::<String>()
        .to_ascii_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_simple_privmsg() {
        let line = ":alice!a@host PRIVMSG #world-events :[CHAT] alice@minecraft: hello";
        let (ch, payload) = parse_privmsg(line).unwrap();
        assert_eq!(ch, "#world-events");
        assert_eq!(payload, "[CHAT] alice@minecraft: hello");
    }

    #[test]
    fn ignores_non_privmsg() {
        assert!(parse_privmsg("PING :server").is_none());
        assert!(parse_privmsg(":bob JOIN #foo").is_none());
    }

    #[test]
    fn sanitizes_sub() {
        assert_eq!(sanitize_sub("abc-123|XYZ", 8), "abc123xy");
        assert_eq!(sanitize_sub("A", 8), "a");
    }
}
