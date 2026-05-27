mod ch_writer;
mod config;
mod event;
mod irc_bridge;
mod log_tail;
mod rcon_client;

use anyhow::Result;
use tokio::sync::{broadcast, mpsc};
use tracing::info;

use crate::config::Config;
use crate::event::{GameEvent, IrcMessage};

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
                tracing_subscriber::EnvFilter::new("info,agones_factorio_relay=debug")
            }),
        )
        .init();

    let cfg = Config::from_env()?;
    info!(
        log_path = %cfg.console_log_path.display(),
        rcon = %cfg.rcon_addr,
        irc_server = %cfg.irc_server,
        irc_channel = %cfg.irc_channel,
        server_id = %cfg.server_id,
        clickhouse = %cfg.clickhouse_url.as_deref().unwrap_or("<unset>"),
        "agones-factorio-relay starting"
    );

    let (game_tx, _) = broadcast::channel::<GameEvent>(512);
    let (irc_in_tx, irc_in_rx) = mpsc::channel::<IrcMessage>(512);

    let tail_handle = tokio::spawn(log_tail::run(cfg.clone(), game_tx.clone()));
    let irc_handle = tokio::spawn(irc_bridge::run(cfg.clone(), game_tx.subscribe(), irc_in_tx));
    let rcon_handle = tokio::spawn(rcon_client::run(cfg.clone(), irc_in_rx));
    let ch_handle = tokio::spawn(ch_writer::run(cfg.clone(), game_tx.subscribe()));

    drop(game_tx);

    tokio::select! {
        r = tail_handle => r??,
        r = irc_handle => r??,
        r = rcon_handle => r??,
        r = ch_handle => r??,
        _ = tokio::signal::ctrl_c() => {
            info!("ctrl_c received, shutting down");
        }
    }
    Ok(())
}
