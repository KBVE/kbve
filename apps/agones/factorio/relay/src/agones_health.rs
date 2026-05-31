use std::time::Duration;

use anyhow::Result;
use tokio::{net::TcpStream, time};
use tracing::{debug, warn};

use crate::config::Config;

pub async fn run(cfg: Config) -> Result<()> {
    let Some(sdk_base) = cfg.agones_sdk_http.clone() else {
        warn!("agones_health disabled: AGONES_SDK_HTTP not set");
        return Ok(());
    };

    let health_url = format!("{}/health", sdk_base.trim_end_matches('/'));
    let ready_url = format!("{}/ready", sdk_base.trim_end_matches('/'));
    let interval = Duration::from_secs(cfg.agones_health_interval_secs);
    let rcon_probe_timeout = Duration::from_secs(cfg.agones_rcon_probe_timeout_secs);
    let initial_delay = Duration::from_secs(cfg.agones_initial_ready_delay_secs);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()?;

    debug!(
        sdk = %sdk_base,
        interval_secs = cfg.agones_health_interval_secs,
        rcon = %cfg.rcon_addr,
        initial_delay_secs = cfg.agones_initial_ready_delay_secs,
        "agones_health starting"
    );

    let mut sent_ready = false;
    let started = time::Instant::now();
    let mut ticker = time::interval(interval);
    ticker.set_missed_tick_behavior(time::MissedTickBehavior::Delay);

    loop {
        ticker.tick().await;

        let rcon_ok = matches!(
            time::timeout(rcon_probe_timeout, TcpStream::connect(cfg.rcon_addr)).await,
            Ok(Ok(_))
        );

        if !rcon_ok {
            debug!(rcon = %cfg.rcon_addr, "rcon probe failed; skipping Agones heartbeat");
            continue;
        }

        if let Err(e) = client.post(&health_url).body("{}").send().await {
            warn!(url = %health_url, error = %e, "Agones /health POST failed");
            continue;
        }
        debug!(url = %health_url, "Agones /health heartbeat sent");

        if !sent_ready && started.elapsed() >= initial_delay {
            match client.post(&ready_url).body("{}").send().await {
                Ok(_) => {
                    sent_ready = true;
                    debug!(url = %ready_url, "Agones /ready posted from relay");
                }
                Err(e) => {
                    warn!(url = %ready_url, error = %e, "Agones /ready POST failed; will retry");
                }
            }
        }
    }
}
