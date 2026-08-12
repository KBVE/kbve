use std::time::Duration;

use tokio::time::{MissedTickBehavior, interval};
use tracing::{error, info, warn};

const HEALTH_PING_INTERVAL: Duration = Duration::from_secs(2);

pub async fn run_health_loop() {
    let mut sdk = match agones::Sdk::new(None, None).await {
        Ok(sdk) => {
            info!("[friendslop-server/agones] Connected to Agones SDK sidecar");
            sdk
        }
        Err(e) => {
            warn!(error = %e, "[friendslop-server/agones] Agones SDK unavailable — running outside Agones (local dev?)");
            return;
        }
    };

    if let Err(e) = sdk.ready().await {
        error!(error = %e, "[friendslop-server/agones] Failed to mark gameserver Ready");
        return;
    }
    info!("[friendslop-server/agones] GameServer marked Ready");

    let health_tx = sdk.health_check();
    let mut ticker = interval(HEALTH_PING_INTERVAL);
    ticker.set_missed_tick_behavior(MissedTickBehavior::Skip);

    loop {
        ticker.tick().await;
        if health_tx.send(()).await.is_err() {
            error!("[friendslop-server/agones] Health channel closed — sidecar gone");
            return;
        }
    }
}

pub async fn shutdown() {
    let mut sdk = match agones::Sdk::new(None, None).await {
        Ok(sdk) => sdk,
        Err(e) => {
            warn!(error = %e, "[friendslop-server/agones] Skipping graceful Shutdown — SDK unreachable");
            return;
        }
    };
    if let Err(e) = sdk.shutdown().await {
        warn!(error = %e, "[friendslop-server/agones] Shutdown call failed");
    } else {
        info!("[friendslop-server/agones] Shutdown signal sent to Agones");
    }
}
