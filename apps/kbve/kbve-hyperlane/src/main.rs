use axum::response::Html;
use axum::{
  error_handling::HandleErrorLayer,
  response::IntoResponse,
  routing::{ delete, get, post },
  Json,
  Router,
};
use axum::http::StatusCode;
use tower_http::cors::{CorsLayer, Any};
use std::sync::Arc;
use tokio::time::Duration;
use tokio::net::TcpListener;
use tower::ServiceBuilder;
use tower_http::{
  compression::CompressionLayer,
  limit::RequestBodyLimitLayer,
  trace::TraceLayer,
  services::ServeDir,
};
use tracing_subscriber::{ layer::SubscriberExt, util::SubscriberInitExt };

//use jedi::sidecar::RedisConfig;

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
        .unwrap_or_else(|_|
          format!("{}=debug,tower_http=debug,jedi=debug", env!("CARGO_CRATE_NAME")).into()
        )
    )
    .with(tracing_subscriber::fmt::layer())
    .init();


}