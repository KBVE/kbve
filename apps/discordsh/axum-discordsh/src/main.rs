mod astro;
mod discord;
mod health;
mod state;
mod tracker;
mod transport;

use std::sync::Arc;
use std::sync::atomic::Ordering;
use std::time::Duration;
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

    // Optional shard tracker (requires Supabase env vars)
    let tracker = tracker::ShardTracker::from_env();

    // Central application state shared by HTTP server and Discord bot
    let app_state = Arc::new(state::AppState::new(health_monitor, tracker));

    // HTTP server runs for the lifetime of the process
    let http = tokio::spawn(transport::https::serve(Arc::clone(&app_state)));

    // Bot restart loop: restarts when restart_flag is set, exits otherwise
    loop {
        let app = Arc::clone(&app_state);
        let bot = tokio::spawn(discord::bot::start(app));

        tokio::select! {
            res = bot => {
                if let Ok(Err(e)) = &res {
                    tracing::error!(error = %e, "Discord bot exited with error");
                }

                if app_state.restart_flag.load(Ordering::Relaxed) {
                    app_state.restart_flag.store(false, Ordering::Relaxed);
                    info!("Restarting Discord bot in 2s...");
                    tokio::time::sleep(Duration::from_secs(2)).await;
                    continue;
                }
                // Not a restart → exit
                break;
            },
            _ = app_state.shutdown_notify.notified() => {
                info!("Shutdown requested via API");
                break;
            },
            _ = tokio::signal::ctrl_c() => {
                info!("shutdown signal received");
                break;
            }
        }
    }

    // Let HTTP server wind down
    if let Ok(Err(e)) = http.await {
        tracing::error!(error = %e, "HTTP server exited with error");
    }

    Ok(())
}
