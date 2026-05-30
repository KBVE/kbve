//! Nexus Defense game server entry point.
//!
//! Boots the bevy headless sim, wires its snapshot broadcast into the axum
//! WS router (`q::net::server`), and serves both from the same tokio
//! runtime. Agones lifecycle (`Ready` / `Health` / `Shutdown`) is proxied
//! through the [`agones`] module so the Fleet flips this pod to `Ready`
//! the moment the WS listener accepts connections.

mod agones;

use std::net::SocketAddr;

use q::nexus_defense_server::{SNAPSHOT_BROADCAST_CAPACITY, build_app, run_sim_loop};
use tokio::net::TcpListener;
use tokio::sync::{broadcast, mpsc};
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| "info,nd_server=debug".into()),
        )
        .init();

    let addr: SocketAddr = std::env::var("TD_SERVER_ADDR")
        .unwrap_or_else(|_| "0.0.0.0:7878".into())
        .parse()?;

    let seed: u64 = std::env::var("TD_SERVER_SEED")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0xC0FFEE);

    // Broadcast bus: bevy sim -> every WS session.
    let (snap_tx, _) = broadcast::channel(SNAPSHOT_BROADCAST_CAPACITY);
    // Input mailbox: WS sessions -> bevy sim.
    let (input_tx, input_rx) = mpsc::unbounded_channel::<q::net::server::SlotInput>();

    let jwt_secret = std::env::var("SUPABASE_JWT_SECRET")
        .unwrap_or_default()
        .into_bytes();
    let auth_mode = if jwt_secret.is_empty() {
        "dev-accept (SUPABASE_JWT_SECRET unset)"
    } else {
        "supabase HS256"
    };

    // Build ServerState first so the sim + WS layer share the same roster.
    let state = q::net::server::ServerState::new(snap_tx.clone(), input_tx, seed, jwt_secret);
    let roster = state.roster.clone();

    // Bevy headless app — runs on a dedicated blocking thread so the App
    // (which holds non-Send schedule state) never crosses task boundaries.
    let sim_handle = tokio::task::spawn_blocking(move || {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_time()
            .build()
            .expect("sim runtime");
        let app = build_app(snap_tx, input_rx, roster, seed);
        rt.block_on(run_sim_loop(app));
    });

    let router = q::net::server::router(state);

    tracing::info!(%addr, %seed, auth = %auth_mode, "nd-server listening");

    let listener = TcpListener::bind(addr).await?;

    // Bring the Agones SDK heartbeat up the moment the listener is bound.
    // The loop owns the SDK handle for the process lifetime; outside
    // Agones it logs once and exits, so `cargo run` still works.
    let agones_handle = tokio::spawn(agones::run_health_loop());

    let serve = axum::serve(listener, router).with_graceful_shutdown(shutdown_signal());

    if let Err(e) = serve.await {
        tracing::error!("serve error: {e}");
    }

    // Best-effort graceful Shutdown so the Fleet can drain this pod
    // without waiting for the health timeout. Bounded to 1s — Agones
    // reaps via the health probe if the SDK call is wedged.
    let _ = tokio::time::timeout(std::time::Duration::from_secs(1), agones::shutdown()).await;
    agones_handle.abort();

    // The sim task lives on a current-thread runtime inside spawn_blocking;
    // letting main return drops the JoinHandle and the process exits.
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
