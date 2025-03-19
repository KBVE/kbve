mod proto;
use crate::proto::disoxide::{ UserData, ChatMessage };
use axum::{
  body::Bytes,
  error_handling::HandleErrorLayer,
  extract::{DefaultBodyLimit, Path, State},
  http::StatusCode,
  response::IntoResponse,
  routing::{delete, get, post},
  Router, Json,
};

use papaya::HashMap;
use std::{
  sync::{Arc, RwLock},
  time::Duration,
};
use tokio::net::TcpListener;
use tower::{BoxError, ServiceBuilder};
use tower_http::{
  compression::CompressionLayer, limit::RequestBodyLimitLayer, trace::TraceLayer,
};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

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
    // Initialize Tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| format!("{}=debug,tower_http=debug", env!("CARGO_CRATE_NAME")).into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Shared State
    let shared_state = SharedState::default();

    // Build Axum Router with Middleware
    let app = Router::new()
        // User & Message Endpoints
        .route("/user", get(get_user))
        .route("/message", get(get_message))
        // Key-Value Store Endpoints
        .route("/store/:key", get(get_key).post(set_key))
        .route("/keys", get(list_keys))
        .route("/admin/clear", delete(clear_store))
        // Middleware Layer
        .layer(
            ServiceBuilder::new()
                .layer(HandleErrorLayer::new(handle_error))
                .timeout(Duration::from_secs(10))
                .layer(TraceLayer::new_for_http())
                .layer(CompressionLayer::new()),
        )
        .with_state(Arc::clone(&shared_state));

    // Start the Server
    let listener = TcpListener::bind("0.0.0.0:3000").await.unwrap();
    tracing::info!("Listening on {}", listener.local_addr().unwrap());
    axum::serve(listener, app).await.unwrap();
}

// ===================== Shared State ===================== //

type SharedState = Arc<RwLock<AppState>>;

#[derive(Default)]
struct AppState {
    store: HashMap<String, Bytes>,
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

// Store Key-Value Data (Papaya HashMap)
async fn set_key(Path(key): Path<String>, State(state): State<SharedState>, body: Bytes) {
  state.write().unwrap().store.pin().insert(key, body);
}


// Retrieve Stored Value (Papaya HashMap)
async fn get_key(Path(key): Path<String>, State(state): State<SharedState>) -> Result<Bytes, StatusCode> {
  let db = state.read().unwrap(); 
  let store = db.store.pin();
  store.get(&key).cloned().ok_or(StatusCode::NOT_FOUND)
}

// List All Keys
async fn list_keys(State(state): State<SharedState>) -> Json<Vec<String>> {
  let db = state.read().unwrap(); 
  let store = db.store.pin();
  Json(store.keys().cloned().collect())
}

// Admin: Clear the Store
async fn clear_store(State(state): State<SharedState>) {
  let db = state.write().unwrap();
  let store = db.store.pin();
  store.clear();
}

// ===================== Error Handling ===================== //

async fn handle_error(error: BoxError) -> impl IntoResponse {
    if error.is::<tower::timeout::error::Elapsed>() {
        return (StatusCode::REQUEST_TIMEOUT, "Request timed out".to_string());
    }
    (StatusCode::INTERNAL_SERVER_ERROR, format!("Internal error: {error}"))
}