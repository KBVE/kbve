mod astro;
mod auth;
mod db;
mod proto;
mod transport;

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

    info!("KBVE v{}", env!("CARGO_PKG_VERSION"));

    // Initialize database services
    if db::init_profile_service() {
        info!("ProfileService initialized successfully");
    } else {
        warn!("ProfileService not available - profile routes will return 503");
    }

    // Initialize profile cache actor
    let _cache = db::init_profile_cache();
    info!("Profile cache actor started");

    // Initialize Discord client (optional - tries vault first, then ENV)
    if db::init_discord_client().await {
        info!("Discord client initialized - profile enrichment enabled");
    } else {
        info!("Discord client not configured - profile enrichment disabled");
    }

    // Initialize Twitch client (optional - for live status enrichment)
    if db::init_twitch_client().await {
        info!("Twitch client initialized - live status enrichment enabled");
    } else {
        info!("Twitch client not configured - live status enrichment disabled");
    }

    // Initialize RentEarth service (optional - for game character data)
    if db::init_rentearth_service() {
        info!("RentEarth service initialized - character data enrichment enabled");
    } else {
        info!("RentEarth service not configured - character data enrichment disabled");
    }

    // Initialize OSRS cache actor (loads item mapping + prices)
    let _osrs_cache = db::init_osrs_cache().await;
    info!("OSRS cache actor started");

    // Initialize JWT cache for authenticated endpoints
    if let (Ok(supabase_url), Ok(supabase_anon_key)) = (
        std::env::var("SUPABASE_URL"),
        std::env::var("SUPABASE_ANON_KEY"),
    ) {
        let jwt_cache = auth::init_jwt_cache(supabase_url, supabase_anon_key);
        tokio::spawn(jwt_cache.run_cleanup_task());
        info!("JWT cache initialized - authenticated endpoints enabled");
    } else {
        warn!("JWT cache not initialized - SUPABASE_URL or SUPABASE_ANON_KEY not set");
    }

    // Shared application state
    let state = transport::https::AppState::new();

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
