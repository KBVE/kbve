#![allow(dead_code)]

mod auth;
mod config;
mod db;
mod error;
pub mod rest;
mod session_store;
mod state;

use std::time::Duration;
use tower_http::cors::CorsLayer;
use tower_http::limit::RequestBodyLimitLayer;
use tower_http::timeout::TimeoutLayer;
use tower_sessions::{Expiry, SessionManagerLayer};
use tracing::info;

pub mod proto {
    pub mod jobboard {
        include!("proto/jobboard.rs");
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    rustls::crypto::ring::default_provider()
        .install_default()
        .expect("failed to install rustls crypto provider");

    dotenvy::dotenv().ok();

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "jobboard=info,tower_http=info".into()),
        )
        .json()
        .with_target(true)
        .init();

    let cfg = config::JobBoardConfig::from_env()?;

    let pool = db::connect().await?;
    info!("PgCluster connected");

    let app_state = state::AppState::new(pool.clone());

    let session_store = session_store::PgSessionStore::new(pool);
    let session_layer = SessionManagerLayer::new(session_store)
        .with_name("jobboard.sid")
        .with_secure(cfg.secure_cookies)
        .with_expiry(Expiry::OnInactivity(time::Duration::days(7)));

    let app = rest::router(app_state)
        .layer(session_layer)
        .layer(TimeoutLayer::with_status_code(
            axum::http::StatusCode::GATEWAY_TIMEOUT,
            Duration::from_secs(30),
        ))
        .layer(RequestBodyLimitLayer::new(2 * 1024 * 1024))
        .layer(CorsLayer::permissive());

    let addr = cfg.http_addr;
    let listener = tokio::net::TcpListener::bind(addr).await?;
    info!("jobboard listening on {addr}");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    info!("jobboard shutdown complete");
    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install SIGTERM handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => info!("received Ctrl+C, shutting down"),
        _ = terminate => info!("received SIGTERM, shutting down"),
    }
}
