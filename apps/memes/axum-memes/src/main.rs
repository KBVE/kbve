mod astro;
mod meme;
mod transport;

use std::sync::Arc;
use tracing::{info, warn};
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

    info!("Meme.sh v{}", env!("CARGO_PKG_VERSION"));

    // Meme service initialization
    let meme_cache = Arc::new(meme::MemeCache::new());

    let supabase = match meme::MemeSupabaseConfig::from_env() {
        Ok(config) => match meme::MemeSupabaseClient::new(config) {
            Ok(client) => {
                info!("Supabase meme client initialized");
                Some(Arc::new(client))
            }
            Err(e) => {
                warn!(error = %e, "failed to create Supabase client — meme routes will return 404");
                None
            }
        },
        Err(e) => {
            warn!(error = %e, "Supabase config missing — meme routes will return 404");
            None
        }
    };

    let state = transport::https::AppState {
        meme_cache,
        supabase,
    };

    // Transports
    let http = tokio::spawn(transport::https::serve(state));

    tokio::select! {
        _ = http => {},
        _ = tokio::signal::ctrl_c() => {
            info!("shutdown signal received");
        }
    }

    Ok(())
}
