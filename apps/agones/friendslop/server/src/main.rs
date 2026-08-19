mod agones;
mod auth;
mod driver;
mod props;
/// Not compiled into the server: a bench that happens to be shaped like a test.
#[cfg(test)]
mod scaling_probe;
mod terrain_stream;

use std::net::SocketAddr;

use q::net::dual::DualHost;
use q::net::udp::UdpLane;
use q::net::ws::{WsHost, router};
use tokio::net::TcpListener;
use tracing_subscriber::EnvFilter;

fn env_parse<T: std::str::FromStr>(key: &str, default: T) -> T {
    std::env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,friendslop_server=debug,q=debug".into()),
        )
        .init();

    let addr: SocketAddr = std::env::var("FS_SERVER_ADDR")
        .unwrap_or_else(|_| "0.0.0.0:7980".into())
        .parse()?;

    // Extent and resolution have to match the client's QTerrain or the two disagree
    // on ground height and players sink or float. Same for the seed, which the client
    // takes from Welcome rather than its own scene.
    let terrain_extent: f32 = env_parse("FS_TERRAIN_EXTENT", 256.0);
    let cfg = driver::DriverConfig {
        seed: env_parse("FS_SERVER_SEED", 1337),
        tick_hz: env_parse("FS_TICK_HZ", 60.0),
        terrain_extent,
        terrain_resolution: env_parse("FS_TERRAIN_RESOLUTION", 513),
        water_level: env_parse("FS_WATER_LEVEL", -1.4),
        road_width: env_parse("FS_ROAD_WIDTH", 3.2),
        // On by default: a streaming set of regions is a superset of the single tile,
        // so it is correct whether or not the client streams. A client that does not
        // stream simply never walks off the first one.
        ground_source: q::ground::GroundSource::parse(
            &std::env::var("FS_GROUND_SOURCE").unwrap_or_default(),
        ),
        stream_enabled: env_parse("FS_STREAM_ENABLED", true),
        stream_stride: env_parse("FS_STREAM_STRIDE", 128.0),
        // Wider than the stride so pacing a boundary does not churn bakes.
        stream_keep_radius: env_parse("FS_STREAM_KEEP", terrain_extent * 1.5),
        // Must match QStoneField and QTreeField's grid_size. The host has no
        // scatter, so these are only how it turns a claimed cell back into
        // somewhere to measure a reach check against.
        stone_grid_size: env_parse("FS_STONE_GRID", 22.0),
        tree_grid_size: env_parse("FS_TREE_GRID", 14.0),
        // What the rocks and trees are scattered from, which is not the world seed:
        // the seed moves the ground, these move the things standing on it. Sent to
        // every client on join, so rotating one here rotates it everywhere.
        stone_seed: env_parse("FS_STONE_SEED", q::worldgen::StoneScatter::DEFAULT_SEED),
        tree_seed: env_parse("FS_TREE_SEED", q::worldgen::TreeScatter::DEFAULT_SEED),
        harvest_reach: env_parse("FS_HARVEST_REACH", 6.0),
        pets_per_player: env_parse("FS_PETS_PER_PLAYER", 10),
        pets_total: env_parse("FS_PETS_TOTAL", 96),
    };

    tracing::info!(
        %addr,
        seed = cfg.seed,
        tick_hz = cfg.tick_hz,
        extent = cfg.terrain_extent,
        resolution = cfg.terrain_resolution,
        ground = cfg.ground_source.as_str(),
        stream = cfg.stream_enabled,
        stride = cfg.stream_stride,
        "friendslop-server listening"
    );

    let udp_addr: SocketAddr = std::env::var("FS_UDP_ADDR")
        .unwrap_or_else(|_| "0.0.0.0:7981".into())
        .parse()?;

    let ws = WsHost::new();
    let udp = UdpLane::bind(udp_addr).await?;
    udp.spawn_recv_loop();
    tracing::info!(udp_port = udp.port(), "datagram lane bound");

    let transport = DualHost::new(ws.clone(), udp);
    let authority = match auth::SupabaseAuthority::from_env().await {
        Some(a) => Some(a.shared()),
        None => {
            tracing::info!("no SUPABASE_URL/SUPABASE_JWKS_URI; guests only");
            None
        }
    };
    let mut sim = driver::spawn(transport.clone(), cfg, authority);

    let app = router(ws).merge(stats_route(
        transport.clone(),
        sim.tick_handle(),
        sim.regions_handle(),
        sim.pets_handle(),
        sim.pet_fields_handle(),
    ));

    let listener = TcpListener::bind(addr).await?;
    let advertise_host = std::env::var("FS_UDP_ADVERTISE_HOST").ok();
    let advertise_port: Option<u16> = std::env::var("FS_UDP_ADVERTISE_PORT")
        .ok()
        .and_then(|v| v.parse().ok());
    let overridden = advertise_host.is_some() || advertise_port.is_some();
    if overridden {
        tracing::info!(?advertise_host, ?advertise_port, "udp endpoint overridden");
        transport.advertise_udp(advertise_host, advertise_port);
    }

    let agones_handle = tokio::spawn(agones::run_health_loop(transport.clone(), !overridden));

    let serve = axum::serve(listener, app).with_graceful_shutdown(shutdown_signal());
    if let Err(e) = serve.await {
        tracing::error!("serve error: {e}");
    }

    sim.stop();
    let _ = tokio::time::timeout(std::time::Duration::from_secs(1), agones::shutdown()).await;
    agones_handle.abort();
    Ok(())
}

/// A live tick counter is the only cheap proof the sim thread is stepping — `/healthz`
/// answers even if it has wedged.
fn stats_route(
    transport: std::sync::Arc<DualHost>,
    tick: std::sync::Arc<std::sync::atomic::AtomicU64>,
    regions: std::sync::Arc<std::sync::atomic::AtomicUsize>,
    pets: std::sync::Arc<std::sync::atomic::AtomicUsize>,
    pet_fields: std::sync::Arc<std::sync::atomic::AtomicUsize>,
) -> axum::Router {
    axum::Router::new().route(
        "/stats",
        axum::routing::get(move || async move {
            axum::Json(serde_json::json!({
                "tick": tick.load(std::sync::atomic::Ordering::Relaxed),
                "peers": transport.peer_count(),
                "udp_bound": transport.bound_count(),
                "udp_port": transport.udp_port(),
                "udp_oversize": transport.oversize_count(),
                "terrain_regions": regions.load(std::sync::atomic::Ordering::Relaxed),
                "pets": pets.load(std::sync::atomic::Ordering::Relaxed),
                "pet_fields": pet_fields.load(std::sync::atomic::Ordering::Relaxed),
            }))
        }),
    )
}

async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };

    #[cfg(unix)]
    let terminate = async {
        if let Ok(mut s) = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        {
            s.recv().await;
        }
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
}
