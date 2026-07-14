//! Shared ergo connection config + IRC line parsing.
//!
//! The gateway opens several independent ergo connections (one per minechat
//! session, one per history listener, the raw IRC proxy). They all read the
//! same env vars and parse the same `PRIVMSG` shape, so the host/port lookup
//! and the parser live here instead of being copy-pasted per task.

use std::time::Duration;

use tokio::io::AsyncWriteExt;
use tokio::net::TcpStream;
use tokio::time::sleep;

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

/// Open a throwaway ergo connection, register as `conn_nick`, join `channel`,
/// and send a single pre-built `PRIVMSG` line (e.g. a gateway announcement).
/// Used by the staff moderation endpoint; the message rides the normal
/// envelope wire form so the history listener and live clients pick it up.
pub async fn announce(channel: &str, conn_nick: &str, privmsg_line: &str) -> std::io::Result<()> {
    let safe: String = conn_nick
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .take(16)
        .collect();
    let safe = if safe.is_empty() { "mod".into() } else { safe };

    let stream = connect_irc().await?;
    let (_r, mut w) = stream.into_split();
    write_line(&mut w, &format!("NICK {safe}")).await?;
    write_line(&mut w, &format!("USER {safe} 0 * :gateway announce")).await?;
    write_line(&mut w, &format!("JOIN {channel}")).await?;
    write_line(&mut w, privmsg_line).await?;
    w.flush().await?;
    // Let ergo relay to channel members before the socket drops.
    sleep(Duration::from_millis(200)).await;
    Ok(())
}

async fn write_line(w: &mut tokio::net::tcp::OwnedWriteHalf, line: &str) -> std::io::Result<()> {
    w.write_all(line.as_bytes()).await?;
    w.write_all(b"\r\n").await?;
    w.flush().await
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
