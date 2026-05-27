use anyhow::Result;
use tokio::sync::mpsc::Receiver;
use tracing::{debug, warn};

use crate::config::Config;
use crate::event::IrcMessage;

pub async fn run(cfg: Config, mut rx: Receiver<IrcMessage>) -> Result<()> {
    warn!(
        rcon = %cfg.rcon_addr,
        "rcon_client stubbed (Phase 3c) — incoming IRC messages logged only"
    );

    while let Some(msg) = rx.recv().await {
        debug!(?msg, "would issue RCON /silent-command game.print(...)");
    }
    Ok(())
}
