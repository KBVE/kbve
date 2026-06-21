mod auth;
mod config;
mod error;
mod rest;
mod state;
mod telemetry;

use std::sync::Arc;

use axum::http::{HeaderValue, Method, header};
use tokio::sync::mpsc;
use tower_http::cors::{AllowOrigin, CorsLayer};
use tower_http::limit::RequestBodyLimitLayer;
use tower_http::trace::TraceLayer;
use tracing_subscriber::EnvFilter;

use crate::auth::StaffAuth;
use crate::config::Config;
use crate::state::{AppState, spawn_flusher};

fn cors_layer(cfg: &Config) -> CorsLayer {
    let origins: Vec<HeaderValue> = cfg
        .allowed_origins
        .iter()
        .filter_map(|o| o.parse().ok())
        .collect();
    let allow = if origins.is_empty() {
        AllowOrigin::any()
    } else {
        AllowOrigin::list(origins)
    };
    CorsLayer::new()
        .allow_origin(allow)
        .allow_methods([Method::GET, Method::POST])
        .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION])
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _ = dotenvy::dotenv();
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "met=info".into()))
        .json()
        .init();

    let cfg = Config::from_env();
    let ch = jedi::state::sidecar::ClickHouseConfig::from_env();
    tracing::info!(database = %ch.database, url = %ch.url, "clickhouse configured");

    let auth = StaffAuth::from_env();
    tracing::info!(read_api = auth.is_some(), "staff read api");

    let (tx, rx) = mpsc::channel(cfg.channel_capacity);
    let max_body = cfg.max_body_bytes;
    let cors = cors_layer(&cfg);
    let addr = format!("{}:{}", cfg.host, cfg.port);

    let state = Arc::new(AppState::new(cfg, ch, tx, auth));
    spawn_flusher(state.clone(), rx);

    let app = rest::router(state)
        .layer(cors)
        .layer(RequestBodyLimitLayer::new(max_body))
        .layer(TraceLayer::new_for_http());

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!(%addr, "metrics ingest listening");
    axum::serve(listener, app).await?;
    Ok(())
}
