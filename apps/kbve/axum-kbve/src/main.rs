mod astro;
mod auth;
mod db;
pub mod gameserver;
mod proto;
mod telemetry;
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
    // Install rustls crypto provider before any TLS usage (axum-server, lightyear, etc.)
    rustls::crypto::ring::default_provider()
        .install_default()
        .expect("failed to install rustls CryptoProvider");

    // Load .env before anything reads env vars
    dotenvy::dotenv().ok();

    // Tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
                format!(
                    "{}=info,tower_http=debug,client_telemetry=warn",
                    env!("CARGO_CRATE_NAME")
                )
                .into()
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

    // Initialize MC RCON service (optional - for player list API)
    if db::init_mc_service() {
        info!("MC RCON service initialized - player API enabled");
    } else {
        info!("MC RCON not configured - player API disabled");
    }

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

    // Initialize Grafana reverse proxy (optional - for /dashboard/grafana)
    if transport::proxy::init_grafana_proxy() {
        info!("Grafana proxy initialized - /dashboard/grafana/proxy enabled");
    } else {
        info!("Grafana proxy not configured (GRAFANA_UPSTREAM_URL not set)");
    }

    // Initialize ArgoCD reverse proxy (optional - for /dashboard/argo)
    if transport::proxy::init_argo_proxy() {
        info!("ArgoCD proxy initialized - /dashboard/argo/proxy enabled");
    } else {
        info!("ArgoCD proxy not configured (ARGOCD_UPSTREAM_URL not set)");
    }

    // Initialize ClickHouse logs proxy (optional - for /dashboard/clickhouse)
    if transport::proxy::init_clickhouse_logs_proxy() {
        info!("ClickHouse logs proxy initialized - /dashboard/clickhouse/proxy enabled");
    } else {
        info!("ClickHouse logs proxy not configured (CLICKHOUSE_LOGS_UPSTREAM_URL not set)");
    }

    // Initialize Forgejo reverse proxy (optional - for /dashboard/forgejo)
    if transport::proxy::init_forgejo_proxy() {
        info!("Forgejo proxy initialized - /dashboard/forgejo/proxy enabled");
    } else {
        info!("Forgejo proxy not configured (FORGEJO_UPSTREAM_URL not set)");
    }

    // Initialize Edge Functions proxy (optional - for /dashboard/edge)
    if transport::proxy::init_edge_proxy() {
        info!("Edge proxy initialized - /dashboard/edge/proxy enabled");
    } else {
        info!("Edge proxy not configured (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set)");
    }

    // Initialize KubeVirt proxy (optional - for /dashboard/vm)
    if transport::proxy::init_kubevirt_proxy() {
        info!("KubeVirt proxy initialized - /dashboard/vm/proxy enabled");
    } else {
        info!("KubeVirt proxy not configured (KUBEVIRT_API_URL not set)");
    }

    // Initialize game server (headless Bevy + lightyear + avian3d)
    // Runs in its own thread; lightyear binds WebSocket on GAME_WS_ADDR (default :5000)
    gameserver::init_gameserver();
    info!("Game server initialized - lightyear WebSocket on separate port");

    // Shared application state (no longer carries GameServerState)
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
