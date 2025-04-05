use axum::{
  extract::ws::{ WebSocket, WebSocketUpgrade, Message, CloseFrame },
  extract::State,
  response::IntoResponse,
  routing::get,
  Router,
};
use futures_util::{ StreamExt, SinkExt };
use std::{ sync::Arc, ops::ControlFlow };
use tokio::sync::{oneshot, Mutex};

// use tokio::sync::broadcast;
use crate::entity::state::{ AppGlobalState, SharedState };
use tokio::sync::mpsc::{ channel, Sender };

use jedi::wrapper::{
  add_watch_key,
  build_redis_envelope_from_ws,
  extract_watch_command_key,
  parse_ws_command,
  redis_key_update_from_command,
  redis_ws_error_msg,
  redis_ws_update_msg,
  send_ws_error,
};

use jedi::proto::redis::{
  RedisKeyUpdate,
  RedisWsMessage,
  RedisEventObject,
  redis_event_object::Object,
};

use jedi::entity::ulid::ConnectionId;
use jedi::watchmaster::WatchManager;

// const MAX_CONNECTIONS: usize = 1000;

async fn websocket_handler(
  ws: WebSocketUpgrade,
  State(state): State<Arc<AppGlobalState>>
) -> impl IntoResponse {
  ws.on_upgrade(move |socket| handle_websocket(socket, state))
}

async fn handle_websocket(socket: WebSocket, state: Arc<AppGlobalState>) {
  let conn_id = ConnectionId::new();
  let conn_id_bytes = conn_id.as_bytes();

  let (socket_tx, mut socket_rx) = socket.split();
  let (ws_tx, mut ws_rx): (Sender<Message>, _) = channel(64); // You can adjust the buffer size

  let mut redis_rx = state.temple.subscribe_events();
  let state_recv = Arc::clone(&state);
  let state_send = Arc::clone(&state);

  let ws_tx_clone = ws_tx.clone();
  let conn_id_bytes = conn_id_bytes.clone();
  let state_clone = Arc::clone(&state);

  let mut redis_event_task = tokio::spawn(async move {
    while let Ok(envelope) = redis_rx.recv().await {
      let maybe_update = match envelope.event.object {
        Some(Object::Command(cmd)) => {
          redis_key_update_from_command(&cmd).and_then(|upd| {
            if state_clone.temple.watch_manager.is_watching(&conn_id_bytes, &*upd.key) {
              Some(redis_ws_update_msg(upd))
            } else {
              None
            }
          })
        }
        Some(Object::Update(update)) => {
          if state_clone.temple.watch_manager.is_watching(&conn_id_bytes, &*update.key) {
            Some(redis_ws_update_msg(update))
          } else {
            None
          }
        }
        _ => None,
      };

      if let Some(ws_msg) = maybe_update {
        if let Some(json) = ws_msg.as_json_string() {
          if ws_tx_clone.send(Message::Text(json.into())).await.is_err() {
            break;
          }
        }
      }
    }
  });

  // Task to forward outgoing WebSocket messages from the internal channel
  let mut send_task = tokio::spawn(async move {
    let mut sink = socket_tx;
    while let Some(msg) = ws_rx.recv().await {
      if sink.send(msg).await.is_err() {
        break;
      }
    }
  });

  // Task to receive and process incoming WebSocket messages
  let mut recv_task = tokio::spawn(async move {
    while let Some(Ok(msg)) = socket_rx.next().await {
      if let Message::Text(text) = msg {
        match parse_ws_command(&text) {
          Ok(ws_msg) => {
            if let Some(key) = extract_watch_command_key(&ws_msg) {
              let key_arc = Arc::<str>::from(key);
              match state_recv.temple.watch_manager.watch(conn_id_bytes, key_arc.clone()) {
                Ok(_) => {
                  tracing::info!(
                    "Connection {} is now watching key: {}",
                    conn_id.as_str(),
                    key_arc
                  );
                }
                Err(err) => {
                  tracing::warn!(
                    "Watch error for conn {} on key {}: {}",
                    conn_id.as_str(),
                    key_arc,
                    err
                  );
                  let _ = ws_tx.send(Message::Text(redis_ws_error_msg(&err).into())).await;
                }
              }
            } else if let Some(mut cmd) = build_redis_envelope_from_ws(&ws_msg) {
              //let _ = state_recv.temple.send_redis(cmd).await;

              let (tx, rx) = oneshot::channel();
              cmd.response_tx = Some(tx);

              if state_recv.temple.send_redis(cmd).await.is_ok() {
                if let Ok(response) = rx.await {
                  let json = serde_json
                    ::to_string(&response)
                    .unwrap_or_else(|_|
                      "{\"status\":\"error\",\"value\":\"serialization error\"}".into()
                    );
                  let _ = ws_tx.send(Message::Text(json.into())).await;
                }
              }
            } else {
              let _ = ws_tx.send(Message::Text(redis_ws_error_msg("Invalid command").into())).await;
            }
          }
          Err(e) => {
            tracing::warn!("Failed to parse WebSocket message: {}", e);
            let _ = ws_tx.send(
              Message::Text(redis_ws_error_msg("Invalid message format").into())
            ).await;
          }
        }
      } else if process_message(msg).is_break() {
        break;
      }
    }

    state_recv.temple.watch_manager.remove_connection(&conn_id_bytes);
  });

  tokio::select! {
      _ = &mut send_task => {
          recv_task.abort();
          redis_event_task.abort();
      }
      _ = &mut recv_task => {
          send_task.abort();
          redis_event_task.abort();
      }
      _ = &mut redis_event_task => {
          recv_task.abort();
          send_task.abort();
      }
  }

  tracing::info!("WebSocket connection closed.");
}

fn process_message(msg: Message) -> ControlFlow<(), ()> {
  match msg {
    Message::Text(text) => {
      tracing::info!("Received: {}", text);
    }
    Message::Binary(data) => {
      tracing::info!("Received binary data: {} bytes", data.len());
    }
    Message::Ping(data) => {
      tracing::info!("Received Ping: {:?}", data);
    }
    Message::Pong(data) => {
      tracing::info!("Received Pong: {:?}", data);
    }
    Message::Close(Some(CloseFrame { code, reason })) => {
      tracing::info!("Connection closed. Code: {}, Reason: {}", code, reason);
      return ControlFlow::Break(());
    }
    Message::Close(None) => {
      tracing::info!("Connection closed.");
      return ControlFlow::Break(());
    }
  }
  ControlFlow::Continue(())
}

pub fn ws_router() -> Router<SharedState> {
  Router::new().route("/ws", get(websocket_handler))
}
