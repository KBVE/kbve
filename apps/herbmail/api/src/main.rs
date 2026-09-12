#![allow(dead_code)]

mod astro;
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

    info!("HerbMail v{}", env!("CARGO_PKG_VERSION"));

    match (
        std::env::var("SUPABASE_URL"),
        std::env::var("SUPABASE_ANON_KEY"),
    ) {
        (Ok(url), Ok(anon)) => {
            let jwt_cache = jedi::jwt_cache::init_jwt_cache(url, anon);
            tokio::spawn(jwt_cache.run_cleanup_task());
        }
        _ => tracing::warn!("SUPABASE_URL / SUPABASE_ANON_KEY unset; /mail/send is disabled"),
    }

    // Transports
    let http = tokio::spawn(transport::https::serve());

    tokio::select! {
        _ = http => {},
        _ = tokio::signal::ctrl_c() => {
            info!("shutdown signal received");
        }
    }

    Ok(())
}
