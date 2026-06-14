mod astro;
mod auth;
mod gateway;
mod transport;

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
    transport::https::init_start_time();

    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
                format!("{}=info,tower_http=debug", env!("CARGO_CRATE_NAME")).into()
            }),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    info!("IRC Gateway v{}", env!("CARGO_PKG_VERSION"));

    if gateway::kv::init().await {
        info!("KvCache initialized — anti-spam counters shared via Valkey when configured");
    }

    gateway::history::spawn_listeners();

    // Drop idle anti-spam buckets every minute so memory stays bounded.
    tokio::spawn(async {
        let mut tick = tokio::time::interval(std::time::Duration::from_secs(60));
        loop {
            tick.tick().await;
            gateway::ratelimit::prune(std::time::Duration::from_secs(300));
        }
    });

    let http = tokio::spawn(transport::https::serve());
    let irc = tokio::spawn(gateway::irc::serve());

    tokio::select! {
        res = http => {
            if let Err(e) = res {
                tracing::error!("HTTP transport failed: {e}");
            }
        },
        res = irc => {
            if let Err(e) = res {
                tracing::error!("IRC transport failed: {e}");
            }
        },
        _ = tokio::signal::ctrl_c() => {
            info!("shutdown signal received");
        }
    }

    Ok(())
}
