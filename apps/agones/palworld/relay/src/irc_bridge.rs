use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context, Result, bail};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpStream;
use tokio::sync::broadcast::Receiver;
use tokio::sync::broadcast::error::RecvError;
use tokio::time::sleep;
use tokio_rustls::TlsConnector;
use tokio_rustls::rustls::pki_types::ServerName;
use tokio_rustls::rustls::{ClientConfig, RootCertStore};
use tracing::{debug, info, warn};

use crate::config::Config;
use crate::event::{GameEvent, GameEventKind, IrcMessage};
use crate::rest_client::RestClient;

const RECONNECT_DELAY_SECS: u64 = 10;

pub async fn run(
    cfg: Config,
    mut game_rx: Receiver<GameEvent>,
    rest: Arc<RestClient>,
) -> Result<()> {
    info!(
        irc_server = %cfg.irc_server,
        irc_port = cfg.irc_port,
        channel = %cfg.irc_channel,
        nick = %cfg.irc_nick,
        tls = cfg.irc_use_tls,
        "irc_bridge starting"
    );

    let _ = tokio_rustls::rustls::crypto::ring::default_provider().install_default();

    let mut last_players: Option<u64> = None;

    loop {
        match run_session(&cfg, &mut game_rx, &rest, &mut last_players).await {
            Ok(()) => warn!("irc session ended cleanly"),
            Err(err) => warn!(error = %err, "irc session error"),
        }
        sleep(Duration::from_secs(RECONNECT_DELAY_SECS)).await;
    }
}

async fn run_session(
    cfg: &Config,
    game_rx: &mut Receiver<GameEvent>,
    rest: &Arc<RestClient>,
    last_players: &mut Option<u64>,
) -> Result<()> {
    let addr = format!("{}:{}", cfg.irc_server, cfg.irc_port);
    let tcp = TcpStream::connect(&addr)
        .await
        .with_context(|| format!("connecting to {addr}"))?;
    info!(%addr, "irc tcp connected");

    if cfg.irc_use_tls {
        let tls = connect_tls(cfg, tcp).await?;
        info!("irc tls handshake complete");
        run_protocol(cfg, tls, game_rx, rest, last_players).await
    } else {
        run_protocol(cfg, tcp, game_rx, rest, last_players).await
    }
}

async fn connect_tls(
    cfg: &Config,
    tcp: TcpStream,
) -> Result<tokio_rustls::client::TlsStream<TcpStream>> {
    let mut roots = RootCertStore::empty();
    roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
    let tls_cfg = ClientConfig::builder()
        .with_root_certificates(roots)
        .with_no_client_auth();
    let connector = TlsConnector::from(Arc::new(tls_cfg));
    let server_name = ServerName::try_from(cfg.irc_server.clone())
        .with_context(|| format!("invalid TLS server name: {}", cfg.irc_server))?;
    connector
        .connect(server_name, tcp)
        .await
        .context("irc tls handshake")
}

async fn run_protocol<S>(
    cfg: &Config,
    stream: S,
    game_rx: &mut Receiver<GameEvent>,
    rest: &Arc<RestClient>,
    last_players: &mut Option<u64>,
) -> Result<()>
where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin,
{
    let (read_half, mut write_half) = tokio::io::split(stream);
    let mut reader = BufReader::new(read_half);

    if let Some(pw) = &cfg.irc_password {
        write_line(&mut write_half, &format!("PASS {pw}")).await?;
    }
    write_line(&mut write_half, &format!("NICK {}", cfg.irc_nick)).await?;
    write_line(
        &mut write_half,
        &format!("USER {} 0 * :{}", cfg.irc_nick, cfg.irc_nick),
    )
    .await?;
    write_line(&mut write_half, &format!("JOIN {}", cfg.irc_channel)).await?;

    let mut line = String::new();
    loop {
        tokio::select! {
            n = reader.read_line(&mut line) => {
                let n = n.context("irc read")?;
                if n == 0 { bail!("irc connection closed"); }
                let trimmed = line.trim_end_matches(['\r', '\n']).to_string();
                line.clear();
                if trimmed.is_empty() { continue; }
                debug!(raw = %trimmed, "irc <-");

                if let Some(server) = trimmed.strip_prefix("PING ") {
                    write_line(&mut write_half, &format!("PONG {server}")).await?;
                    continue;
                }
                if let Some(msg) = parse_privmsg(&trimmed, &cfg.irc_channel, &cfg.irc_nick) {
                    let rest = rest.clone();
                    let announcement = format_incoming(&msg.nick, &msg.text);
                    tokio::spawn(async move {
                        if let Err(e) = rest.announce(&announcement).await {
                            warn!(error = %e, "irc -> announce failed");
                        }
                    });
                }
            }
            ev = game_rx.recv() => match ev {
                Ok(ev) => {
                    if let Some(text) = format_for_irc(&ev, last_players) {
                        let truncated = truncate(&text, 400);
                        write_line(&mut write_half, &format!("PRIVMSG {} :{}", cfg.irc_channel, truncated)).await?;
                    }
                }
                Err(RecvError::Lagged(n)) => {
                    warn!(skipped = n, "irc_bridge lagged on broadcast");
                }
                Err(RecvError::Closed) => bail!("game broadcast closed"),
            }
        }
    }
}

async fn write_line<W>(w: &mut W, line: &str) -> Result<()>
where
    W: tokio::io::AsyncWrite + Unpin,
{
    debug!(raw = %line, "irc ->");
    w.write_all(line.as_bytes()).await?;
    w.write_all(b"\r\n").await?;
    w.flush().await?;
    Ok(())
}

fn parse_privmsg(line: &str, expected_channel: &str, self_nick: &str) -> Option<IrcMessage> {
    let rest = line.strip_prefix(':')?;
    let (prefix, after_prefix) = rest.split_once(' ')?;
    let nick = prefix.split_once('!').map(|(n, _)| n).unwrap_or(prefix);
    if nick.eq_ignore_ascii_case(self_nick) {
        return None;
    }
    let after_cmd = after_prefix.strip_prefix("PRIVMSG ")?;
    let (target, payload) = after_cmd.split_once(' ')?;
    if !target.eq_ignore_ascii_case(expected_channel) {
        return None;
    }
    let text = payload.strip_prefix(':').unwrap_or(payload).to_string();
    Some(IrcMessage {
        nick: nick.to_string(),
        channel: target.to_string(),
        text,
    })
}

pub(crate) fn format_incoming(nick: &str, text: &str) -> String {
    if let Some(body) = text.strip_prefix("[CHAT] ") {
        if let Some((sender, rest)) = body.split_once(": ") {
            if !sender.is_empty() && !sender.contains(' ') {
                return format!("[{sender}] {rest}");
            }
        }
    }
    format!("[IRC {nick}] {text}")
}

fn format_for_irc(ev: &GameEvent, last_players: &mut Option<u64>) -> Option<String> {
    let _ = last_players;
    match ev.kind {
        GameEventKind::Chat => {
            let text = ev.text.trim();
            if text.is_empty() {
                return None;
            }
            match ev.player.as_deref() {
                Some(player) => Some(format!("<{player}> {text}")),
                None => Some(text.to_string()),
            }
        }
        GameEventKind::Join
        | GameEventKind::Leave
        | GameEventKind::Stats
        | GameEventKind::Command => None,
    }
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        return s.to_string();
    }
    let mut cut = max;
    while cut > 0 && !s.is_char_boundary(cut) {
        cut -= 1;
    }
    s[..cut].to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn ev(kind: GameEventKind, player: Option<&str>, text: &str) -> GameEvent {
        GameEvent {
            kind,
            player: player.map(String::from),
            text: text.to_string(),
            raw: String::new(),
            fields: HashMap::new(),
        }
    }

    #[test]
    fn chat_is_relayed() {
        let mut lp = None;
        let out = format_for_irc(&ev(GameEventKind::Chat, Some("Alice"), "hi"), &mut lp);
        assert_eq!(out, Some("<Alice> hi".to_string()));
    }

    #[test]
    fn join_leave_stats_are_dropped() {
        let mut lp = None;
        assert_eq!(
            format_for_irc(&ev(GameEventKind::Join, Some("Al"), ""), &mut lp),
            None
        );
        assert_eq!(
            format_for_irc(&ev(GameEventKind::Leave, Some("Al"), ""), &mut lp),
            None
        );
        let mut stats = ev(GameEventKind::Stats, None, "");
        stats.fields.insert("kind".into(), "snapshot".into());
        stats.fields.insert("players".into(), "3".into());
        assert_eq!(format_for_irc(&stats, &mut lp), None);
    }

    #[test]
    fn empty_chat_is_dropped() {
        let mut lp = None;
        assert_eq!(
            format_for_irc(&ev(GameEventKind::Chat, Some("Al"), "   "), &mut lp),
            None
        );
    }

    #[test]
    fn discord_relay_is_unwrapped() {
        assert_eq!(
            format_incoming("discordsh-bot", "[CHAT] Fudster@Discord: hello world"),
            "[Fudster@Discord] hello world"
        );
    }

    #[test]
    fn plain_irc_keeps_nick_prefix() {
        assert_eq!(
            format_incoming("Alice", "hey there"),
            "[IRC Alice] hey there"
        );
        assert_eq!(
            format_incoming("Alice", "note: this"),
            "[IRC Alice] note: this"
        );
    }
}
