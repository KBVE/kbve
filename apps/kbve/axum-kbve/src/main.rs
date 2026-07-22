#![allow(clippy::result_large_err)]
#![allow(clippy::too_many_arguments)]

mod astro;
mod auth;
mod db;
pub mod gameserver;
mod mcp;
mod openapi;
mod proto;
mod rcon;
mod s3backup;
mod telemetry;
mod transport;
pub mod version;

use tracing::{error, info, warn};
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
    // Early exit: print the OpenAPI 3.1 spec to stdout and quit.
    // Wired up so `nx run axum-kbve:emit-openapi` can capture the JSON into
    // packages/data/openapi/openapi.json without booting the full service.
    // Skips db / proxy / game-server init so it's fast + has no env deps.
    if std::env::args().any(|arg| arg == "--emit-openapi") {
        use utoipa::OpenApi;
        let spec = openapi::ApiDoc::openapi();
        let json = serde_json::to_string_pretty(&spec)?;
        println!("{json}");
        return Ok(());
    }

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

    info!("KBVE v{}", version::current());

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

    match rcon::init_rcon_registry() {
        Ok(reg) => info!(
            "RCON registry initialized — {} commands, {} endpoints configured",
            reg.command_count(),
            reg.endpoint_count()
        ),
        Err(e) => warn!(error = %e, "RCON registry init failed — /api/v1/rcon/* will 503"),
    }

    if db::init_forum_service() {
        info!("Forum service initialized - SSR forum routes enabled");
    } else {
        info!("Forum service not configured - /forum routes will 503");
    }

    if db::init_pg_cluster().await {
        info!("PgCluster initialized - PgCluster-backed routes enabled");
    } else {
        warn!("PgCluster not configured - PgCluster-backed routes will 503");
    }

    if db::init_kv_cache().await {
        info!("KvCache initialized - L1 LRU + L2 Valkey read-through cache enabled");
    } else {
        warn!("KvCache init failed - read-through cache disabled");
    }

    if db::init_wallet_client().await {
        info!("Wallet client initialized - /api/v1/wallet/me/* routes enabled");
    } else {
        warn!("Wallet client not configured - /api/v1/wallet routes will 503");
    }

    // Referral client borrows the wallet pool, so this must run after
    // init_wallet_client.
    if db::init_referral_client().await {
        info!("Referral client initialized - /api/v1/referral/* routes enabled");
    } else {
        warn!("Referral client not configured - /api/v1/referral/* routes will 503");
    }

    // Lot client also rides the wallet pool (purchases settle through
    // wallet.service_debit). Run after the wallet client so it can share.
    if db::init_lot_client().await {
        info!("Lot client initialized - /api/v1/mc/lots/* routes enabled");
    } else {
        warn!("Lot client not configured - /api/v1/mc/lots/* routes will 503");
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

    if transport::proxy::init_clickhouse_direct() {
        info!(
            "ClickHouse direct route initialized - /dashboard/clickhouse/proxy now talks straight to ClickHouse via jedi"
        );
    } else {
        warn!(
            "ClickHouse direct route not configured (CLICKHOUSE_HOST / CLICKHOUSE_PORT / CLICKHOUSE_USER / CLICKHOUSE_DATABASE not set)"
        );
    }

    if transport::proxy::init_forgejo_proxy() {
        info!("Forgejo proxy initialized - /dashboard/forgejo/proxy enabled");
    } else {
        warn!("Forgejo proxy not configured (FORGEJO_UPSTREAM_URL not set)");
    }

    if transport::proxy::init_cube_proxy() {
        info!("Cube proxy initialized - /dashboard/cube/proxy enabled");
    } else {
        warn!("Cube proxy not configured (CUBE_API_TOKEN not set)");
    }

    if transport::forgejo_api::init_forgejo_api() {
        info!("Forgejo typed API initialized - /dashboard/forgejo/api/* enabled");
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

    // Windmill proxy (optional - for /dashboard/workflows, routes to windmill-gate)
    if transport::proxy::init_windmill_proxy() {
        info!("Windmill proxy initialized - /dashboard/workflows/proxy enabled");
    } else {
        info!("Windmill proxy not configured (using default cluster URL)");
    }

    // Initialize Factorio proxy (optional - for /dashboard/factorio, routes to factorio-ctl)
    if transport::proxy::init_factorio_proxy() {
        info!("Factorio proxy initialized - /dashboard/factorio/proxy enabled");
    } else {
        info!("Factorio proxy not configured (using default cluster URL)");
    }

    // Initialize Vibeshine proxy (optional - DASHBOARD_MANAGE gated, routes to the
    // Windows game-stream host over the wg0 tunnel)
    if transport::proxy::init_vibeshine_proxy() {
        info!(
            "Vibeshine proxy initialized - /dashboard/vibeshine/proxy enabled (DASHBOARD_MANAGE required)"
        );
    } else {
        info!("Vibeshine proxy not configured (using default wg tunnel URL)");
    }

    // Initialize Vibeshine WebRTC signaling relay (optional - DASHBOARD_VIEW gated,
    // separate webrtc-scoped upstream token via VIBESHINE_WEBRTC_TOKEN)
    if transport::proxy::init_vibeshine_webrtc_proxy() {
        info!(
            "Vibeshine WebRTC relay initialized - /api/v1/vibeshine/webrtc/* enabled (DASHBOARD_VIEW required)"
        );
    } else {
        info!("Vibeshine WebRTC relay not configured (using default wg tunnel URL)");
    }

    if transport::proxy::init_reel_proxy() {
        info!("Reel proxy initialized - /api/v1/reel/* enabled (DASHBOARD_VIEW required)");
    } else {
        info!("Reel proxy not configured");
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
        info!(
            "ChuckRPG proxy initialized - /dashboard/chuckrpg/proxy/{{tenant}} + /api/rows/openapi.json enabled"
        );
    } else {
        info!("ChuckRPG proxy not configured (CHUCKRPG_TENANTS not set)");
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
        res = http => {
            // The HTTP server is meant to run for the process lifetime; if its
            // task returns or panics, that's a crash — exit non-zero so the
            // orchestrator restarts us instead of seeing a clean exit.
            match res {
                Ok(_) => error!("HTTP server task exited unexpectedly"),
                Err(e) => error!("HTTP server task panicked: {e}"),
            }
            std::process::exit(1);
        }
        _ = tokio::signal::ctrl_c() => {
            info!("shutdown signal received");
        }
    }

    Ok(())
}
