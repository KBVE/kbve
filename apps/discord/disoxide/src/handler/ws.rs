use axum::{
  extract::ws::{ WebSocket, WebSocketUpgrade, Message, CloseFrame },
  extract::State,
  response::IntoResponse,
  routing::get,
  Router,
};
use futures_util::{ StreamExt, SinkExt };
use std::{ sync::Arc, ops::ControlFlow };
use tokio::sync::broadcast;
use crate::entity::state::GlobalState;

const MAX_CONNECTIONS: usize = 1000;

async fn websocket_handler(
  ws: WebSocketUpgrade,
  State(state): State<Arc<GlobalState>>
) -> impl IntoResponse {
  ws.on_upgrade(move |socket| handle_websocket(socket, state))
}

async fn handle_websocket(socket: WebSocket, state: Arc<GlobalState>) {
  // let (tx, _rx) = broadcast::channel::<String>(MAX_CONNECTIONS);
  let mut rx = state.temple.subscribe_events();
  let (mut sender, mut receiver) = socket.split();
  let mut recv_task = tokio::spawn(async move {
    while let Some(Ok(msg)) = receiver.next().await {
      if process_message(msg).is_break() {
        break;
      }
    }
  });

  let mut send_task = tokio::spawn(async move {
    loop {
        tokio::select! {
            msg = rx.recv() => {
                match msg {
                    Ok(event) => {
                        if let Ok(json) = serde_json::to_string(&event) {
                            if sender.send(Message::Text(json.into())).await.is_err() {
                                break;
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
