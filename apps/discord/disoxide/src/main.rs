mod proto;
mod entity;
mod handler;
use crate::proto::disoxide::{ UserData, ChatMessage };
use crate::entity::state::GlobalState;

use axum::{
  error_handling::HandleErrorLayer,
  response::IntoResponse,
  routing::{ delete, get, post },
  Json,
  Router,
};

use std::sync::Arc;

use tokio::time::Duration;
use tokio::net::TcpListener;
use tower::ServiceBuilder;
use tower_http::{ compression::CompressionLayer, limit::RequestBodyLimitLayer, trace::TraceLayer };
use tracing_subscriber::{ layer::SubscriberExt, util::SubscriberInitExt };

#[cfg(feature = "jemalloc")]
mod allocator {
  #[cfg(not(target_env = "msvc"))]
  use tikv_jemallocator::Jemalloc;
  #[cfg(not(target_env = "msvc"))]
  #[global_allocator]
  static GLOBAL: Jemalloc = Jemalloc;
}

#[tokio::main(flavor = "multi_thread", worker_threads = 4)]
async fn main() {
  tracing_subscriber
    ::registry()
    .with(
      tracing_subscriber::EnvFilter
        ::try_from_default_env()
        .unwrap_or_else(|_| format!("{}=debug,tower_http=debug", env!("CARGO_CRATE_NAME")).into())
    )
    .with(tracing_subscriber::fmt::layer())
    .init();

  let shared_state = Arc::new(GlobalState::new());

  let app = Router::new()
    .route("/user", get(get_user))
    .route("/message", get(get_message))
    .route("/store/{key}", get(handler::store::get_key).post(handler::store::set_key))
    .route("/keys", get(handler::store::list_keys))
    .route("/admin/clear", delete(handler::store::clear_store))
    .route("/metrics", get(crate::handler::metrics::metrics))
    .layer(
      ServiceBuilder::new()
        .layer(HandleErrorLayer::new(crate::handler::error::handle_error))
        .timeout(Duration::from_secs(10))
        .layer(TraceLayer::new_for_http())
        .layer(CompressionLayer::new())
    )
    .layer(
      axum::middleware::from_fn_with_state(
        shared_state.clone(),
        crate::handler::metrics::track_execution_time
      )
    )
    .with_state(shared_state.clone());

  let listener = TcpListener::bind("0.0.0.0:3000").await.unwrap();
  tracing::info!("Listening on {}", listener.local_addr().unwrap());
  axum::serve(listener, app).await.unwrap();
}

// ===================== Handlers - TEST CASES ===================== //

// Get User Data
async fn get_user() -> impl IntoResponse {
  let user = UserData {
    id: 1,
    username: "kbve".to_string(),
    active: true,
  };
  Json(user)
}

// Get Chat Message
async fn get_message() -> impl IntoResponse {
  let message = ChatMessage {
    id: 1,
    sender: "kbve".to_string(),
    content: "Hello from Axum!".to_string(),
    timestamp: 1700000000,
  };
  Json(message)
}
