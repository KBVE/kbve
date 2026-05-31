use std::time::Duration;

use anyhow::Result;
use reqwest::Client;
use serde_json::json;
use tokio::sync::mpsc;
use tracing::{debug, info, warn};

use crate::config::Config;
use crate::sim_director::state::SimSnapshot;

pub async fn run(cfg: Config, mut rx: mpsc::Receiver<SimSnapshot>) -> Result<()> {
    let Some(ch_base) = cfg.clickhouse_url.clone() else {
        warn!("sim_director ch writer disabled: CLICKHOUSE_URL not set");
        while rx.recv().await.is_some() {}
        return Ok(());
    };

    let client = Client::builder().timeout(Duration::from_secs(10)).build()?;

    let table = format!("{}.sim_snapshots_raw", cfg.clickhouse_database);
    let url = format!(
        "{}/?query=INSERT+INTO+{}+FORMAT+JSONEachRow",
        ch_base.trim_end_matches('/'),
        table,
    );

    info!(%url, dry_run = cfg.sim_dry_run, "sim_director ch writer started");

    while let Some(snap) = rx.recv().await {
        let row = json!({
            "ts": snap.captured_at.format("%Y-%m-%d %H:%M:%S%.3f").to_string(),
            "server_id": cfg.server_id,
            "tick": snap.tick,
            "evolution": snap.evolution,
            "players": snap.players,
            "pollution": snap.pollution,
            "ups": snap.ups,
        });

        if cfg.sim_dry_run {
            debug!(row = %row, "sim_director ch dry-run row");
            continue;
        }

        let mut req = client.post(&url).body(row.to_string());
        if let Some(u) = cfg.clickhouse_user.as_deref() {
            req = req.basic_auth(u, cfg.clickhouse_password.as_deref());
        }

        match req.send().await {
            Ok(resp) if resp.status().is_success() => {
                debug!(tick = snap.tick, "sim_director ch insert ok");
            }
            Ok(resp) => {
                let status = resp.status();
                let body = resp.text().await.unwrap_or_default();
                warn!(%status, %body, "sim_director ch insert non-2xx");
            }
            Err(e) => warn!(error = %e, "sim_director ch insert failed"),
        }
    }

    Ok(())
}
