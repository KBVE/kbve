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
    rustls::crypto::ring::default_provider()
        .install_default()
        .expect("failed to install rustls CryptoProvider");

    dotenvy::dotenv().ok();

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

    if db::init_profile_service() {
        info!("ProfileService initialized successfully");
    } else {
        warn!("ProfileService not available - profile routes will return 503");
    }

    let profile_cache = db::init_profile_cache();
    tokio::spawn(profile_cache.run_cleanup_task());
    info!("Profile cache initialized");

    if db::init_discord_client().await {
        info!("Discord client initialized - profile enrichment enabled");
    } else {
        info!("Discord client not configured - profile enrichment disabled");
    }

    if db::init_twitch_client().await {
        info!("Twitch client initialized - live status enrichment enabled");
    } else {
        info!("Twitch client not configured - live status enrichment disabled");
    }

    if db::init_rentearth_service() {
        info!("RentEarth service initialized - character data enrichment enabled");
    } else {
        info!("RentEarth service not configured - character data enrichment disabled");
    }

    if db::init_mc_service() {
        info!("MC service initialized - player list + texture proxy enabled");
    } else {
        info!("MC service not configured (set MC_RCON_HOST to enable)");
    }

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

    if transport::proxy::init_grafana_proxy() {
        info!("Grafana proxy initialized - /dashboard/grafana/proxy enabled");
    } else {
        warn!("Grafana proxy not configured (GRAFANA_UPSTREAM_URL not set)");
    }

    if transport::proxy::init_argo_proxy() {
        info!("ArgoCD proxy initialized - /dashboard/argo/proxy enabled");
    } else {
        warn!("ArgoCD proxy not configured (ARGOCD_UPSTREAM_URL not set)");
    }

    if transport::proxy::init_clickhouse_logs_proxy() {
        info!("ClickHouse logs proxy initialized - /dashboard/clickhouse/proxy enabled");
    } else {
        warn!("ClickHouse logs proxy not configured (CLICKHOUSE_LOGS_UPSTREAM_URL not set)");
    }

    if transport::proxy::init_forgejo_proxy() {
        info!("Forgejo proxy initialized - /dashboard/forgejo/proxy enabled");
    } else {
        warn!("Forgejo proxy not configured (FORGEJO_UPSTREAM_URL not set)");
    }

    if transport::proxy::init_edge_proxy() {
        info!("Edge proxy initialized - /dashboard/edge/proxy enabled");
    } else {
        warn!("Edge proxy not configured (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set)");
    }

    if transport::proxy::init_kubevirt_proxy() {
        info!("KubeVirt proxy initialized - /dashboard/vm/proxy enabled");
    } else {
        warn!("KubeVirt proxy not configured (KUBEVIRT_API_URL not set)");
    }

    // Initialize KASM workspace proxy (optional - for /dashboard/kasm)
    if transport::proxy::init_kasm_proxy() {
        info!("KASM proxy initialized - /dashboard/kasm/proxy enabled");
    } else {
        info!("KASM proxy not configured (using default cluster URL)");
    }

    // Initialize Firecracker proxy (optional - for /dashboard/firecracker)
    if transport::proxy::init_firecracker_proxy() {
        info!("Firecracker proxy initialized - /dashboard/firecracker/proxy enabled");
    } else {
        info!("Firecracker proxy not configured (using default cluster URL)");
    }

    // Initialize Firecracker-Net proxy (optional - DASHBOARD_MANAGE gated, routes to firecracker-ctl-net with Gluetun/WireGuard sidecar)
    if transport::proxy::init_firecracker_net_proxy() {
        info!(
            "Firecracker-Net proxy initialized - /dashboard/firecracker-net/proxy enabled (DASHBOARD_MANAGE required)"
        );
    } else {
        info!("Firecracker-Net proxy not configured (using default cluster URL)");
    }

    // Initialize Guacamole proxy (optional - for /dashboard/guac)
    if transport::proxy::init_guacamole_proxy() {
        info!("Guacamole proxy initialized - /dashboard/guac/proxy enabled");
    } else {
        info!("Guacamole proxy not configured (using default cluster URL)");
    }

    if transport::proxy::init_chuckrpg_proxy() {
        info!("ChuckRPG proxy initialized - /dashboard/chuckrpg/proxy enabled");
    } else {
        info!("ChuckRPG proxy not configured (CHUCKRPG_UPSTREAM_URL not set)");
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
