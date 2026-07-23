mod agones_health;
mod ch_writer;
mod chat_tail;
mod config;
mod event;
mod irc_bridge;
mod poller;
mod rcon_client;
mod rcon_pool;
mod rest_client;

use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use tokio::sync::broadcast;
use tracing::info;

use crate::config::Config;
use crate::event::GameEvent;
use crate::rest_client::RestClient;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
                tracing_subscriber::EnvFilter::new("info,agones_palworld_relay=debug")
            }),
        )
        .init();

    let cfg = Config::from_env()?;
    info!(
        rest = %cfg.rest_addr,
        irc_server = %cfg.irc_server,
        irc_channel = %cfg.irc_channel,
        server_id = %cfg.server_id,
        clickhouse = %cfg.clickhouse_url.as_deref().unwrap_or("<unset>"),
        "agones-palworld-relay starting"
    );

    let (game_tx, _) = broadcast::channel::<GameEvent>(512);
    let rest = Arc::new(RestClient::new(
        cfg.rest_addr.clone(),
        cfg.admin_password.clone(),
        Duration::from_secs(5),
    )?);

    let poller_handle = tokio::spawn(poller::run(cfg.clone(), game_tx.clone()));
    let chat_handle = tokio::spawn(chat_tail::run(cfg.clone(), game_tx.clone()));
    let irc_handle = tokio::spawn(irc_bridge::run(cfg.clone(), game_tx.subscribe(), rest.clone()));
    let ch_handle = tokio::spawn(ch_writer::run(cfg.clone(), game_tx.subscribe()));
    let agones_handle = tokio::spawn(agones_health::run(cfg.clone()));

    drop(game_tx);

    tokio::select! {
        r = poller_handle => r??,
        r = chat_handle => r??,
        r = irc_handle => r??,
        r = ch_handle => r??,
        r = agones_handle => r??,
        _ = tokio::signal::ctrl_c() => { info!("ctrl_c received, shutting down"); }
    }
    Ok(())
}
