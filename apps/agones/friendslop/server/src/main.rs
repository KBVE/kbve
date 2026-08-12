mod agones;
mod driver;

use std::net::SocketAddr;

use q::net::ws::{WsHost, router};
use tokio::net::TcpListener;
use tracing_subscriber::EnvFilter;

fn env_parse<T: std::str::FromStr>(key: &str, default: T) -> T {
    std::env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,friendslop_server=debug,q=debug".into()),
        )
        .init();

    let addr: SocketAddr = std::env::var("FS_SERVER_ADDR")
        .unwrap_or_else(|_| "0.0.0.0:7980".into())
        .parse()?;

    let cfg = driver::DriverConfig {
        seed: env_parse("FS_SERVER_SEED", 1337),
        tick_hz: env_parse("FS_TICK_HZ", 60.0),
        terrain_extent: env_parse("FS_TERRAIN_EXTENT", 256.0),
        terrain_resolution: env_parse("FS_TERRAIN_RESOLUTION", 513),
    };

    tracing::info!(
        %addr,
        seed = cfg.seed,
        tick_hz = cfg.tick_hz,
        extent = cfg.terrain_extent,
        resolution = cfg.terrain_resolution,
        "friendslop-server listening"
    );

    let transport = WsHost::new();
    let mut sim = driver::spawn(transport.clone(), cfg);

    let app = router(transport.clone()).merge(stats_route(transport.clone(), sim.tick_handle()));

    let listener = TcpListener::bind(addr).await?;
    let agones_handle = tokio::spawn(agones::run_health_loop());

    let serve = axum::serve(listener, app).with_graceful_shutdown(shutdown_signal());
    if let Err(e) = serve.await {
        tracing::error!("serve error: {e}");
    }

    sim.stop();
    let _ = tokio::time::timeout(std::time::Duration::from_secs(1), agones::shutdown()).await;
    agones_handle.abort();
    Ok(())
}

/// A live tick counter is the only cheap proof the sim thread is stepping —
/// `/healthz` answers even if it has wedged.
fn stats_route(
    transport: std::sync::Arc<WsHost>,
    tick: std::sync::Arc<std::sync::atomic::AtomicU64>,
) -> axum::Router {
    axum::Router::new().route(
        "/stats",
        axum::routing::get(move || async move {
            axum::Json(serde_json::json!({
                "tick": tick.load(std::sync::atomic::Ordering::Relaxed),
                "peers": transport.peer_count(),
            }))
        }),
    )
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
        _ = ctrl_c => {},
        _ = terminate => {},
    }
}
