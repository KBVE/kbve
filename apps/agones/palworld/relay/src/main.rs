mod config;
mod event;

use anyhow::Result;

fn main() -> Result<()> {
    let _cfg = config::Config::from_env()?;
    Ok(())
}
