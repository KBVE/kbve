use serde::{Deserialize, Serialize};

/// Configuration for connecting to an IRC server.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IrcConfig {
    /// IRC server hostname (e.g. "irc.kbve.internal").
    pub host: String,
    /// IRC server port (default: 6667, or 6697 for TLS).
    pub port: u16,
    /// Whether to use TLS.
    pub tls: bool,
    /// Nickname for this client (e.g. "mud-abc123", "iso-player42").
    pub nick: String,
    /// Channels to auto-join on connect (e.g. ["#global", "#world-events"]).
    pub channels: Vec<String>,
    /// Optional server password.
    pub password: Option<String>,
    /// Reconnect delay in seconds after disconnect (0 = no reconnect).
    pub reconnect_delay_secs: u64,
}

impl Default for IrcConfig {
    fn default() -> Self {
        Self {
            host: "localhost".to_owned(),
            port: 6667,
            tls: false,
            nick: "bevy-chat".to_owned(),
            channels: vec!["#global".to_owned()],
            password: None,
            reconnect_delay_secs: 5,
        }
    }
}

impl IrcConfig {
    /// Create a config from environment variables.
    ///
    /// | Env var | Default |
    /// |---------|---------|
    /// | `IRC_HOST` | `localhost` |
    /// | `IRC_PORT` | `6667` |
    /// | `IRC_TLS` | `false` |
    /// | `IRC_NICK` | `bevy-chat` |
    /// | `IRC_CHANNELS` | `#global` (comma-separated) |
    /// | `IRC_PASSWORD` | none |
    /// | `IRC_RECONNECT_DELAY` | `5` |
    pub fn from_env() -> Self {
        let host = std::env::var("IRC_HOST").unwrap_or_else(|_| "localhost".to_owned());
        let port: u16 = std::env::var("IRC_PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(6667);
        let tls = std::env::var("IRC_TLS")
            .map(|v| v == "true" || v == "1")
            .unwrap_or(false);
        let nick = std::env::var("IRC_NICK").unwrap_or_else(|_| "bevy-chat".to_owned());
        let channels: Vec<String> = std::env::var("IRC_CHANNELS")
            .unwrap_or_else(|_| "#global".to_owned())
            .split(',')
            .map(|s| s.trim().to_owned())
            .filter(|s| !s.is_empty())
            .collect();
        let password = std::env::var("IRC_PASSWORD").ok();
        let reconnect_delay_secs: u64 = std::env::var("IRC_RECONNECT_DELAY")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(5);

        Self {
            host,
            port,
            tls,
            nick,
            channels,
            password,
            reconnect_delay_secs,
        }
    }
}
