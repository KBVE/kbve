use axum::{
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    response::IntoResponse,
    routing::any,
    Router,
};

// use axum_extra::TypedHeader;

use futures::{sink::SinkExt, stream::StreamExt};
use std::{net::SocketAddr, path::PathBuf};
use tokio::net::{ UdpSocket, TcpListener};
use tower_http::services::ServeDir;


#[tokio::main]
async fn main() {

    let app = Router::new()
     .fallback_service(ServeDir::new("build").append_index_html_on_directories(true))
     .route("/ws", any(websocket_handler));
    
    let listener = TcpListener::bind("0.0.0.0:3000").await.unwrap();
    println!("Server running on http://0.0.0.0:3000");

    tokio::spawn(run_udp_server());

    axum::serve(listener, app.into_make_service())
        .await
        .unwrap();
}

// WebSocket handler
async fn websocket_handler(ws: WebSocketUpgrade) -> impl IntoResponse {
    ws.on_upgrade(handle_websocket)
}

// Handle WebSocket connections
async fn handle_websocket(mut socket: WebSocket) {
    while let Some(Ok(msg)) = socket.next().await {
        match msg {
            Message::Text(text) => {
                println!("Received text: {}", text);
                socket.send(Message::Text(format!("Echo: {}", text))).await.unwrap();
            }
            Message::Binary(data) => {
                println!("Received binary data: {:?}", data);
                socket.send(Message::Binary(data)).await.unwrap();
            }
            _ => {}
        }
    }
}

// UDP server
async fn run_udp_server() {
    let socket = tokio::net::UdpSocket::bind("0.0.0.0:8081").await.unwrap();
    println!("UDP server running on 0.0.0.0:8081");

    let mut buf = [0; 1024];
    loop {
        if let Ok((size, addr)) = socket.recv_from(&mut buf).await {
            let data = &buf[..size];
            println!("Received UDP data from {}: {:?}", addr, data);

            // Echo response
            socket.send_to(data, addr).await.unwrap();
        }
    }
}