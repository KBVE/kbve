mod astro;
mod discord;
mod health;
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
    // Load .env before anything reads env vars
    dotenvy::dotenv().ok();

    // Tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
                format!("{}=info,tower_http=debug", env!("CARGO_CRATE_NAME")).into()
            }),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    info!("Discordsh v{}", env!("CARGO_PKG_VERSION"));

    // Shared health monitor
    let health_monitor = Arc::new(health::HealthMonitor::new());
    health_monitor.spawn_background_task();

    // Transports
    let http = tokio::spawn(transport::https::serve(Arc::clone(&health_monitor)));
    let bot = tokio::spawn(discord::bot::start(Arc::clone(&health_monitor)));

    tokio::select! {
        res = http => {
            if let Ok(Err(e)) = res {
                tracing::error!(error = %e, "HTTP server exited with error");
            }
        },
        res = bot => {
            if let Ok(Err(e)) = res {
                tracing::error!(error = %e, "Discord bot exited with error");
            }
        },
        _ = tokio::signal::ctrl_c() => {
            info!("shutdown signal received");
        }
    }

    Ok(())
}
