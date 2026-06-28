mod agones;
mod auth;
mod creatures;
mod db;
mod game;
mod pilot;
mod ship_footprint_gen;

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

    // Auth precedence: a local HS256 secret (SUPABASE_JWT_SECRET) wins — verifying
    // the signature locally is what the rest of the platform does (irc-gateway,
    // jobboard, rows, kbve-gate) and avoids depending on GoTrue's /auth/v1/user,
    // which rejects validly-signed tokens when its verifying secret drifts. Else
    // fall back to a GoTrue verifier (SUPABASE_URL + SUPABASE_ANON_KEY), else
    // dev-accept (no auth) when neither is set.
    // Prefer the local accept-both verifier (HS256 + ES256/JWKS, one jedi path)
    // when a JWKS URI is available; else the GoTrue-API verifier; else fall back
    // to the in-sim HS256 secret (ServerState) or dev-accept.
    let verifier = match auth::jwks_verifier().await {
        Some(v) => Some(v),
        None => auth::gotrue_verifier(),
    };
    let auth_mode = if verifier.is_some() {
        "supabase accept-both (HS256 + ES256/JWKS) / GoTrue"
    } else if !jwt_secret.is_empty() {
        "supabase HS256 (in-sim local secret)"
    } else {
        "dev-accept (no auth configured)"
    };

    let registry = game::registry();

    let mut state = ServerState::new(input_tx, seed, jwt_secret, true, game::MAX_PLAYERS)
        .with_registry(registry.entries());
    if let Some(v) = verifier {
        state = state.with_verifier(v);
    }
    let roster = state.roster.clone();
    state.spawn_event_router(out_rx);

    let config = game::config();
    let map = game::walkable_map();

    // Durable store for player-placed env objects (campfires), keyed per world
    // seed. Load the prior snapshot so they survive a restart; wire a channel the
    // sim pushes every change through, drained by an async writer below.
    let env_key = format!("arpg:env:{seed}");
    let restored_env = db::load_persisted_env(&env_key).await;
    if !restored_env.is_empty() {
        tracing::info!(count = restored_env.len(), "restored placed env objects");
    }
    let (env_tx, mut env_rx) = mpsc::unbounded_channel::<Vec<simgrid::PersistedEnvObject>>();

    let sim_handle = tokio::task::spawn_blocking(move || {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_time()
            .build()
            .expect("sim runtime");
        let mut app = build_app(out_tx, input_rx, roster, seed, config, map, registry);
        let item_db = game::item_db();
        let (consumables, buffs) = game::item_effects(&item_db);
        tracing::info!(
            items = item_db.len(),
            consumables = consumables.0.len(),
            buffs = buffs.0.len(),
            "itemdb loaded into sim"
        );
        app.insert_resource(consumables);
        app.insert_resource(buffs);
        app.insert_resource(item_db);
        app.insert_resource(game::spell_db());
        app.insert_resource(game::stairs());
        app.insert_resource(game::deployables());
        app.insert_resource(simgrid::PersistedEnvLog(restored_env));
        app.insert_resource(simgrid::EnvPersistSink(Some(env_tx)));
        app.add_systems(
            bevy::prelude::Update,
            (
                game::spawn_world,
                game::stream_predators,
                game::stream_wyverns,
                game::stream_trees,
            )
                .in_set(simgrid::SimSet::Spawn),
        );
        // Debug pet-battle: drains SimPetBattle requests after inputs are routed and
        // streams the simulated 5v5 mechamutt log back to the requester.
        app.add_systems(
            bevy::prelude::Update,
            game::apply_pet_battles.after(simgrid::SimSet::Input),
        );
        // Ship piloting: `apply_pilot_ops` boards/leaves before movement (so the new
        // footprint is set when players move); `drive_ships` binds each ship to its
        // pilot + advances the lift/land phase after movement, before hull collision.
        app.add_systems(
            bevy::prelude::Update,
            (pilot::recover_orphaned_ships, pilot::apply_pilot_ops)
                .chain()
                .before(simgrid::SimSet::Movement),
        );
        // A placed/restored ship starts descending from orbit (ENTERING) before it's
        // driven, so it lands instead of popping in parked. `return_from_space` spawns a
        // boarded ship for a player who just rejoined from the solo space scene (runs
        // first so the ship exists for `start_placed_ship_descent` to give it the descent).
        app.add_systems(
            bevy::prelude::Update,
            (pilot::return_from_space, pilot::start_placed_ship_descent)
                .chain()
                .before(simgrid::SimSet::Movement),
        );
        app.add_systems(
            bevy::prelude::Update,
            pilot::drive_ships
                .after(simgrid::SimSet::Movement)
                .before(game::resolve_ship_collision),
        );
        // Smooth hull collision pushes players out of the ship's oriented box AFTER the
        // float movement set resolves and BEFORE the snapshot streams the corrected pos.
        // The pilot is exempt (`Without<Piloting>`) so it isn't ejected from its ship.
        app.add_systems(
            bevy::prelude::Update,
            game::resolve_ship_collision
                .after(simgrid::SimSet::Movement)
                .before(simgrid::SimSet::Snapshot),
        );
        rt.block_on(run_sim_loop(app));
    });

    // Drain placed-object snapshots from the sim and write them to the durable
    // store. Best-effort: a write failure is logged inside the db layer and the
    // next change overwrites it.
    let env_writer = tokio::spawn(async move {
        while let Some(snapshot) = env_rx.recv().await {
            db::save_persisted_env(&env_key, &snapshot).await;
        }
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
    env_writer.abort();
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
