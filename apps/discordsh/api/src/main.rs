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

    // Initialize PgCluster if env configured
    let pg_cluster = match jedi::state::pg::PgCluster::from_env().await {
        Ok(cluster) => {
            info!("PgCluster initialized successfully");
            Some(cluster)
        }
        Err(e) => {
            tracing::warn!(error = %e, "PgCluster init failed — falling back to edge functions");
            None
        }
    };

    let mut app_state = state::AppState::new(health_monitor);
    if let Some(cluster) = pg_cluster {
        app_state = app_state.with_pg_cluster(cluster);
    }
    let app_state = Arc::new(app_state);

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
