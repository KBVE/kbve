//! Agones SDK heartbeat — keeps the gameserver alive in the Fleet's eyes.
//!
//! Without these pings the Agones controller marks the pod unhealthy after
//! `failureThreshold * periodSeconds` and recycles it. The Fabric server
//! itself doesn't speak the Agones SDK, so we proxy the lifecycle calls
//! from inside this plugin's Tokio runtime.
//!
//! Lifecycle:
//!   1. Connect to the sidecar at `localhost:9357` (or `AGONES_SDK_GRPC_PORT`)
//!   2. Call `Ready()` once — tells Agones the server is up
//!   3. Send empty messages on the health channel every 2s — keeps Agones happy
//!   4. On shutdown, call `Shutdown()` for graceful Fleet draining
//!
//! Graceful degrade: if no sidecar is reachable (running outside Agones,
//! e.g. local `nx run mc:dev`), log a warning and exit cleanly so the rest
//! of the plugin still works.

use std::time::Duration;

use tokio::time::{MissedTickBehavior, interval};
use tracing::{error, info, warn};

const HEALTH_PING_INTERVAL: Duration = Duration::from_secs(2);

/// Long-running task that owns the Agones SDK connection.
///
/// Spawned once at runtime startup. Returns when:
/// - the sidecar can't be reached (no Agones environment), or
/// - the health channel is closed (sidecar gone away).
pub async fn run_health_loop() {
    let mut sdk = match agones::Sdk::new(None, None).await {
        Ok(sdk) => {
            info!("[mc_auth/agones] Connected to Agones SDK sidecar");
            sdk
        }
        Err(e) => {
            warn!(
                error = %e,
                "[mc_auth/agones] Agones SDK unavailable — running outside Agones (local dev?)"
            );
            return;
        }
    };

    if let Err(e) = sdk.ready().await {
        error!(error = %e, "[mc_auth/agones] Failed to mark gameserver Ready");
        return;
    }
    info!("[mc_auth/agones] GameServer marked Ready");

    let health_tx = sdk.health_check();
    let mut ticker = interval(HEALTH_PING_INTERVAL);
    ticker.set_missed_tick_behavior(MissedTickBehavior::Skip);

    loop {
        ticker.tick().await;
        if health_tx.send(()).await.is_err() {
            error!("[mc_auth/agones] Health channel closed — sidecar gone");
            return;
        }
    }
}

/// Best-effort graceful Shutdown — called when the JVM unloads the plugin.
/// Failures are non-fatal: Agones will reap the pod via health timeout if
/// the SDK isn't reachable.
pub async fn shutdown() {
    let mut sdk = match agones::Sdk::new(None, None).await {
        Ok(sdk) => sdk,
        Err(e) => {
            warn!(
                error = %e,
                "[mc_auth/agones] Skipping graceful Shutdown — SDK unreachable"
            );
            return;
        }
    };
    if let Err(e) = sdk.shutdown().await {
        warn!(error = %e, "[mc_auth/agones] Shutdown call failed");
    } else {
        info!("[mc_auth/agones] Shutdown signal sent to Agones");
    }
}
