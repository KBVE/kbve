use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context, Result, bail};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpStream;
use tokio::sync::broadcast::Receiver;
use tokio::sync::broadcast::error::RecvError;
use tokio::sync::mpsc::Sender;
use tokio::time::sleep;
use tokio_rustls::TlsConnector;
use tokio_rustls::rustls::pki_types::ServerName;
use tokio_rustls::rustls::{ClientConfig, RootCertStore};
use tracing::{debug, info, warn};

use crate::config::Config;
use crate::event::{GameEvent, GameEventKind, IrcMessage};

const RECONNECT_DELAY_SECS: u64 = 10;

pub async fn run(
    cfg: Config,
    mut game_rx: Receiver<GameEvent>,
    irc_in_tx: Sender<IrcMessage>,
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

    loop {
        match run_session(&cfg, &mut game_rx, &irc_in_tx).await {
            Ok(()) => warn!("irc session ended cleanly"),
            Err(err) => warn!(error = %err, "irc session error"),
        }
        sleep(Duration::from_secs(RECONNECT_DELAY_SECS)).await;
    }
}

async fn run_session(
    cfg: &Config,
    game_rx: &mut Receiver<GameEvent>,
    irc_in_tx: &Sender<IrcMessage>,
) -> Result<()> {
    let addr = format!("{}:{}", cfg.irc_server, cfg.irc_port);
    let tcp = TcpStream::connect(&addr)
        .await
        .with_context(|| format!("connecting to {addr}"))?;
    info!(%addr, "irc tcp connected");

    if cfg.irc_use_tls {
        let tls = connect_tls(cfg, tcp).await?;
        info!("irc tls handshake complete");
        run_protocol(cfg, tls, game_rx, irc_in_tx).await
    } else {
        run_protocol(cfg, tcp, game_rx, irc_in_tx).await
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
    irc_in_tx: &Sender<IrcMessage>,
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
                    if let Err(e) = irc_in_tx.try_send(msg.clone()) {
                        warn!(error = %e, "irc -> rcon channel full or closed");
                    } else {
                        debug!(?msg, "irc -> game queued");
                    }
                }
            }
            ev = game_rx.recv() => match ev {
                Ok(ev) => {
                    if let Some(text) = format_for_irc(&ev) {
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

fn format_for_irc(ev: &GameEvent) -> Option<String> {
    match ev.kind {
        GameEventKind::Chat => {
            let player = ev.player.as_deref().unwrap_or("server");
            Some(format!("[CHAT] {player}@factorio: {}", ev.text))
        }
        GameEventKind::Join
        | GameEventKind::Leave
        | GameEventKind::Command
        | GameEventKind::Stats => None,
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
