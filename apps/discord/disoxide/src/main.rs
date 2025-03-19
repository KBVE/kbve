mod proto;
use crate::proto::{ store::{ StoreValue, KeyValueResponse }, disoxide::{ UserData, ChatMessage } };
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
};

use papaya::HashMap;
use tracing::info;
use std::{ sync::Arc, borrow::Cow };
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

  let shared_state = SharedState::default();
  let app = Router::new()
    .route("/user", get(get_user))
    .route("/message", get(get_message))
    .route("/store/{key}", get(get_key).post(set_key))
    .route("/keys", get(list_keys))
    .route("/admin/clear", delete(clear_store))
    .route("/metrics", get(metrics))
    .layer(
      ServiceBuilder::new()
        .layer(HandleErrorLayer::new(handle_error))
        .timeout(Duration::from_secs(10))
        .layer(TraceLayer::new_for_http())
        .layer(CompressionLayer::new())
    )
    .layer(axum::middleware::from_fn_with_state(shared_state.clone(), track_execution_time))
    .with_state(Arc::clone(&shared_state));

  let listener = TcpListener::bind("0.0.0.0:3000").await.unwrap();
  tracing::info!("Listening on {}", listener.local_addr().unwrap());
  axum::serve(listener, app).await.unwrap();
}

// ===================== Shared State ===================== //

type SharedState = Arc<RwLock<AppState>>;

#[derive(Default)]
struct AppState {
  store: HashMap<String, (Bytes, Instant)>,
  get_key_time: Arc<RwLock<Vec<u64>>>,
  set_key_time: Arc<RwLock<Vec<u64>>>,
}

const TTL_DURATION: Duration = Duration::from_secs(60);

#[derive(serde::Serialize)]
struct CowKeyValueResponse<'a> {
  value: Cow<'a, str>,
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
  let db = state.write().await;
  let store = db.store.pin();
  let expires_at = Instant::now() + TTL_DURATION;
  store.insert(key, (Bytes::from(payload.value), expires_at));

  (StatusCode::OK, "Key stored successfully with TTL")
}

async fn get_key(
  Path(key): Path<String>,
  State(state): State<SharedState>
) -> impl IntoResponse + Send {
  let db = state.read().await;
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
  let db = state.read().await;
  let store = db.store.pin();
  Json(store.keys().cloned().collect())
}

// Admin: Clear the Store
async fn clear_store(State(state): State<SharedState>) {
  let db = state.write().await;
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

// ==================== Metrics ========= //
async fn metrics(State(state): State<SharedState>) -> impl IntoResponse {
  let db = state.read().await;
  let get_times = db.get_key_time.read().await.clone();
  let set_times = db.set_key_time.read().await.clone();

  let avg_get = if !get_times.is_empty() {
    (get_times.iter().sum::<u64>() as f64) / (get_times.len() as f64)
  } else {
    0.0
  };

  let avg_set = if !set_times.is_empty() {
    (set_times.iter().sum::<u64>() as f64) / (set_times.len() as f64)
  } else {
    0.0
  };

  let response = format!(
    "# HELP get_key_duration_microseconds Time taken to execute get_key (µs)\n\
       # TYPE get_key_duration_microseconds gauge\n\
       get_key_duration_microseconds {}\n\
       # HELP set_key_duration_microseconds Time taken to execute set_key (µs)\n\
       # TYPE set_key_duration_microseconds gauge\n\
       set_key_duration_microseconds {}\n",
    avg_get,
    avg_set
  );

  Response::builder()
    .status(StatusCode::OK)
    .header("Content-Type", "text/plain")
    .body(Body::from(response))
    .unwrap()
}

async fn track_execution_time(
  State(state): State<SharedState>,
  req: Request<Body>,
  next: Next
) -> Response {
  let start = Instant::now();
  let path = req.uri().path().to_string();
  let method = req.method().clone();

  let response = next.run(req).await;

  let elapsed = start.elapsed().as_micros() as u64;

  if path.starts_with("/store/") {
    if method == Method::GET {
      state.read().await.get_key_time.write().await.push(elapsed);
      info!("GET key took {}µs", elapsed);
    } else if method == Method::POST {
      state.read().await.set_key_time.write().await.push(elapsed);
      info!("SET key took {}µs", elapsed);
    }
  } else {
    info!("Request to {} took {}µs", path, elapsed);
  }

  response
}
