use anyhow::Result;
use tokio::sync::broadcast::Receiver;
use tracing::{debug, warn};

use crate::config::Config;
use crate::event::GameEvent;

pub async fn run(cfg: Config, mut rx: Receiver<GameEvent>) -> Result<()> {
    if cfg.clickhouse_url.is_none() {
        warn!("ch_writer disabled: CLICKHOUSE_URL not set");
        loop {
            match rx.recv().await {
                Ok(_) => {}
                Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                Err(_) => continue,
            }
        }
        return Ok(());
    }

    warn!(
        url = %cfg.clickhouse_url.as_deref().unwrap_or(""),
        database = %cfg.clickhouse_database,
        "ch_writer stubbed (Phase 4d) — events logged but not inserted"
    );

    loop {
        match rx.recv().await {
            Ok(ev) => {
                debug!(?ev, "would insert into gameops.factorio_*");
            }
            Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                warn!(skipped = n, "ch_writer lagged on broadcast");
            }
            Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
        }
    }
    Ok(())
}
