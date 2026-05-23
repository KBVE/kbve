//! Server-side WebSocket transport — axum router + per-match session loop.
//!
//! Real session state (Agones lifecycle, snapshot fanout, JWT verify) lands
//! after `apps/td-server/` boots end-to-end. For now this module only ships
//! a router factory + an echo handler that the binary can mount as a smoke
//! test.

use axum::Router;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::response::IntoResponse;
use axum::routing::get;

#[cfg(feature = "proto-shared")]
use crate::proto;

/// Build the axum router. Mount under any base path in the host binary.
pub fn router() -> Router {
    Router::new()
        .route("/healthz", get(|| async { "ok" }))
        .route("/ws", get(ws_upgrade))
}

async fn ws_upgrade(ws: WebSocketUpgrade) -> impl IntoResponse {
    ws.on_upgrade(handle_socket)
}

async fn handle_socket(mut socket: WebSocket) {
    // Send a Welcome immediately so the client side can prove the round-trip
    // before the sim is wired up. Slot + seed are placeholder values.
    #[cfg(feature = "proto-shared")]
    {
        let evt = proto::ServerEvent::Welcome {
            protocol: proto::PROTOCOL_VERSION,
            your_slot: proto::PlayerSlot(0),
            seed: 0,
        };
        if let Ok(buf) = proto::encode(&evt) {
            let _ = socket.send(Message::Binary(buf)).await;
        }
    }

    while let Some(Ok(msg)) = socket.recv().await {
        match msg {
            Message::Binary(bytes) => {
                // Echo any ClientFrame the client sends. Real handler will
                // route inputs into the bevy sim.
                #[cfg(feature = "proto-shared")]
                {
                    let mut buf = bytes.clone();
                    let _ = proto::decode::<proto::ClientFrame>(&mut buf);
                }
                let _ = socket.send(Message::Binary(bytes)).await;
            }
            Message::Close(_) => break,
            _ => {}
        }
    }
}
