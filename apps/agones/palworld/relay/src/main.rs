mod config;
mod event;
mod rest_client;
mod poller;
mod agones_health;

use anyhow::Result;

fn main() -> Result<()> {
    let _cfg = config::Config::from_env()?;
    Ok(())
}
