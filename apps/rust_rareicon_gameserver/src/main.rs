use axum::{
  extract::ws::{ Message, WebSocket, WebSocketUpgrade },
  response::IntoResponse,
  routing::any,
  http::HeaderValue,
  Router,
};

use axum_extra::TypedHeader;
use std::sync::Arc;
use std::borrow::Cow;
use std::ops::ControlFlow;
use reqwest::Client;

use tokio::sync::broadcast;
use futures::{ sink::SinkExt, stream::StreamExt };
use std::{ net::SocketAddr, path::PathBuf };
use tokio::net::{ UdpSocket, TcpListener };
use tower_http::{
  services::ServeDir,
  trace::{ DefaultMakeSpan, TraceLayer },
  cors::{ Any, CorsLayer },
};

use tracing_subscriber::{ layer::SubscriberExt, util::SubscriberInitExt };

use axum::extract::connect_info::ConnectInfo;
use axum::extract::ws::CloseFrame;

use once_cell::sync::Lazy;
use std::collections::HashMap;

#[cfg(feature = "jemalloc")]
mod allocator {
  #[cfg(not(target_env = "msvc"))]
  use tikv_jemallocator::Jemalloc;
  #[cfg(not(target_env = "msvc"))]
  #[global_allocator]
  static GLOBAL: Jemalloc = Jemalloc;
}

static ENV_VARS: Lazy<HashMap<&'static str, String>> = Lazy::new(|| {
  let mut map = HashMap::new();
  map.insert(
    "DISCORD_CLIENT_ID",
    std::env::var("DISCORD_CLIENT_ID").expect("DISCORD_CLIENT_ID not set")
  );
  map.insert(
    "DISCORD_CLIENT_SECRET",
    std::env::var("DISCORD_CLIENT_SECRET").expect("DISCORD_CLIENT_SECRET not set")
  );
  map.insert("DISCORD_TOKEN", std::env::var("DISCORD_TOKEN").expect("DISCORD_TOKEN not set"));
  map
});

pub fn get_env_var(key: &str) -> Option<&String> {
  ENV_VARS.get(key)
}

fn validate_env_vars() {
  for &key in &["DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET", "DISCORD_TOKEN"] {
    if ENV_VARS.get(key).is_none() {
      panic!("Environment variable {} is missing", key);
    }
  }
}

fn log_env_vars() {
  // Retrieve environment variables securely
  let client_id = ENV_VARS.get("DISCORD_CLIENT_ID").expect("DISCORD_CLIENT_ID not set");
  let client_secret = ENV_VARS.get("DISCORD_CLIENT_SECRET").expect("DISCORD_CLIENT_SECRET not set");
  let discord_token = ENV_VARS.get("DISCORD_TOKEN").expect("DISCORD_TOKEN not set");

  // Mask the client secret for secure logging
  let masked_secret = if client_secret.len() > 5 {
    format!("{}{}", &client_secret[..5], "****") // First 5 characters + mask
  } else {
    "****".to_string() // Fully masked if too short
  };

  let masked_token = if discord_token.len() > 5 {
    format!("{}{}", &discord_token[..5], "****") // First 5 characters + mask
  } else {
    "****".to_string() // Fully masked if too short
  };

  // Log the environment variables securely
  tracing::info!("Client ID: {}", client_id);
  tracing::info!("Client Secret: {}", masked_secret);
  tracing::info!("Discord Token: {}", masked_token);
}

#[tokio::main]
async fn main() {
  tracing_subscriber
    ::registry()
    .with(
      tracing_subscriber::EnvFilter
        ::try_from_default_env()
        .unwrap_or_else(|_| {
          format!("{}=debug,tower_http=debug", env!("CARGO_CRATE_NAME")).into()
        })
    )
    .with(tracing_subscriber::fmt::layer())
    .init();

  let cors = CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any);

  let app = Router::new()
    .fallback_service(ServeDir::new("build").append_index_html_on_directories(true))
    .route("/ws", any(websocket_handler))
    .route("/ws/", any(websocket_handler))
    .layer(
      TraceLayer::new_for_http().make_span_with(DefaultMakeSpan::default().include_headers(true))
    )
    .layer(cors);

  let listener = TcpListener::bind("0.0.0.0:3000").await.unwrap();
  tracing::debug!("listening on {}", listener.local_addr().unwrap());
  validate_env_vars();
  log_env_vars();
  //  Removing Debug After wired confirmation, so no leaks inside of the logs.
  tokio::spawn(run_udp_server());
  axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>()).await.unwrap();
}

// WebSocket handler
async fn websocket_handler(
  ws: WebSocketUpgrade,
  user_agent: Option<TypedHeader<headers::UserAgent>>,
  ConnectInfo(addr): ConnectInfo<SocketAddr>
) -> impl IntoResponse {
  let user_agent = if let Some(TypedHeader(user_agent)) = user_agent {
    user_agent.to_string()
  } else {
    String::from("Unknown browser")
  };
  println!("`{user_agent}` at {addr} connected.");

  ws.on_upgrade(move |socket| handle_socket(socket, addr))
}

// Handle WebSocket connections
async fn handle_socket(mut socket: WebSocket, who: SocketAddr) {
  println!("WebSocket connection established with {who}");

  while let Some(Ok(msg)) = socket.next().await {
    // Log the message first
    if logger_helper_function(&msg, who).is_break() {
      break; // Exit if the logger indicates the connection should close
    }

    // Then echo the message back to the client
    if echo_helper_function(&msg, who, &mut socket).await.is_break() {
      break; // Exit if the echo function indicates the connection should close
    }
  }

  println!("WebSocket connection with {who} closed");
}

// UDP server
async fn run_udp_server() {
  let socket = UdpSocket::bind("0.0.0.0:8081").await.unwrap();
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

fn logger_helper_function(msg: &Message, who: SocketAddr) -> ControlFlow<(), ()> {
  match msg {
    Message::Text(text) => {
      println!(">>> {who} sent text: {text}");
    }
    Message::Binary(data) => {
      println!(">>> {who} sent binary data: {:?} ({} bytes)", data, data.len());
    }
    Message::Close(Some(close_frame)) => {
      println!(
        ">>> {who} sent close frame with code {} and reason: {}",
        close_frame.code,
        close_frame.reason
      );
      return ControlFlow::Break(()); // Indicate that the connection should close
    }
    Message::Close(None) => {
      println!(">>> {who} sent close frame with no additional information");
      return ControlFlow::Break(());
    }
    Message::Ping(payload) => {
      println!(">>> {who} sent ping with payload: {:?}", payload);
    }
    Message::Pong(payload) => {
      println!(">>> {who} sent pong with payload: {:?}", payload);
    }
  }
  ControlFlow::Continue(())
}

async fn echo_helper_function(
  msg: &Message,
  who: SocketAddr,
  socket: &mut WebSocket
) -> ControlFlow<(), ()> {
  match msg {
    Message::Text(text) => {
      if let Err(e) = socket.send(Message::Text(text.clone())).await {
        println!("Failed to echo text to {who}: {e}");
        return ControlFlow::Break(()); // Indicate that the connection should close
      }
    }
    Message::Binary(data) => {
      if let Err(e) = socket.send(Message::Binary(data.clone())).await {
        println!("Failed to echo binary data to {who}: {e}");
        return ControlFlow::Break(()); // Indicate that the connection should close
      }
    }
    _ => {
      // Do nothing for non-echoable message types
    }
  }
  ControlFlow::Continue(())
}

//  [Reqwest Discord] -> TODO: Move to the Jedi Cargo Crate once it works.
//  Structs

#[derive(Clone)]
struct AppState {
    client: Arc<Client>,
}


#[derive(Deserialize)]
struct TokenRequest {
    code: String,
}

#[derive(Serialize)]
struct TokenResponse {
    access_token: String,
}

//  Shared Arc

fn create_shared_clienmt() -> Arc<Client> {
  Arc::new(
    Client::builder()
      .use_rustls_tls()
      .build()
      .expect("Failed to build HTTP client"),
  )
}