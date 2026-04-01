mod api;
mod astro;
mod health;
mod state;
mod transport;

use std::sync::Arc;
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[cfg(feature = "jemalloc")]
mod allocator {
    #[cfg(not(target_env = "msvc"))]
    use tikv_jemallocator::Jemalloc;
    #[cfg(not(target_env = "msvc"))]
    #[global_allocator]
    static GLOBAL: Jemalloc = Jemalloc;
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
                format!("{}=info,tower_http=debug", env!("CARGO_CRATE_NAME")).into()
            }),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    info!("Discordsh v{}", env!("CARGO_PKG_VERSION"));

    let health_monitor = Arc::new(health::HealthMonitor::new());
    health_monitor.spawn_background_task();

    let app_state = Arc::new(state::AppState::new(health_monitor));

    // HTTP server runs for the lifetime of the process
    tokio::select! {
        res = transport::https::serve(Arc::clone(&app_state)) => {
            if let Err(e) = res {
                tracing::error!(error = %e, "HTTP server exited with error");
            }
        },
        _ = tokio::signal::ctrl_c() => {
            info!("shutdown signal received");
        }
    }

    Ok(())
}
