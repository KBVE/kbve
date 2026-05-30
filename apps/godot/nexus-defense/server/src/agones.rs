//! Agones SDK lifecycle for the Nexus Defense game server.
//!
//! Connects to the in-pod sidecar (`localhost:$AGONES_SDK_GRPC_PORT`,
//! default 9357), marks the GameServer `Ready` once the axum listener is
//! bound, then pings the SDK health channel every
//! [`HEALTH_PING_INTERVAL`] so the Agones controller keeps the pod alive.
//! On graceful shutdown the orchestrator calls [`shutdown`] so Agones
//! can drain the Fleet without waiting for the health timeout.
//!
//! Outside Agones (local `cargo run`, CI smoke) the sidecar isn't
//! reachable — both helpers log a single warning and exit cleanly so
//! the rest of the binary keeps working unchanged.
//!
//! Mirrors the proven pattern from `apps/mc/mc_auth/src/agones.rs`.

use std::time::Duration;

use tokio::time::{MissedTickBehavior, interval};
use tracing::{error, info, warn};

const HEALTH_PING_INTERVAL: Duration = Duration::from_secs(2);

/// Long-running task that owns the Agones SDK connection.
///
/// Spawned once main.rs has bound its WS listener. Returns when:
/// - the sidecar can't be reached (no Agones environment), or
/// - the health channel is closed (sidecar gone away).
pub async fn run_health_loop() {
    let mut sdk = match agones::Sdk::new(None, None).await {
        Ok(sdk) => {
            info!("[nd-server/agones] Connected to Agones SDK sidecar");
            sdk
        }
        Err(e) => {
            warn!(
                error = %e,
                "[nd-server/agones] Agones SDK unavailable — running outside Agones (local dev?)"
            );
            return;
        }
    };

    if let Err(e) = sdk.ready().await {
        error!(error = %e, "[nd-server/agones] Failed to mark gameserver Ready");
        return;
    }
    info!("[nd-server/agones] GameServer marked Ready");

    let health_tx = sdk.health_check();
    let mut ticker = interval(HEALTH_PING_INTERVAL);
    ticker.set_missed_tick_behavior(MissedTickBehavior::Skip);

    loop {
        ticker.tick().await;
        if health_tx.send(()).await.is_err() {
            error!("[nd-server/agones] Health channel closed — sidecar gone");
            return;
        }
    }
}

/// Best-effort graceful Shutdown. Failures are non-fatal: Agones will
/// reap the pod via the health timeout if the SDK is unreachable.
pub async fn shutdown() {
    let mut sdk = match agones::Sdk::new(None, None).await {
        Ok(sdk) => sdk,
        Err(e) => {
            warn!(
                error = %e,
                "[nd-server/agones] Skipping graceful Shutdown — SDK unreachable"
            );
            return;
        }
    };
    if let Err(e) = sdk.shutdown().await {
        warn!(error = %e, "[nd-server/agones] Shutdown call failed");
    } else {
        info!("[nd-server/agones] Shutdown signal sent to Agones");
    }
}
