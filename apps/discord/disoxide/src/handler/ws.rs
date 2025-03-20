use axum::{
    extract::ws::{WebSocket, WebSocketUpgrade, Message, CloseFrame},
    extract::State,
    response::IntoResponse,
    routing::get,
    Router,
};
use futures_util::{StreamExt, SinkExt};
use std::{sync::Arc, ops::ControlFlow};
use tokio::sync::broadcast;
use crate::entity::state::GlobalState;

const MAX_CONNECTIONS: usize = 1000;

async fn websocket_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<GlobalState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_websocket(socket, state))
}

async fn handle_websocket(socket: WebSocket, state: Arc<GlobalState>) {
    let (tx, _rx) = broadcast::channel::<String>(MAX_CONNECTIONS);

    let (mut sender, mut receiver) = socket.split();

    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            if process_message(msg).is_break() {
                break;
            }
        }
    });

    let mut send_task = tokio::spawn(async move {
        let mut rx = tx.subscribe();
        loop {
            tokio::select! {
                msg = rx.recv() => {
                    if let Ok(text) = msg {
                        if sender.send(Message::Text(text.into())).await.is_err() {
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

    println!("WebSocket connection closed.");
}

fn process_message(msg: Message) -> ControlFlow<(), ()> {
    match msg {
        Message::Text(text) => {
            println!("Received: {}", text);
        }
        Message::Binary(data) => {
            println!("Received binary data: {} bytes", data.len());
        }
        Message::Ping(data) => {
            println!("Received Ping: {:?}", data);
        }
        Message::Pong(data) => {
            println!("Received Pong: {:?}", data);
        }
        Message::Close(Some(CloseFrame { code, reason })) => {
            println!("Connection closed. Code: {}, Reason: {}", code, reason);
            return ControlFlow::Break(());
        }
        Message::Close(None) => {
            println!("Connection closed.");
            return ControlFlow::Break(());
        }
    }
    ControlFlow::Continue(())
}

pub fn ws_router(state: Arc<GlobalState>) -> Router {
    Router::new()
        .route("/ws", get(websocket_handler))
        .with_state(state)
}
