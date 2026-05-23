//! Server-side WebSocket transport — axum router + per-match session loop.
//!
//! The router accepts an optional broadcast `Sender<ServerEvent>` so the bevy
//! sim can fan out snapshots to every connected client. When `None`, the
//! handler still sends a Welcome on connect for smoke tests.

use std::sync::Arc;

use axum::Router;
use axum::extract::State;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::response::IntoResponse;
use axum::routing::get;
use tokio::sync::broadcast;

use crate::proto::{self, ServerEvent};

#[derive(Clone)]
pub struct ServerState {
    /// Broadcast bus shared with the bevy sim. WS sessions subscribe a
    /// receiver per connection.
    pub broadcast: Option<broadcast::Sender<ServerEvent>>,
    /// Seed echoed back to clients in the Welcome frame.
    pub seed: u64,
}

impl ServerState {
    pub fn new(broadcast: broadcast::Sender<ServerEvent>, seed: u64) -> Self {
        Self {
            broadcast: Some(broadcast),
            seed,
        }
    }

    pub fn empty() -> Self {
        Self {
            broadcast: None,
            seed: 0,
        }
    }
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
    let welcome = ServerEvent::Welcome {
        protocol: proto::PROTOCOL_VERSION,
        your_slot: proto::PlayerSlot(0),
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
            // Snapshot fanout → forward to client.
            biased;
            evt = async {
                match &mut rx {
                    Some(r) => r.recv().await.ok(),
                    None => futures_util::future::pending::<Option<ServerEvent>>().await,
                }
            } => {
                let Some(evt) = evt else { break };
                let Ok(buf) = proto::encode(&evt) else { continue };
                if socket.send(Message::Binary(buf)).await.is_err() {
                    break;
                }
            }
            // Inbound client frames.
            incoming = socket.recv() => {
                let Some(Ok(msg)) = incoming else { break };
                match msg {
                    Message::Binary(bytes) => {
                        let mut buf = bytes;
                        let _ = proto::decode::<proto::ClientFrame>(&mut buf);
                        // Inputs land in the bevy sim once that pump exists.
                    }
                    Message::Close(_) => break,
                    _ => {}
                }
            }
        }
    }
}
