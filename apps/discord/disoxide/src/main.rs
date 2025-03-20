mod proto;
mod entity;
mod handler;
use crate::proto::{ store::StoreValue, disoxide::{ UserData, ChatMessage } };
use crate::entity::state::{ GlobalState, SharedState };
use crate::entity::helper::{ TTL_DURATION, CowKeyValueResponse };

use axum::{
  body::{ Body, Bytes },
  error_handling::HandleErrorLayer,
  extract::{ DefaultBodyLimit, Path, State },
  http::{ Method, Request, StatusCode },
  middleware::Next,
  response::{ IntoResponse, Response },
  routing::{ delete, get, post },
  Json,
  Router,
  Extension,
};


use std::{ sync::Arc, borrow::Cow };
use std::sync::atomic::{ AtomicU64, Ordering };

use tokio::sync::RwLock;
use tokio::time::{ Instant, Duration };
use tokio::net::TcpListener;
use tower::{ BoxError, ServiceBuilder };
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
    .route("/store/{key}", get(get_key).post(set_key))
    .route("/keys", get(list_keys))
    .route("/admin/clear", delete(clear_store))
    .route("/metrics", get(crate::handler::metrics::metrics))
    .layer(
      ServiceBuilder::new()
        .layer(HandleErrorLayer::new(handle_error))
        .timeout(Duration::from_secs(10))
        .layer(TraceLayer::new_for_http())
        .layer(CompressionLayer::new())
    )
    .layer(axum::middleware::from_fn_with_state(shared_state.clone(), crate::handler::metrics::track_execution_time))
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

async fn set_key(
  Path(key): Path<String>,
  State(state): State<SharedState>,
  Json(payload): Json<StoreValue>
) -> impl IntoResponse {
  let state_clone = Arc::clone(&state.store);
  let key_clone = key.clone();
  let value_bytes = Bytes::from(payload.value);
  let expires_at = Instant::now() + TTL_DURATION;

  tokio::spawn(async move {
    let db = state_clone.write().await;
    let store = db.store.pin_owned();
    store.insert(key_clone, (value_bytes, expires_at));
  });

  (StatusCode::ACCEPTED, "Key storage in progress")
}

async fn get_key(
  Path(key): Path<String>,
  State(state): State<SharedState>
) -> impl IntoResponse + Send {
  let db = state.store.read().await;
  let store = db.store.pin();

  match store.get(&key) {
    Some((value, _)) => {
      let cow_value = std::str
        ::from_utf8(value)
        .map(Cow::Borrowed)
        .unwrap_or_else(|_| Cow::Owned(String::from_utf8_lossy(value).into_owned()));

      Json(CowKeyValueResponse { value: cow_value }).into_response()
    }
    None => StatusCode::NOT_FOUND.into_response(),
  }
}

// List All Keys
async fn list_keys(State(state): State<SharedState>) -> Json<Vec<String>> {
  let db = state.store.read().await; 
  let store = db.store.pin(); 
  Json(store.keys().cloned().collect()) 
}

async fn clear_store(State(state): State<SharedState>) -> impl IntoResponse {
  let db = state.store.write().await; 
  let store = db.store.pin(); 
  store.clear();

  (StatusCode::OK, "Store cleared")
}
// ===================== Error Handling ===================== //

async fn handle_error(error: BoxError) -> impl IntoResponse {
  if error.is::<tower::timeout::error::Elapsed>() {
    return (StatusCode::REQUEST_TIMEOUT, "Request timed out".to_string());
  }
  (StatusCode::INTERNAL_SERVER_ERROR, format!("Internal error: {error}"))
}


