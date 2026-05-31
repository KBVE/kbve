use std::time::Duration;

use anyhow::Result;
use tokio::sync::mpsc;
use tokio::time;
use tracing::{debug, warn};

use crate::config::Config;
use crate::rcon_pool::RconPool;
use crate::sim_director::state::SimSnapshot;

const SNAPSHOT_LUA: &str = "/silent-command \
rcon.print(game.table_to_json({\
tick=game.tick,\
evolution=game.forces.enemy.evolution_factor,\
players=#game.connected_players,\
pollution=game.get_pollution({0,0}),\
ups=game.speed,\
surfaces={[\"nauvis\"]=game.surfaces[\"nauvis\"].daytime}\
}))";

pub async fn run(cfg: Config, pool: RconPool, tx: mpsc::Sender<SimSnapshot>) -> Result<()> {
    let interval = Duration::from_secs(cfg.sim_poll_interval_secs.max(1));
    let mut ticker = time::interval(interval);
    ticker.set_missed_tick_behavior(time::MissedTickBehavior::Delay);
    ticker.tick().await;

    loop {
        ticker.tick().await;

        let body = match pool.exec(SNAPSHOT_LUA).await {
            Ok(b) => b,
            Err(e) => {
                warn!(error = %e, "sim_director snapshot exec failed");
                continue;
            }
        };

        if body.trim().is_empty() {
            debug!("sim_director snapshot returned empty body");
            continue;
        }

        let snap = match SimSnapshot::parse(&body) {
            Ok(s) => s,
            Err(e) => {
                warn!(error = %e, body = %body, "sim_director snapshot parse failed");
                continue;
            }
        };

        debug!(
            tick = snap.tick,
            evo = snap.evolution,
            players = snap.players,
            pollution = snap.pollution,
            ups = snap.ups,
            "sim_director snapshot"
        );

        if tx.send(snap).await.is_err() {
            warn!("sim_director ch channel closed");
            break;
        }
    }

    Ok(())
}
