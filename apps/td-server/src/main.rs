//! Nexus Defense game server entry point.
//!
//! Hosts the axum WS router from `q::net::server`. The bevy/rapier2d
//! authoritative sim + Agones lifecycle land in follow-up commits per the
//! phase plan in KBVE/kbve#11294.

use std::net::SocketAddr;

use tokio::net::TcpListener;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| "info,td_server=debug".into()),
        )
        .init();

    let addr: SocketAddr = std::env::var("TD_SERVER_ADDR")
        .unwrap_or_else(|_| "0.0.0.0:7878".into())
        .parse()?;

    let app = q::net::server::router();
    tracing::info!(%addr, "td-server listening");

    let listener = TcpListener::bind(addr).await?;
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };

    #[cfg(unix)]
    let terminate = async {
        if let Ok(mut s) = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        {
            s.recv().await;
        }
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {}
        _ = terminate => {}
    }

    tracing::info!("shutdown signal received");
}
