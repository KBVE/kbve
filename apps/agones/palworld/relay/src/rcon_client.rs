#![allow(dead_code)]
use anyhow::Result;
use tokio::sync::mpsc::Receiver;
use tracing::{debug, info, warn};

use crate::config::Config;
use crate::event::IrcMessage;
use crate::rcon_pool::RconPool;

pub async fn run(_cfg: Config, pool: RconPool, mut rx: Receiver<IrcMessage>) -> Result<()> {
    info!("rcon_client started — bridging IRC -> game console (parity, unused by default)");

    while let Some(msg) = rx.recv().await {
        let line = sanitize(&crate::irc_bridge::format_incoming(&msg.nick, &msg.text));
        let cmd = format!("broadcast {line}");
        debug!(?msg, "rcon broadcast(...)");
        if let Err(e) = pool.exec(&cmd).await {
            warn!(error = %e, "rcon exec failed for irc bridge message");
        }
    }
    Ok(())
}

fn sanitize(s: &str) -> String {
    s.chars().filter(|c| !c.is_control()).collect()
}
