//! Shared ergo connection config + IRC line parsing.
//!
//! The gateway opens several independent ergo connections (one per minechat
//! session, one per history listener, the raw IRC proxy). They all read the
//! same env vars and parse the same `PRIVMSG` shape, so the host/port lookup
//! and the parser live here instead of being copy-pasted per task.

use tokio::net::TcpStream;

const DEFAULT_HOST: &str = "ergo-irc-service.irc.svc.cluster.local";
const DEFAULT_IRC_PORT: u16 = 6667;
const DEFAULT_WS_URL: &str = "ws://ergo-irc-service.irc.svc.cluster.local:8080";

/// ergo IRC host from `ERGO_IRC_HOST`, defaulting to the in-cluster service.
pub fn irc_host() -> String {
    std::env::var("ERGO_IRC_HOST").unwrap_or_else(|_| DEFAULT_HOST.into())
}

/// ergo IRC port from `ERGO_IRC_PORT`, defaulting to 6667.
pub fn irc_port() -> u16 {
    std::env::var("ERGO_IRC_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(DEFAULT_IRC_PORT)
}

/// ergo WebSocket URL from `ERGO_WS_URL`.
pub fn ws_url() -> String {
    std::env::var("ERGO_WS_URL").unwrap_or_else(|_| DEFAULT_WS_URL.into())
}

/// Open a TCP connection to ergo's IRC port using the configured host/port.
pub async fn connect_irc() -> std::io::Result<TcpStream> {
    TcpStream::connect(format!("{}:{}", irc_host(), irc_port())).await
}

/// Parse `:nick!user@host PRIVMSG #channel :payload` → `(sender, channel,
/// payload)`. `sender` is the IRC nick from the prefix (empty when absent),
/// used for the plain-IRC fallback. Returns `None` for any other IRC line.
pub fn parse_privmsg(line: &str) -> Option<(String, String, String)> {
    let (sender, rest) = if let Some(r) = line.strip_prefix(':') {
        let (prefix, rest) = r.split_once(' ')?;
        let nick = prefix.split(['!', '@']).next().unwrap_or(prefix);
        (nick.to_string(), rest)
    } else {
        (String::new(), line)
    };
    let mut parts = rest.splitn(3, ' ');
    if parts.next()? != "PRIVMSG" {
        return None;
    }
    let channel = parts.next()?.to_string();
    let trailing = parts.next()?;
    let payload = trailing.strip_prefix(':').unwrap_or(trailing).to_string();
    Some((sender, channel, payload))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_simple_privmsg() {
        let (sender, channel, payload) =
            parse_privmsg(":bob!u@h PRIVMSG #general :hello world").unwrap();
        assert_eq!(sender, "bob");
        assert_eq!(channel, "#general");
        assert_eq!(payload, "hello world");
    }

    #[test]
    fn handles_missing_prefix() {
        let (sender, channel, payload) = parse_privmsg("PRIVMSG #t :hi").unwrap();
        assert_eq!(sender, "");
        assert_eq!(channel, "#t");
        assert_eq!(payload, "hi");
    }

    #[test]
    fn ignores_non_privmsg() {
        assert!(parse_privmsg(":srv 001 nick :welcome").is_none());
        assert!(parse_privmsg("PING :token").is_none());
    }
}
