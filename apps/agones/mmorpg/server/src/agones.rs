//! Agones lifecycle.
//!
//! Lifted from `apps/agones/friendslop/server/src/agones.rs`, which learned the
//! two things that matter: health has to be pinged on a timer or the controller
//! replaces a server that is working, and the absence of the sidecar is a local
//! developer rather than a fault.

use std::time::Duration;

use tokio::time::{MissedTickBehavior, interval};
use tracing::{error, info, warn};

/// Agones marks a server unhealthy after a few missed pings; two seconds leaves
/// room for a tick that runs long without ever approaching that.
const HEALTH_PING_INTERVAL: Duration = Duration::from_secs(2);

/// Announce readiness, then keep the health stream alive for the life of the
/// process.
///
/// Returns immediately when there is no sidecar to talk to, which is every
/// `cargo run` on a laptop. A server that refused to start without Agones would
/// make the local loop need a cluster.
pub async fn run_health_loop() {
    let mut sdk = match agones::Sdk::new(None, None).await {
        Ok(sdk) => {
            info!("[mmorpg-server/agones] connected to the Agones SDK sidecar");
            sdk
        }
        Err(e) => {
            warn!(
                error = %e,
                "[mmorpg-server/agones] no Agones SDK sidecar — running unmanaged (local dev?)"
            );
            return;
        }
    };

    if let Err(e) = sdk.ready().await {
        error!(error = %e, "[mmorpg-server/agones] Ready() failed; the fleet will not route players here");
        return;
    }
    info!("[mmorpg-server/agones] Ready() — accepting players");

    let health = sdk.health_check();
    let mut ticker = interval(HEALTH_PING_INTERVAL);
    // A tick missed because the runtime was busy is not a reason to send two
    // pings back to back; skip the backlog and carry on at the same cadence.
    ticker.set_missed_tick_behavior(MissedTickBehavior::Delay);

    loop {
        ticker.tick().await;
        if health.send(()).await.is_err() {
            error!("[mmorpg-server/agones] health stream closed — the sidecar is gone");
            return;
        }
    }
}

/// Tell Agones this server is finished so the controller can recycle the slot
/// instead of waiting for the pod to be reaped.
pub async fn shutdown() {
    match agones::Sdk::new(None, None).await {
        Ok(mut sdk) => {
            if let Err(e) = sdk.shutdown().await {
                warn!(error = %e, "[mmorpg-server/agones] Shutdown() failed");
            } else {
                info!("[mmorpg-server/agones] Shutdown() sent");
            }
        }
        Err(_) => {
            // Same as above: no sidecar, nothing to tell.
        }
    }
}
