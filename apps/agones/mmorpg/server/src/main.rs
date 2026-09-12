//! mmorpg dedicated server.
//!
//! Three things share the process: an authoritative avian3d simulation
//! replicated by lightyear, an HTTP port that mints the tokens players connect
//! with, and the Agones lifecycle that tells the cluster this instance is alive.
//!
//! The sim owns the main thread. bevy's `ScheduleRunnerPlugin` blocks, so tokio
//! runs the HTTP and Agones halves on their own runtime and the two meet only
//! through the netcode private key -- which is why the key is loaded once, here,
//! rather than twice from the environment.

mod agones;
mod auth;
mod sim;
mod token;

use std::net::SocketAddr;
use std::sync::Arc;

use tokio::net::TcpListener;
use tracing_subscriber::EnvFilter;

fn env_or<T: std::str::FromStr>(key: &str, fallback: T) -> T {
    std::env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(fallback)
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,mmorpg_server=debug".into()),
        )
        .init();

    // The port the game socket listens on, and the port the HTTP door answers
    // on. Two ports because the Fleet exposes them differently: the game port is
    // a WebSocket the gateway proxies, and the HTTP one is what the readiness
    // probe and the client's token request use.
    let game_addr: SocketAddr = env_or("MMORPG_GAME_ADDR", "0.0.0.0:7100".parse().unwrap());
    let http_addr: SocketAddr = env_or("MMORPG_HTTP_ADDR", "0.0.0.0:7101".parse().unwrap());

    // Where a browser should point. Inside a cluster the address the socket
    // binds says nothing about the URL a player reaches it by, so the manifest
    // states it.
    let public_ws_url = std::env::var("MMORPG_PUBLIC_WS_URL")
        .unwrap_or_else(|_| format!("ws://{game_addr}"));

    let private_key = bevy_kbve_net::net_config::load_private_key();
    if private_key == bevy_kbve_net::net_config::DEV_PRIVATE_KEY {
        // Not fatal: this is exactly the local case. In the cluster the Fleet
        // supplies GAME_PRIVATE_KEY, and a warning in the log is how a missing
        // secret is noticed before players are.
        tracing::warn!(
            "[mmorpg-server] GAME_PRIVATE_KEY is unset — using the all-zero development key"
        );
    }

    // The HTTP side and the Agones side are I/O; the sim is not. Giving them a
    // runtime on background threads leaves the main thread free to be a game
    // loop that never yields.
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .worker_threads(2)
        .thread_name("mmorpg-io")
        .build()?;

    runtime.spawn(async move {
        agones::run_health_loop().await;
    });

    let http = runtime.spawn(async move {
        let accounts = auth::Accounts::from_env().await.map(Arc::new);
        if accounts.is_none() {
            tracing::info!(
                "[mmorpg-server] no SUPABASE_URL/SUPABASE_JWKS_URI — guests only, which is the \
                 shape a public playtest wants anyway"
            );
        }

        let state = token::HttpState {
            accounts,
            private_key,
            game_addr,
            public_ws_url,
        };

        match TcpListener::bind(http_addr).await {
            Ok(listener) => {
                tracing::info!("[mmorpg-server] token endpoint on http://{http_addr}");
                if let Err(e) = axum::serve(listener, token::router(state)).await {
                    tracing::error!(error = %e, "[mmorpg-server] http server stopped");
                }
            }
            Err(e) => {
                // Fatal in practice: with no token endpoint nobody can obtain a
                // credential, so the game port has nothing to admit.
                tracing::error!(error = %e, "[mmorpg-server] could not bind {http_addr}");
            }
        }
    });

    // Blocks until the process is asked to stop.
    sim::build(private_key, game_addr).run();

    http.abort();
    runtime.block_on(agones::shutdown());
    Ok(())
}
