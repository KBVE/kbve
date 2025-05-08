use axum::{
  extract::ws::{ WebSocket, WebSocketUpgrade, Message, CloseFrame },
  extract::State,
  response::IntoResponse,
  routing::get,
  Router,
};
use futures_util::{ StreamExt, SinkExt };
use std::{ sync::Arc, ops::ControlFlow };
use tokio::sync::{ oneshot, Mutex };

// use tokio::sync::broadcast;
use crate::entity::state::{ AppGlobalState, SharedState };
use tokio::sync::mpsc::{ channel, Sender };

use jedi::{
  entity::ulid::ConnectionId, envelope::EnvelopePipeline, error::JediError, proto::jedi::{JediEnvelope, PayloadFormat}, watchmaster::WatchManager
};
use bytes::Bytes;

// const MAX_CONNECTIONS: usize = 1000;

async fn websocket_handler(
  ws: WebSocketUpgrade,
  State(state): State<Arc<AppGlobalState>>
) -> impl IntoResponse {
  ws.on_upgrade(move |socket| handle_websocket(socket, state))
}


pub async fn handle_websocket(socket: WebSocket, state: Arc<AppGlobalState>) {
  let conn_id = ConnectionId::new();
  let conn_id_bytes = conn_id.as_bytes();

  let (mut socket_tx, mut socket_rx) = socket.split();
  let (ws_tx, mut ws_rx): (Sender<Message>, _) = channel(64);
  let state_clone = Arc::clone(&state);

  // Redis event forwarder
  let mut redis_rx = state.temple.subscribe_events();
  let redis_task = tokio::spawn({
    let ws_tx = ws_tx.clone();
    let conn_id = conn_id_bytes.clone();
    let state = Arc::clone(&state);

    async move {
      while let Ok(env) = redis_rx.recv().await {
        // Only forward if the connection is watching the key
        if let Ok(Some(key)) = env.extract_key_if_watched(&state.temple.watch_manager, &conn_id) {
          if let Ok(msg) = env.to_ws_message() {
            let _ = ws_tx.send(msg).await;
          }
        }
      }
    }
  });

  // Outbound WebSocket messages
  let send_task = tokio::spawn(async move {
    while let Some(msg) = ws_rx.recv().await {
      if socket_tx.send(msg).await.is_err() {
        break;
      }
    }
  });

  // Inbound WebSocket handling
  let recv_task = tokio::spawn({
    let ws_tx = ws_tx.clone();
    let state = Arc::clone(&state);

    async move {
      while let Some(Ok(msg)) = socket_rx.next().await {
        match msg {
          Message::Text(_) | Message::Binary(_) => {
            match JediEnvelope::from_ws_message(&msg) {
              Ok(mut env) => {
                // Inject connection ID into metadata
                env = env.with_metadata(Bytes::copy_from_slice(&conn_id_bytes));

                match env.process(&state.temple).await {
                  Ok(out_env) => {
                    if let Ok(response_msg) = out_env.to_ws_message() {
                      let _ = ws_tx.send(response_msg).await;
                    }
                  }
                  Err(e) => {
                    let err_env = JediEnvelope::error_with_meta("WebSocket", &e.to_string(), env.metadata_or_empty(), env.format.try_into().unwrap_or_default());
                    if let Ok(err_msg) = err_env.to_ws_message() {
                      let _ = ws_tx.send(err_msg).await;
                    }
                  }
                }
              }
              Err(e) => {
                let err_msg = Message::Text(format!(r#"{{"error":"{}"}}"#, e).into());
                let _ = ws_tx.send(err_msg).await;
              }
            }
          }

          Message::Ping(ping) => {
            let _ = ws_tx.send(Message::Pong(ping)).await;
          }

          Message::Close(_) => break,

          _ => continue,
        }
      }

      // Cleanup
      state.temple.watch_manager.remove_connection(&conn_id_bytes, PayloadFormat::Flex);

    }
  });

  // Drive all tasks
  tokio::select! {
    _ = redis_task => {
      send_task.abort();
      recv_task.abort();
    }
    _ = send_task => {
      redis_task.abort();
      recv_task.abort();
    }
    _ = recv_task => {
      redis_task.abort();
      send_task.abort();
    }
  }

  tracing::info!("[WebSocket] Closed: {}", conn_id.as_str());
}


pub fn ws_router() -> Router<SharedState> {
  Router::new().route("/ws", get(websocket_handler))
}
