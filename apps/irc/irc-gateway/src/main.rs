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

    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| {
                    format!("{}=info,tower_http=debug", env!("CARGO_CRATE_NAME")).into()
                }),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    info!("IRC Gateway v{}", env!("CARGO_PKG_VERSION"));

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
