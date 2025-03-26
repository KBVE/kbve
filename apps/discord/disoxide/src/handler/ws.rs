use axum::{
  extract::ws::{ WebSocket, WebSocketUpgrade, Message, CloseFrame },
  extract::State,
  response::IntoResponse,
  routing::get,
  Router,
};
use futures_util::{ StreamExt, SinkExt };
use std::{ sync::Arc, ops::ControlFlow };
// use tokio::sync::broadcast;
use crate::entity::state::{ AppGlobalState, SharedState };

use jedi::wrapper::{
  redis_ws_update_msg,
  redis_key_update_from_command,
  add_watch_key,
  parse_ws_command,
  extract_watch_command_key,
  build_redis_envelope_from_ws,
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

  let (mut sender, mut receiver) = socket.split();
  let mut redis_rx = state.temple.subscribe_events();
  let state_recv = Arc::clone(&state);
  let state_send = Arc::clone(&state);

  let mut recv_task = tokio::spawn(async move {
    while let Some(Ok(msg)) = receiver.next().await {
      if let Message::Text(text) = msg {
        match parse_ws_command(&text) {
          Ok(ws_msg) => {
            if let Some(key) = extract_watch_command_key(&ws_msg) {
              let key_arc: Arc<str> = Arc::from(key);
              let guard = state_recv.temple.watch_manager.guard();
              state_recv.temple.watch_manager.watch(conn_id_bytes, key_arc.clone(), &guard);

              tracing::info!(
                "Connection {} is now watching key: {}",
                conn_id.as_str(),
                key_arc
              );
            } else if let Some(cmd) = build_redis_envelope_from_ws(&ws_msg) {
              let _ = state_recv.temple.send_redis(cmd).await;
            }
          }
          Err(e) => tracing::warn!("Invalid WebSocket message: {}", e),
        }
      } else if process_message(msg).is_break() {
        break;
      }
    }

    let guard = state_recv.temple.watch_manager.guard();
    state_recv.temple.watch_manager.remove_connection(&conn_id_bytes, &guard);
  });

  let mut send_task = tokio::spawn(async move {
    loop {
      tokio::select! {
        msg = redis_rx.recv() => {
          match msg {
            Ok(envelope) => {
              let maybe_update = match envelope.event.object {
                Some(Object::Command(cmd)) => {
                  redis_key_update_from_command(&cmd).and_then(|upd| {
                    let guard = state_send.temple.watch_manager.guard();
                    if state_send.temple.watch_manager.is_watching(&conn_id_bytes, &*upd.key, &guard) {
                      Some(redis_ws_update_msg(upd))
                    } else {
                      None
                    }
                  })
                }
                Some(Object::Update(update)) => {
                  let guard = state_send.temple.watch_manager.guard();
                  if state_send.temple.watch_manager.is_watching(&conn_id_bytes, &*update.key, &guard) {
                    Some(redis_ws_update_msg(update))
                  } else {
                    None
                  }
                }
                _ => None,
              };

              if let Some(ws_msg) = maybe_update {
                if let Some(json) = ws_msg.as_json_string() {
                  if sender.send(Message::Text(json.into())).await.is_err() {
                    break;
                  }
                }
              }
            }
            Err(err) => {
              tracing::warn!("Redis event receive failed: {:?}", err);
              break;
            }
          }
        }

        _ = tokio::time::sleep(std::time::Duration::from_secs(30)) => {
          if sender.send(Message::Ping(vec![1, 2, 3].into())).await.is_err() {
            break;
          }
        }
      }
    }
  });

  tokio::select! {
    _ = &mut send_task => recv_task.abort(),
    _ = &mut recv_task => send_task.abort(),
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
