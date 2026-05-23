//! Server-side WebSocket transport — axum router + per-match session loop.
//!
//! Every connection must send a `ClientMessage::JoinMatch` first; the server
//! verifies the Supabase JWT (HS256 against `SUPABASE_JWT_SECRET`) before it
//! emits Welcome or subscribes to the snapshot broadcast. If the secret is
//! unset the server runs in dev-accept mode and admits the username field
//! at face value — handy for local smoke runs, never for production.

use std::sync::Arc;

use axum::Router;
use axum::extract::State;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::response::IntoResponse;
use axum::routing::get;
use tokio::sync::broadcast;

#[cfg(feature = "supabase-auth")]
use crate::auth;
use crate::proto::{self, ClientMessage, ServerEvent};

#[derive(Clone)]
pub struct ServerState {
    /// Broadcast bus shared with the bevy sim. WS sessions subscribe a
    /// receiver per connection.
    pub broadcast: Option<broadcast::Sender<ServerEvent>>,
    /// Seed echoed back to clients in the Welcome frame.
    pub seed: u64,
    /// Supabase JWT secret. Empty = dev-accept mode (any token admitted).
    pub jwt_secret: Vec<u8>,
}

impl ServerState {
    pub fn new(broadcast: broadcast::Sender<ServerEvent>, seed: u64, jwt_secret: Vec<u8>) -> Self {
        Self {
            broadcast: Some(broadcast),
            seed,
            jwt_secret,
        }
    }

    pub fn empty() -> Self {
        Self {
            broadcast: None,
            seed: 0,
            jwt_secret: Vec::new(),
        }
    }
}

struct AdmittedPlayer {
    slot: proto::PlayerSlot,
    kbve_username: String,
}

/// Build the axum router with the supplied shared state.
pub fn router(state: ServerState) -> Router {
    Router::new()
        .route("/healthz", get(|| async { "ok" }))
        .route("/ws", get(ws_upgrade))
        .with_state(Arc::new(state))
}

async fn ws_upgrade(
    ws: WebSocketUpgrade,
    State(state): State<Arc<ServerState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(mut socket: WebSocket, state: Arc<ServerState>) {
    let admitted = match await_join_match(&mut socket, &state).await {
        Some(a) => a,
        None => return,
    };

    let welcome = ServerEvent::Welcome {
        protocol: proto::PROTOCOL_VERSION,
        your_slot: admitted.slot,
        seed: state.seed,
    };
    if let Ok(buf) = proto::encode(&welcome)
        && socket.send(Message::Binary(buf)).await.is_err()
    {
        return;
    }

    let mut rx = state.broadcast.as_ref().map(|tx| tx.subscribe());

    loop {
        tokio::select! {
            biased;
            evt = async {
                match &mut rx {
                    Some(r) => r.recv().await.ok(),
                    None => futures_util::future::pending::<Option<ServerEvent>>().await,
                }
            } => {
                let Some(evt) = evt else { break };
                let evt = inject_admitted_player(evt, &admitted);
                let Ok(buf) = proto::encode(&evt) else { continue };
                if socket.send(Message::Binary(buf)).await.is_err() {
                    break;
                }
            }
            incoming = socket.recv() => {
                let Some(Ok(msg)) = incoming else { break };
                match msg {
                    Message::Binary(bytes) => {
                        let mut buf = bytes;
                        let _ = proto::decode::<ClientMessage>(&mut buf);
                    }
                    Message::Close(_) => break,
                    _ => {}
                }
            }
        }
    }
}

async fn await_join_match(
    socket: &mut WebSocket,
    state: &Arc<ServerState>,
) -> Option<AdmittedPlayer> {
    loop {
        let msg = socket.recv().await?.ok()?;
        let Message::Binary(bytes) = msg else {
            continue;
        };
        let mut buf = bytes;
        let Ok(ClientMessage::JoinMatch(jm)) = proto::decode::<ClientMessage>(&mut buf) else {
            send_reject(socket, "expected JoinMatch as first frame").await;
            return None;
        };
        if jm.protocol != proto::PROTOCOL_VERSION {
            send_reject(
                socket,
                &format!(
                    "protocol mismatch: client={}, server={}",
                    jm.protocol,
                    proto::PROTOCOL_VERSION
                ),
            )
            .await;
            return None;
        }
        return admit(state, jm).await;
    }
}

#[cfg(feature = "supabase-auth")]
async fn admit(state: &Arc<ServerState>, jm: proto::JoinMatch) -> Option<AdmittedPlayer> {
    if state.jwt_secret.is_empty() {
        return Some(AdmittedPlayer {
            slot: proto::PlayerSlot(0),
            kbve_username: if jm.kbve_username.is_empty() {
                "guest".into()
            } else {
                jm.kbve_username
            },
        });
    }
    match auth::verify_supabase_jwt(&jm.jwt, &state.jwt_secret) {
        Ok(claims) => Some(AdmittedPlayer {
            slot: proto::PlayerSlot(0),
            kbve_username: claims.kbve_username,
        }),
        Err(_) => None,
    }
}

#[cfg(not(feature = "supabase-auth"))]
async fn admit(_state: &Arc<ServerState>, jm: proto::JoinMatch) -> Option<AdmittedPlayer> {
    Some(AdmittedPlayer {
        slot: proto::PlayerSlot(0),
        kbve_username: if jm.kbve_username.is_empty() {
            "guest".into()
        } else {
            jm.kbve_username
        },
    })
}

async fn send_reject(socket: &mut WebSocket, reason: &str) {
    let evt = ServerEvent::Reject {
        reason: reason.to_string(),
    };
    if let Ok(buf) = proto::encode(&evt) {
        let _ = socket.send(Message::Binary(buf)).await;
    }
}

/// Patches Snapshot frames so the admitted player shows up in `players[]`
/// even before the sim builds its own roster.
fn inject_admitted_player(evt: ServerEvent, admitted: &AdmittedPlayer) -> ServerEvent {
    match evt {
        ServerEvent::Snapshot(mut snap) => {
            if snap.players.is_empty() {
                snap.players.push(proto::PlayerView {
                    slot: admitted.slot,
                    kbve_username: admitted.kbve_username.clone(),
                    connected: true,
                });
            }
            ServerEvent::Snapshot(snap)
        }
        other => other,
    }
}
