use axum::{
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Router,
};
use futures::{sink::SinkExt, stream::StreamExt};
use std::net::SocketAddr;
use tokio::net::UdpSocket;
use tower_http::services::ServeDir;


#[tokio::main]
async fn main() {
    // Serve static files from the "build" directory
    let static_files = Router::new().nest_service("/", ServeDir::new("build"));

    // WebSocket route
    let websocket_route = Router::new().route("/ws", get(websocket_handler));

    // Combine static files and WebSocket routes
    let app = static_files.merge(websocket_route);

    // Start the UDP server
    tokio::spawn(run_udp_server());

    // Run the HTTP and WebSocket server
    let addr = SocketAddr::from(([127, 0, 0, 1], 3000));
    println!("Server running at http://{}", addr);
    axum::Server::bind(&addr)
        .serve(app.into_make_service())
        .await
        .unwrap();
}

// WebSocket handler
async fn websocket_handler(ws: WebSocketUpgrade) -> impl IntoResponse {
    ws.on_upgrade(handle_websocket)
}

// Handle WebSocket connections
async fn handle_websocket(mut socket: WebSocket) {
    println!("WebSocket connection established");

    while let Some(Ok(msg)) = socket.next().await {
        if let Message::Text(text) = msg {
            println!("Received: {}", text);

            // Echo the message back
            if socket.send(Message::Text(format!("Echo: {}", text))).await.is_err() {
                println!("WebSocket connection closed");
                break;
            }
        }
    }
}

// UDP server
async fn run_udp_server() {
    let socket = UdpSocket::bind("127.0.0.1:8081").await.unwrap();
    println!("UDP server running on 127.0.0.1:8081");

    let mut buf = [0; 1024];

    loop {
        match socket.recv_from(&mut buf).await {
            Ok((size, addr)) => {
                println!("Received {} bytes from {}", size, addr);

                // Echo the data back
                if let Err(e) = socket.send_to(&buf[..size], addr).await {
                    println!("Failed to send response: {}", e);
                }
            }
            Err(e) => {
                println!("UDP error: {}", e);
            }
        }
    }
}