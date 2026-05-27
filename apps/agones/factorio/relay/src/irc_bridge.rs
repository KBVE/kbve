use anyhow::Result;
use tokio::sync::broadcast::Receiver;
use tokio::sync::mpsc::Sender;
use tracing::{debug, warn};

use crate::config::Config;
use crate::event::{GameEvent, IrcMessage};

pub async fn run(
    cfg: Config,
    mut game_rx: Receiver<GameEvent>,
    _irc_in_tx: Sender<IrcMessage>,
) -> Result<()> {
    warn!(
        irc_server = %cfg.irc_server,
        irc_port = cfg.irc_port,
        channel = %cfg.irc_channel,
        nick = %cfg.irc_nick,
        "irc_bridge stubbed (Phase 3c) — events logged but not forwarded"
    );

    loop {
        match game_rx.recv().await {
            Ok(ev) => {
                debug!(?ev, "would forward to IRC");
            }
            Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                warn!(skipped = n, "irc_bridge lagged on broadcast");
            }
            Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
        }
    }
    Ok(())
}
