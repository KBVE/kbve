mod agones_health;
mod ch_writer;
mod config;
mod event;
mod irc_bridge;
mod poller;
mod rest_client;

use anyhow::Result;

fn main() -> Result<()> {
    let _cfg = config::Config::from_env()?;
    Ok(())
}
