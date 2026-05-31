pub mod ch;
pub mod poller;
pub mod state;

use anyhow::Result;
use tokio::sync::mpsc;
use tracing::{info, warn};

use crate::config::Config;
use crate::rcon_pool::RconPool;
use crate::sim_director::state::SimSnapshot;

pub async fn run(cfg: Config, pool: RconPool) -> Result<()> {
    if !cfg.sim_director_enabled {
        info!("sim_director disabled via SIM_DIRECTOR_ENABLED=false");
        return Ok(());
    }

    info!(
        poll_interval_secs = cfg.sim_poll_interval_secs,
        dry_run = cfg.sim_dry_run,
        "sim_director starting"
    );

    let (snap_tx, snap_rx) = mpsc::channel::<SimSnapshot>(64);

    let poll_handle = tokio::spawn(poller::run(cfg.clone(), pool, snap_tx));
    let ch_handle = tokio::spawn(ch::run(cfg.clone(), snap_rx));

    tokio::select! {
        r = poll_handle => {
            warn!("sim_director poller exited");
            r??;
        }
        r = ch_handle => {
            warn!("sim_director ch writer exited");
            r??;
        }
    }
    Ok(())
}
