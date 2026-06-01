use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpStream;
use tokio::sync::{Mutex, broadcast, mpsc};

use crate::config::{IrcConfig, IrcTransport};
use crate::message::ChatMessage;

/// Async IRC client that connects to a server, joins channels, and
/// sends/receives structured game messages.
///
/// This client is headless — it uses only tokio, no Bevy dependencies.
/// Both the Discord bot and the isometric game server use it directly via
/// the TCP transport; the isometric desktop client opts into the WebSocket
/// transport to share the same `wss://chat.kbve.com` endpoint as the WASM
/// browser build.
#[derive(Clone)]
pub struct ChatClient {
    config: IrcConfig,
    tx: broadcast::Sender<ChatMessage>,
    writer: Arc<Mutex<Option<Writer>>>,
}

enum Writer {
    Tcp(tokio::io::WriteHalf<TcpStream>),
    Ws(mpsc::UnboundedSender<String>),
}

impl ChatClient {
    /// Create a new client from config. Does NOT connect yet — call [`connect`].
    pub fn new(config: IrcConfig) -> Self {
        let (tx, _) = broadcast::channel(256);
        Self {
            config,
            tx,
            writer: Arc::new(Mutex::new(None)),
        }
    }

    /// Create a client from environment variables and connect.
    pub async fn from_env() -> Result<Self, String> {
        let config = IrcConfig::from_env();
        let mut client = Self::new(config);
        client.connect().await?;
        Ok(client)
    }

    /// Subscribe to incoming messages. Returns a broadcast receiver.
    pub fn subscribe(&self) -> broadcast::Receiver<ChatMessage> {
        self.tx.subscribe()
    }

    /// Connect to the IRC server, register, and join configured channels.
    /// Branches on `IrcConfig.transport` so the same `ChatClient` API works
    /// for both raw-TCP IRC servers (bot, lightyear) and WebSocket
    /// gateways (`wss://chat.kbve.com`).
    pub async fn connect(&mut self) -> Result<(), String> {
        match self.config.transport {
            IrcTransport::Tcp => self.connect_tcp().await,
            IrcTransport::WebSocket => self.connect_ws().await,
        }
    }

    async fn connect_tcp(&mut self) -> Result<(), String> {
        let addr = format!("{}:{}", self.config.host, self.config.port);
        tracing::info!("IRC connecting to {} (tcp)", addr);

        let stream = TcpStream::connect(&addr)
            .await
            .map_err(|e| format!("IRC connect failed: {}", e))?;

        let (reader, writer) = tokio::io::split(stream);

        {
            let mut w = self.writer.lock().await;
            *w = Some(Writer::Tcp(writer));
        }

        if let Some(ref pass) = self.config.password {
            self.send_raw(&format!("PASS {}", pass)).await?;
        }
        self.send_raw(&format!("NICK {}", self.config.nick)).await?;
        self.send_raw(&format!("USER {} 0 * :bevy_chat client", self.config.nick))
            .await?;

        for channel in &self.config.channels {
            self.send_raw(&format!("JOIN {}", channel)).await?;
        }

        tracing::info!(
            "IRC registered as {} on {} channels (tcp)",
            self.config.nick,
            self.config.channels.len()
        );

        let tx = self.tx.clone();
        let nick = self.config.nick.clone();
        let writer_clone = self.writer.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(reader).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if line.starts_with("PING") {
                    let pong = line.replacen("PING", "PONG", 1);
                    if let Some(Writer::Tcp(ref mut w)) = *writer_clone.lock().await {
                        let _ = w.write_all(format!("{}\r\n", pong).as_bytes()).await;
                    }
                    continue;
                }
                if let Some(privmsg) = parse_privmsg(&line, &nick) {
                    let _ = tx.send(privmsg);
                }
            }
            tracing::warn!("IRC read loop ended (tcp)");
        });

        Ok(())
    }

    async fn connect_ws(&mut self) -> Result<(), String> {
        use futures_util::{SinkExt, StreamExt};
        use tokio_tungstenite::tungstenite::Message as WsMessage;

        // `host` may already be a full ws:// or wss:// URL, or a bare
        // hostname. Default to wss:// so production chat.kbve.com works
        // out of the box; `tls = false` forces plain ws:// for local dev.
        let url = if self.config.host.starts_with("ws://") || self.config.host.starts_with("wss://")
        {
            self.config.host.clone()
        } else if self.config.tls {
            format!("wss://{}", self.config.host)
        } else {
            format!("ws://{}", self.config.host)
        };
        tracing::info!("IRC connecting to {} (websocket)", url);

        let (ws, _resp) = tokio_tungstenite::connect_async(&url)
            .await
            .map_err(|e| format!("IRC-WS connect failed: {}", e))?;
        let (mut sink, mut stream) = ws.split();

        let (out_tx, mut out_rx) = mpsc::unbounded_channel::<String>();

        // Outbound pump — every send_raw call hands a CRLF-terminated line
        // to the channel; this task forwards it as a single WebSocket text
        // frame so the IRC gateway sees one complete command per frame.
        tokio::spawn(async move {
            while let Some(line) = out_rx.recv().await {
                if sink.send(WsMessage::Text(line)).await.is_err() {
                    break;
                }
            }
            tracing::warn!("IRC-WS outbound pump ended");
        });

        {
            let mut w = self.writer.lock().await;
            *w = Some(Writer::Ws(out_tx));
        }

        if !self.config.skip_registration {
            if let Some(ref pass) = self.config.password {
                self.send_raw(&format!("PASS {}", pass)).await?;
            }
            self.send_raw(&format!("NICK {}", self.config.nick)).await?;
            self.send_raw(&format!(
                "USER {} 0 * :bevy_chat ws client",
                self.config.nick
            ))
            .await?;
        }

        for channel in &self.config.channels {
            self.send_raw(&format!("JOIN {}", channel)).await?;
        }

        tracing::info!(
            "IRC {} {} on {} channels (websocket)",
            if self.config.skip_registration {
                "joined as gateway-registered user"
            } else {
                "registered as"
            },
            self.config.nick,
            self.config.channels.len()
        );

        // Periodic IRC PING so idle WS connections don't get reset by the
        // gateway or upstream Ergo after ~60-120s of silence.
        let writer_keepalive = self.writer.clone();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(std::time::Duration::from_secs(45));
            interval.tick().await; // skip the immediate first tick
            loop {
                interval.tick().await;
                let Some(Writer::Ws(ref out)) = *writer_keepalive.lock().await else {
                    break;
                };
                if out.send("PING :keepalive\r\n".to_owned()).is_err() {
                    break;
                }
            }
            tracing::warn!("IRC-WS keepalive task ended");
        });

        let tx = self.tx.clone();
        let nick = self.config.nick.clone();
        let writer_clone = self.writer.clone();
        tokio::spawn(async move {
            while let Some(item) = stream.next().await {
                let payload = match item {
                    Ok(WsMessage::Text(t)) => t.to_string(),
                    Ok(WsMessage::Binary(b)) => match String::from_utf8(b.to_vec()) {
                        Ok(s) => s,
                        Err(_) => continue,
                    },
                    Ok(WsMessage::Ping(_)) | Ok(WsMessage::Pong(_)) => continue,
                    Ok(WsMessage::Close(_)) => break,
                    Ok(_) => continue,
                    Err(e) => {
                        tracing::warn!("IRC-WS read error: {e}");
                        break;
                    }
                };
                // chat.kbve.com sends each IRC line as a standalone WS frame
                // without CRLF; raw-TCP gateways batch multiple lines per
                // frame. Handle both shapes.
                let trimmed = payload
                    .trim_end_matches('\n')
                    .trim_end_matches('\r')
                    .to_string();
                let lines: Vec<String> = if trimmed.is_empty() {
                    Vec::new()
                } else if trimmed.contains('\n') {
                    trimmed
                        .split('\n')
                        .map(|s| s.trim_end_matches('\r').to_string())
                        .filter(|s| !s.is_empty())
                        .collect()
                } else {
                    vec![trimmed]
                };
                for line in &lines {
                    if line.starts_with("PING") {
                        let pong = line.replacen("PING", "PONG", 1);
                        if let Some(Writer::Ws(ref out)) = *writer_clone.lock().await {
                            let _ = out.send(format!("{}\r\n", pong));
                        }
                        continue;
                    }
                    if let Some(privmsg) = parse_privmsg(line, &nick) {
                        let _ = tx.send(privmsg);
                    }
                }
            }
            tracing::warn!("IRC read loop ended (websocket)");
        });

        Ok(())
    }

    /// Send a structured `ChatMessage` to its target channel.
    pub async fn send(&self, msg: &ChatMessage) -> Result<(), String> {
        let irc_line = msg.to_irc_privmsg();
        self.send_raw(&irc_line).await
    }

    /// Send a raw IRC line (with automatic CRLF).
    pub async fn send_raw(&self, line: &str) -> Result<(), String> {
        let mut w = self.writer.lock().await;
        let writer = w.as_mut().ok_or_else(|| "IRC not connected".to_owned())?;
        let framed = format!("{}\r\n", line);
        match writer {
            Writer::Tcp(stream) => stream
                .write_all(framed.as_bytes())
                .await
                .map_err(|e| format!("IRC send failed: {}", e)),
            Writer::Ws(tx) => tx
                .send(framed)
                .map_err(|e| format!("IRC-WS send failed: {}", e)),
        }
    }

    /// Whether the client has an active writer (connected).
    pub async fn is_connected(&self) -> bool {
        self.writer.lock().await.is_some()
    }

    /// Disconnect from the IRC server.
    pub async fn disconnect(&self) {
        let mut w = self.writer.lock().await;
        if let Some(writer) = w.as_mut() {
            match writer {
                Writer::Tcp(stream) => {
                    let _ = stream.write_all(b"QUIT :bevy_chat disconnecting\r\n").await;
                }
                Writer::Ws(tx) => {
                    let _ = tx.send("QUIT :bevy_chat disconnecting\r\n".to_owned());
                }
            }
        }
        *w = None;
    }
}

/// Parse a raw IRC PRIVMSG line into a `ChatMessage`.
/// Ignores messages from ourselves (nick match).
fn parse_privmsg(line: &str, own_nick: &str) -> Option<ChatMessage> {
    let line = line.strip_prefix(':')?;
    let (prefix, rest) = line.split_once(' ')?;
    let sender_nick = prefix.split('!').next()?;
    if sender_nick == own_nick {
        return None;
    }
    let rest = rest.strip_prefix("PRIVMSG ")?;
    let (channel, message) = rest.split_once(" :")?;
    ChatMessage::from_irc_privmsg(channel, message)
        .or_else(|| Some(ChatMessage::chat(sender_nick, "irc", channel, message)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::message::MessageKind;

    #[test]
    fn parse_privmsg_chat() {
        let msg = parse_privmsg(
            ":Player1!user@host PRIVMSG #global :[CHAT] Player1@discord: hello",
            "bot-nick",
        )
        .unwrap();
        assert_eq!(msg.kind, MessageKind::Chat);
        assert_eq!(msg.sender, "Player1");
        assert_eq!(msg.platform, "discord");
        assert_eq!(msg.channel, "#global");
        assert_eq!(msg.content, "hello");
    }

    #[test]
    fn parse_privmsg_raw_fallback() {
        let msg = parse_privmsg(
            ":Someone!user@host PRIVMSG #global :just a plain message",
            "bot-nick",
        )
        .unwrap();
        assert_eq!(msg.kind, MessageKind::Chat);
        assert_eq!(msg.sender, "Someone");
        assert_eq!(msg.platform, "irc");
        assert_eq!(msg.content, "just a plain message");
    }

    #[test]
    fn parse_privmsg_ignores_self() {
        let msg = parse_privmsg(
            ":bot-nick!user@host PRIVMSG #global :my own echo",
            "bot-nick",
        );
        assert!(msg.is_none());
    }

    #[test]
    fn parse_privmsg_event() {
        let msg = parse_privmsg(
            ":mud-abc!user@host PRIVMSG #world-events :[EVENT:KILL] Hero@discord: slew the boss",
            "iso-42",
        )
        .unwrap();
        assert_eq!(msg.kind, MessageKind::Kill);
        assert_eq!(msg.sender, "Hero");
        assert_eq!(msg.channel, "#world-events");
    }
}
