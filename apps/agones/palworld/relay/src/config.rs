use anyhow::{Context, Result};
use std::net::SocketAddr;

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct Config {
    pub rest_addr: String,
    pub admin_password: String,
    pub rcon_addr: SocketAddr,
    pub rcon_password: Option<String>,
    pub server_id: String,
    pub irc_server: String,
    pub irc_port: u16,
    pub irc_use_tls: bool,
    pub irc_nick: String,
    pub irc_channel: String,
    pub irc_password: Option<String>,
    pub clickhouse_url: Option<String>,
    pub clickhouse_user: Option<String>,
    pub clickhouse_password: Option<String>,
    pub clickhouse_database: String,
    pub agones_sdk_http: Option<String>,
    pub agones_health_interval_secs: u64,
    pub agones_rest_probe_timeout_secs: u64,
    pub agones_initial_ready_delay_secs: u64,
    pub poll_interval_secs: u64,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        Ok(Self {
            rest_addr: std::env::var("PALWORLD_REST_ADDR")
                .unwrap_or_else(|_| "http://127.0.0.1:8212".into()),
            admin_password: std::env::var("PALWORLD_ADMIN_PASSWORD")
                .context("PALWORLD_ADMIN_PASSWORD env var is required")?,
            rcon_addr: std::env::var("PALWORLD_RCON_ADDR")
                .unwrap_or_else(|_| "127.0.0.1:25575".into())
                .parse()
                .context("PALWORLD_RCON_ADDR not a valid socket address")?,
            rcon_password: std::env::var("PALWORLD_RCON_PASSWORD").ok(),
            server_id: std::env::var("PALWORLD_SERVER_ID")
                .unwrap_or_else(|_| "palworld-default".into()),
            irc_server: std::env::var("IRC_SERVER").unwrap_or_else(|_| "irc.kbve.com".into()),
            irc_port: parse_env_u16("IRC_PORT", 6697)?,
            irc_use_tls: parse_env_bool("IRC_USE_TLS", true),
            irc_nick: std::env::var("IRC_NICK").unwrap_or_else(|_| "palworld-bot".into()),
            irc_channel: std::env::var("IRC_CHANNEL").unwrap_or_else(|_| "#general".into()),
            irc_password: std::env::var("IRC_PASSWORD").ok(),
            clickhouse_url: std::env::var("CLICKHOUSE_URL").ok(),
            clickhouse_user: std::env::var("CLICKHOUSE_USER").ok(),
            clickhouse_password: std::env::var("CLICKHOUSE_PASSWORD").ok(),
            clickhouse_database: std::env::var("CLICKHOUSE_DATABASE")
                .unwrap_or_else(|_| "gameops".into()),
            agones_sdk_http: std::env::var("AGONES_SDK_HTTP").ok(),
            agones_health_interval_secs: parse_env_u64("AGONES_HEALTH_INTERVAL_SECS", 5)?,
            agones_rest_probe_timeout_secs: parse_env_u64("AGONES_REST_PROBE_TIMEOUT_SECS", 2)?,
            agones_initial_ready_delay_secs: parse_env_u64(
                "AGONES_INITIAL_READY_DELAY_SECS",
                60,
            )?,
            poll_interval_secs: parse_env_u64("PALWORLD_POLL_INTERVAL_SECS", 10)?,
        })
    }
}

fn parse_env_u64(name: &str, default: u64) -> Result<u64> {
    match std::env::var(name).ok() {
        Some(s) => s.parse().with_context(|| format!("{name} not a u64")),
        None => Ok(default),
    }
}

fn parse_env_u16(name: &str, default: u16) -> Result<u16> {
    match std::env::var(name).ok() {
        Some(s) => s.parse().with_context(|| format!("{name} not a u16")),
        None => Ok(default),
    }
}

fn parse_env_bool(name: &str, default: bool) -> bool {
    std::env::var(name)
        .ok()
        .map(|s| matches!(s.to_lowercase().as_str(), "true" | "1" | "yes" | "on"))
        .unwrap_or(default)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_apply_when_unset() {
        unsafe {
            std::env::set_var("PALWORLD_ADMIN_PASSWORD", "pw");
            std::env::remove_var("PALWORLD_REST_ADDR");
            std::env::remove_var("PALWORLD_POLL_INTERVAL_SECS");
        }
        let cfg = Config::from_env().unwrap();
        assert_eq!(cfg.rest_addr, "http://127.0.0.1:8212");
        assert_eq!(cfg.poll_interval_secs, 10);
        assert_eq!(cfg.agones_initial_ready_delay_secs, 60);
        assert_eq!(cfg.clickhouse_database, "gameops");
    }

    #[test]
    fn admin_password_required() {
        unsafe {
            std::env::remove_var("PALWORLD_ADMIN_PASSWORD");
        }
        assert!(Config::from_env().is_err());
    }
}
