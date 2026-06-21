mod agones;
mod db;
mod game;

use std::net::SocketAddr;

use bevy::prelude::IntoScheduleConfigs;
use simgrid::net::ServerState;
use simgrid::proto::ServerEvent;
use simgrid::{build_app, run_sim_loop};
use tokio::net::TcpListener;
use tokio::sync::mpsc;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,arpg_server=debug,simgrid=debug".into()),
        )
        .init();

    if db::init_pg_cluster().await {
        tracing::info!("PgCluster initialized — pooled Postgres available");
    } else {
        tracing::info!("PgCluster not configured — persistence degrades");
    }
    if db::init_kv_cache().await {
        tracing::info!("KvCache initialized — L1 LRU + L2 Valkey enabled");
    }

    let addr: SocketAddr = std::env::var("ARPG_SERVER_ADDR")
        .unwrap_or_else(|_| "0.0.0.0:7979".into())
        .parse()?;

    let seed: u64 = std::env::var("ARPG_SERVER_SEED")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0xC0FFEE);

    let (out_tx, out_rx) = mpsc::unbounded_channel::<ServerEvent>();
    let (input_tx, input_rx) = mpsc::unbounded_channel::<simgrid::SlotInput>();

    let jwt_secret = std::env::var("SUPABASE_JWT_SECRET")
        .unwrap_or_default()
        .into_bytes();
    let auth_mode = if jwt_secret.is_empty() {
        "dev-accept (SUPABASE_JWT_SECRET unset)"
    } else {
        "supabase HS256"
    };

    let registry = game::registry();

    let state = ServerState::new(input_tx, seed, jwt_secret, true, game::MAX_PLAYERS)
        .with_registry(registry.entries());
    let roster = state.roster.clone();
    state.spawn_event_router(out_rx);

    let config = game::config();
    let map = game::walkable_map();

    let sim_handle = tokio::task::spawn_blocking(move || {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_time()
            .build()
            .expect("sim runtime");
        let mut app = build_app(out_tx, input_rx, roster, seed, config, map, registry);
        app.insert_resource(game::stairs());
        app.add_systems(
            bevy::prelude::Update,
            game::spawn_world.in_set(simgrid::SimSet::Spawn),
        );
        rt.block_on(run_sim_loop(app));
    });

    let router = simgrid::router(state);

    tracing::info!(%addr, %seed, auth = %auth_mode, max_players = game::MAX_PLAYERS, "arpg-server listening");

    let listener = TcpListener::bind(addr).await?;
    let agones_handle = tokio::spawn(agones::run_health_loop());

    let serve = axum::serve(listener, router).with_graceful_shutdown(shutdown_signal());

    if let Err(e) = serve.await {
        tracing::error!("serve error: {e}");
    }

    let _ = tokio::time::timeout(std::time::Duration::from_secs(1), agones::shutdown()).await;
    agones_handle.abort();
    drop(sim_handle);
    Ok(())
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
        _ = ctrl_c => {}
        _ = terminate => {}
    }

    tracing::info!("shutdown signal received");
}
