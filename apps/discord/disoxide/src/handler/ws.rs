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
use crate::entity::state::GlobalState;

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

use jedi::entity::ulid::new_ulid_string;
use jedi::watchmaster::{ WatchList, WatchManager };

// const MAX_CONNECTIONS: usize = 1000;

async fn websocket_handler(
  ws: WebSocketUpgrade,
  State(state): State<Arc<GlobalState>>
) -> impl IntoResponse {
  ws.on_upgrade(move |socket| handle_websocket(socket, state))
}

async fn handle_websocket(socket: WebSocket, state: Arc<GlobalState>) {
  // let (tx, _rx) = broadcast::channel::<String>(MAX_CONNECTIONS);

  let conn_id = new_ulid_string();
  let watchlist = {
    let guard = state.temple.watch_manager.guard();
    state.temple.watch_manager.create_watchlist(conn_id.clone(), &guard)
  };
  let mut rx = state.temple.subscribe_events();
  let (mut sender, mut receiver) = socket.split();

  let state_clone = state.clone();
  let conn_id_clone = conn_id.clone();

  let watchlist_recv = watchlist.clone();
  let mut recv_task = tokio::spawn(async move {
    while let Some(Ok(msg)) = receiver.next().await {
      if let Message::Text(text) = msg {
        match parse_ws_command(&text) {
          Ok(ws_msg) => {
            if let Some(key) = extract_watch_command_key(&ws_msg) {
              watchlist_recv.watch(key);
              tracing::info!("Connection {} is now watching key: {}", conn_id_clone, key);
            } else if let Some(cmd) = build_redis_envelope_from_ws(&ws_msg) {
              let temple = &state_clone.temple;
              let _ = temple.send_redis(cmd).await;
            }
          }
          Err(e) => tracing::warn!("Invalid WebSocket message: {}", e),
        }
      } else if process_message(msg).is_break() {
        break;
      }
    }

    // On disconnect ! IMPORTANT
    let guard = state_clone.temple.watch_manager.guard();
    state_clone.temple.watch_manager.remove_watchlist(&conn_id_clone, &guard);
  });

  let watchlist_send = watchlist.clone();

  let mut send_task = tokio::spawn(async move {
    loop {
      tokio::select! {
        msg = rx.recv() => {
          match msg {
            Ok(envelope) => {
              let maybe_update = match envelope.event.object {
                Some(Object::Command(cmd)) => {
                  redis_key_update_from_command(&cmd).and_then(|upd| {
                    if watchlist_send.is_watching(&upd.key) {
                      Some(redis_ws_update_msg(upd))
                    } else {
                      None
                    }
                  })
                }
                Some(Object::Update(update)) => {
                    if watchlist_send.is_watching(&update.key) {
                      Some(redis_ws_update_msg(update))
                    } else {
                      None
                    }
                  }
                _ => None
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
              tracing::warn!("Failed to receive Redis event: {:?}", err);
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
        _ = (&mut send_task) => {
            recv_task.abort();
        },
        _ = (&mut recv_task) => {
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

pub fn ws_router(state: Arc<GlobalState>) -> Router {
  Router::new().route("/ws", get(websocket_handler)).with_state(state)
}
