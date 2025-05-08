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

// use jedi::wrapper::{
//   add_watch_key, build_redis_envelope_from_ws, extract_watch_command_key, parse_incoming_ws_data, parse_ws_command, redis_key_update_from_command, redis_ws_error_msg, redis_ws_update_msg, send_ws_error, Either, RedisWsRequestContext
// };

// use jedi::proto::redis::{
//   RedisKeyUpdate,
//   RedisWsMessage,
//   RedisEventObject,
//   redis_event_object::Object,
// };

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
  let (ws_tx, mut ws_rx): (Sender<Message>, _) = channel(64);

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

  let mut recv_task = tokio::spawn(async move {
    while let Some(Ok(msg)) = socket_rx.next().await {
      let incoming = match &msg {
        Message::Text(text) => {
          jedi::wrapper::parse_incoming_ws_data(
            jedi::wrapper::IncomingWsFormat::JsonText(text.to_string()),
            Some(conn_id_bytes),
          ).map(Either::Right)
        }
    
        Message::Binary(data) => {
          jedi::wrapper::parse_incoming_ws_binary(data, Some(conn_id_bytes))
        }
    
        Message::Ping(data) => {
          let _ = ws_tx.send(Message::Pong(data.clone())).await;
          continue;
        }
    
        other => {
          if process_message(other.clone()).is_break() {
            break;
          }
          continue;
        }
      };
    
      match incoming {
        Ok(Either::Right(mut ctx)) => {
          match &ctx.envelope.command {
            jedi::wrapper::RedisCommandType::Watch { key } => {
              let key_arc = Arc::clone(key);
              match state_recv.temple.watch_manager.watch(conn_id_bytes, key_arc.clone()) {
                Ok(_) => {
                  tracing::info!("Connection {} is now watching key: {}", conn_id.as_str(), key_arc);
                  let _ = ws_tx.send(Message::Text("{\"status\":\"OK\"}".into())).await;
                }
                Err(err) => {
                  tracing::warn!("Watch error for conn {} on key {}: {}", conn_id.as_str(), key_arc, err);
                  let _ = ws_tx.send(Message::Text(redis_ws_error_msg(&err).into())).await;
                }
              }
            }
    
            jedi::wrapper::RedisCommandType::Unwatch { key } => {
              let _ = state_recv.temple.watch_manager.unwatch(&conn_id_bytes, Arc::clone(key));
              tracing::info!("Connection {} has stopped watching key: {}", conn_id.as_str(), key);
            }
    
            _ => {
              match ctx.envelope.full_pipeline(&state_recv.temple.redis_pool).await {
                Ok(resp) => {
                  let send_result = match ctx.raw {
                    Some(jedi::wrapper::IncomingWsFormat::Binary(_)) => {
                      match flexbuffers::to_vec(&resp) {
                        Ok(buf) => ws_tx.send(Message::Binary(buf.into())).await,
                        Err(e) => ws_tx.send(Message::Text(redis_ws_error_msg("serialization failed").into())).await,
                      }
                    }
                    _ => {
                      match serde_json::to_string(&resp) {
                        Ok(json) => ws_tx.send(Message::Text(json.into())).await,
                        Err(e) => ws_tx.send(Message::Text(redis_ws_error_msg("serialization failed").into())).await,
                      }
                    }
                  };
                  if send_result.is_err() {
                    break;
                  }
                }
                Err(e) => {
                  tracing::warn!("Pipeline error: {}", e);
                  let _ = ws_tx.send(Message::Text(redis_ws_error_msg(e.to_string()).into())).await;
                }
              }
            }
          }
        }
    
        Ok(Either::Left(stream_ctx)) => {
          match stream_ctx.process(&state_recv.temple.redis_pool).await {
            Ok(redis_stream) => {
              let send_result = match msg {
                Message::Binary(_) => {
                  match flexbuffers::to_vec(&redis_stream) {
                    Ok(buf) => ws_tx.send(Message::Binary(buf.into())).await,
                    Err(e) => ws_tx.send(Message::Text(redis_ws_error_msg("serialization failed").into())).await,
                  }
                }
                _ => {
                  match serde_json::to_string(&redis_stream) {
                    Ok(json) => ws_tx.send(Message::Text(json.into())).await,
                    Err(e) => ws_tx.send(Message::Text(redis_ws_error_msg("serialization failed").into())).await,
                  }
                }
              };
              if send_result.is_err() {
                break;
              }
            }
    
            Err(e) => {
              tracing::warn!("Redis stream processing error: {}", e);
              let _ = ws_tx.send(Message::Text(redis_ws_error_msg(e.to_string()).into())).await;
            }
          }
        }
    
        Err(e) => {
          tracing::warn!("Failed to parse WebSocket message: {}", e);
          let _ = ws_tx.send(Message::Text(redis_ws_error_msg("Invalid message format").into())).await;
        }
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
