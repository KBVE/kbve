use anyhow::Result;
use tokio::sync::mpsc::Receiver;
use tracing::{debug, info, warn};

use crate::config::Config;
use crate::event::IrcMessage;
use crate::rcon_pool::RconPool;

pub async fn run(_cfg: Config, pool: RconPool, mut rx: Receiver<IrcMessage>) -> Result<()> {
    info!("rcon_client started — bridging IRC -> game console");

    while let Some(msg) = rx.recv().await {
        let nick = sanitize_for_lua(&msg.nick);
        let text = sanitize_for_lua(&msg.text);
        let lua = format!("/silent-command game.print(\"[IRC {nick}] {text}\")");
        debug!(?msg, "rcon /silent-command game.print(...)");
        if let Err(e) = pool.exec(&lua).await {
            warn!(error = %e, "rcon exec failed for irc bridge message");
        }
    }
    Ok(())
}

fn sanitize_for_lua(s: &str) -> String {
    s.chars()
        .filter(|c| !c.is_control())
        .map(|c| match c {
            '"' => '\'',
            '\\' => '/',
            _ => c,
        })
        .collect()
}
