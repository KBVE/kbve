use axum::{
    extract::{
        State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    response::IntoResponse,
};
use futures_util::{SinkExt, StreamExt};

use super::GameServerState;

/// WebSocket upgrade handler — mounted at `/ws/game`.
pub async fn ws_game_handler(
    ws: WebSocketUpgrade,
    State(state): State<GameServerState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_connection(socket, state))
}

async fn handle_connection(socket: WebSocket, state: GameServerState) {
    let (mut sender, mut receiver) = socket.split();

    // Subscribe to world snapshots
    let mut snapshot_rx = state.inner.snapshot_tx.subscribe();

    // Task: forward world snapshots to this client
    let send_task = tokio::spawn(async move {
        while let Ok(snapshot) = snapshot_rx.recv().await {
            if sender.send(Message::Binary(snapshot.into())).await.is_err() {
                break;
            }
        }
    });

    // Task: receive client inputs
    let recv_state = state.clone();
    let recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            match msg {
                Message::Binary(data) => {
                    handle_client_input(&recv_state, &data);
                }
                Message::Close(_) => break,
                _ => {}
            }
        }
    });

    // When either task ends, abort the other
    tokio::select! {
        _ = send_task => {},
        _ = recv_task => {},
    }

    tracing::debug!("game client disconnected");
}

fn handle_client_input(state: &GameServerState, data: &[u8]) {
    // TODO: parse protobuf input message, apply to physics world
    let _ = (state, data);
}
