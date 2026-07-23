use std::time::Duration;

use anyhow::Result;
use tokio::time;
use tracing::{debug, warn};

use crate::config::Config;
use crate::rest_client::RestClient;

pub async fn run(cfg: Config) -> Result<()> {
    let Some(sdk_base) = cfg.agones_sdk_http.clone() else {
        warn!("agones_health disabled: AGONES_SDK_HTTP not set");
        return Ok(());
    };

    let health_url = format!("{}/health", sdk_base.trim_end_matches('/'));
    let ready_url = format!("{}/ready", sdk_base.trim_end_matches('/'));
    let interval = Duration::from_secs(cfg.agones_health_interval_secs);
    let initial_delay = Duration::from_secs(cfg.agones_initial_ready_delay_secs);

    let probe = RestClient::new(
        cfg.rest_addr.clone(),
        cfg.admin_password.clone(),
        Duration::from_secs(cfg.agones_rest_probe_timeout_secs),
    )?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()?;

    let mut sent_ready = false;
    let mut rest_seen = false;
    let started = time::Instant::now();
    let mut ticker = time::interval(interval);
    ticker.set_missed_tick_behavior(time::MissedTickBehavior::Delay);

    loop {
        ticker.tick().await;

        let rest_ok = probe.info().await.is_ok();
        if rest_ok {
            rest_seen = true;
        }

        // Liveness heartbeat. Keep beating /health unconditionally until the
        // server has been up at least once, so Agones does not mark the
        // GameServer Unhealthy and kill the pod during the slow Windows-under-
        // Wine first boot (SteamCMD download + world-gen can exceed the health
        // grace window). Once the server has been ready, gate on REST so a
        // genuine post-boot crash is still detected as Unhealthy.
        if rest_seen && !rest_ok {
            debug!("post-boot REST probe failed; withholding Agones heartbeat");
            continue;
        }

        if let Err(e) = client.post(&health_url).body("{}").send().await {
            warn!(url = %health_url, error = %e, "Agones /health POST failed");
            continue;
        }
        debug!(rest_ok, "Agones /health heartbeat sent");

        if rest_ok && !sent_ready && started.elapsed() >= initial_delay {
            match client.post(&ready_url).body("{}").send().await {
                Ok(_) => {
                    sent_ready = true;
                    debug!(url = %ready_url, "Agones /ready posted from relay");
                }
                Err(e) => warn!(url = %ready_url, error = %e, "Agones /ready POST failed; will retry"),
            }
        }
    }
}
