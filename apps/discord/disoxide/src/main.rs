mod proto;
mod entity;
mod handler;
use crate::proto::disoxide::{ UserData, ChatMessage };
use crate::entity::state::AppGlobalState;
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

use jedi::sidecar::RedisConfig;

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

  //let shared_state = Arc::new(GlobalState::new());
  //   let shared_state = Arc::new(GlobalState::new("redis://:redispassword@redis:6379").await);

  async fn custom_404() -> impl IntoResponse {
    const NOT_FOUND_HTML: &str = include_str!("../dist/404.html");
    (StatusCode::NOT_FOUND, Html(NOT_FOUND_HTML))
  }

  tracing::info!("[main] Starting Application...");
  let redis_cfg = RedisConfig::from_env();
  let shared_state = Arc::new(AppGlobalState::new(&redis_cfg.url).await);

  let app = Router::new()
    .merge(handler::assets::static_router())
    .merge(handler::ws::ws_router())
    .merge(handler::http::http_router())
//  .fallback_service(ServeDir::new("dist").not_found_service(axum::routing::get(custom_404)))
    .layer(
      ServiceBuilder::new()
        .layer(HandleErrorLayer::new(crate::handler::error::handle_error))
        .timeout(Duration::from_secs(10))
        .layer(TraceLayer::new_for_http())
        .layer(CompressionLayer::new())
        .layer(
          CorsLayer::new()
            .allow_origin(Any)
            .allow_methods(Any)
            .allow_headers(Any)
        )
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
