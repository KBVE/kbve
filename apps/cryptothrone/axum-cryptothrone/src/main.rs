mod agones;
mod astro;
mod auth;
mod db;
mod discord;
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

    let _ = rustls::crypto::ring::default_provider().install_default();

    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
                format!("{}=info,tower_http=debug", env!("CARGO_CRATE_NAME")).into()
            }),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    info!("CryptoThrone v{}", env!("CARGO_PKG_VERSION"));

    if db::init_pg_cluster().await {
        info!("PgCluster initialized — pooled Postgres available");
    } else {
        info!("PgCluster not configured — DB-backed routes degrade");
    }
    if db::init_kv_cache().await {
        info!("KvCache initialized — L1 LRU + L2 Valkey read-through enabled");
    }

    let http = tokio::spawn(transport::https::serve());

    tokio::select! {
        _ = http => {},
        _ = tokio::signal::ctrl_c() => {
            info!("shutdown signal received");
        }
    }

    Ok(())
}
