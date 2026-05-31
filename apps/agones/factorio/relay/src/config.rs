use anyhow::{Context, Result};
use std::{net::SocketAddr, path::PathBuf};

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct Config {
    pub console_log_path: PathBuf,
    pub rcon_addr: SocketAddr,
    pub rcon_password: String,
    pub irc_server: String,
    pub irc_port: u16,
    pub irc_use_tls: bool,
    pub irc_nick: String,
    pub irc_channel: String,
    pub irc_password: Option<String>,
    pub server_id: String,
    pub scenario_default: String,
    pub clickhouse_url: Option<String>,
    pub clickhouse_user: Option<String>,
    pub clickhouse_password: Option<String>,
    pub clickhouse_database: String,
    pub agones_sdk_http: Option<String>,
    pub agones_health_interval_secs: u64,
    pub agones_rcon_probe_timeout_secs: u64,
    pub agones_initial_ready_delay_secs: u64,
    pub sim_director_enabled: bool,
    pub sim_poll_interval_secs: u64,
    pub sim_rcon_rate_limit_qps: u32,
    pub sim_dry_run: bool,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        Ok(Self {
            console_log_path: std::env::var("FACTORIO_CONSOLE_LOG")
                .unwrap_or_else(|_| "/shared/log/console.log".into())
                .into(),
            rcon_addr: std::env::var("FACTORIO_RCON_ADDR")
                .unwrap_or_else(|_| "127.0.0.1:27015".into())
                .parse()
                .context("FACTORIO_RCON_ADDR not a valid socket address")?,
            rcon_password: std::env::var("FACTORIO_RCON_PASSWORD")
                .context("FACTORIO_RCON_PASSWORD env var is required")?,
            irc_server: std::env::var("IRC_SERVER").unwrap_or_else(|_| "irc.kbve.com".into()),
            irc_port: parse_env_u16("IRC_PORT", 6697)?,
            irc_use_tls: parse_env_bool("IRC_USE_TLS", true),
            irc_nick: std::env::var("IRC_NICK").unwrap_or_else(|_| "factorio-bot".into()),
            irc_channel: std::env::var("IRC_CHANNEL").unwrap_or_else(|_| "#general".into()),
            irc_password: std::env::var("IRC_PASSWORD").ok(),
            server_id: std::env::var("FACTORIO_SERVER_ID")
                .unwrap_or_else(|_| "factorio-default".into()),
            scenario_default: std::env::var("FACTORIO_SCENARIO_DEFAULT")
                .unwrap_or_else(|_| "kbve".into()),
            clickhouse_url: std::env::var("CLICKHOUSE_URL").ok(),
            clickhouse_user: std::env::var("CLICKHOUSE_USER").ok(),
            clickhouse_password: std::env::var("CLICKHOUSE_PASSWORD").ok(),
            clickhouse_database: std::env::var("CLICKHOUSE_DATABASE")
                .unwrap_or_else(|_| "gameops".into()),
            agones_sdk_http: std::env::var("AGONES_SDK_HTTP").ok(),
            agones_health_interval_secs: parse_env_u64("AGONES_HEALTH_INTERVAL_SECS", 5)?,
            agones_rcon_probe_timeout_secs: parse_env_u64("AGONES_RCON_PROBE_TIMEOUT_SECS", 2)?,
            agones_initial_ready_delay_secs: parse_env_u64("AGONES_INITIAL_READY_DELAY_SECS", 0)?,
            sim_director_enabled: parse_env_bool("SIM_DIRECTOR_ENABLED", true),
            sim_poll_interval_secs: parse_env_u64("SIM_POLL_INTERVAL_SECS", 10)?,
            sim_rcon_rate_limit_qps: parse_env_u32("SIM_RCON_RATE_LIMIT_QPS", 4)?,
            sim_dry_run: parse_env_bool("SIM_DRY_RUN", false),
        })
    }
}

fn parse_env_u32(name: &str, default: u32) -> Result<u32> {
    match std::env::var(name).ok() {
        Some(s) => s.parse().with_context(|| format!("{name} not a u32")),
        None => Ok(default),
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
