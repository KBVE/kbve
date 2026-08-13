use std::sync::Arc;
use std::time::Duration;

use q::net::dual::DualHost;
use tokio::time::{MissedTickBehavior, interval};
use tracing::{error, info, warn};

const HEALTH_PING_INTERVAL: Duration = Duration::from_secs(2);

/// Name of the UDP port in the Fleet's `spec.ports`.
const UDP_PORT_NAME: &str = "udp";

pub async fn run_health_loop(transport: Arc<DualHost>, advertise: bool) {
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

    if advertise {
        match sdk.get_gameserver().await {
            Ok(gs) => match gs.status {
                Some(status) => {
                    let mapped = status
                        .ports
                        .iter()
                        .find(|p| p.name == UDP_PORT_NAME)
                        .map(|p| p.port as u16);
                    let host = (!status.address.is_empty()).then(|| status.address.clone());
                    match (host.as_deref(), mapped) {
                        (Some(h), Some(port)) => {
                            info!(
                                host = h,
                                port, "[friendslop-server/agones] advertising udp endpoint"
                            )
                        }
                        _ => warn!(
                            address = %status.address,
                            "[friendslop-server/agones] no `{UDP_PORT_NAME}` port published; clients will fall back to the reliable lane"
                        ),
                    }
                    transport.advertise_udp(host, mapped);
                }
                None => warn!("[friendslop-server/agones] GameServer has no status yet"),
            },
            Err(e) => {
                warn!(error = %e, "[friendslop-server/agones] could not read GameServer; udp endpoint not advertised")
            }
        }
    }

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
