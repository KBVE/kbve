use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpStream;
use tokio::sync::{Mutex, broadcast};

use crate::config::IrcConfig;
use crate::message::ChatMessage;

/// Async IRC client that connects to a server, joins channels, and
/// sends/receives structured game messages.
///
/// This client is headless — it uses only tokio, no Bevy dependencies.
/// Both the Discord bot and the isometric game server use it directly.
#[derive(Clone)]
pub struct ChatClient {
    config: IrcConfig,
    tx: broadcast::Sender<ChatMessage>,
    writer: Arc<Mutex<Option<tokio::io::WriteHalf<TcpStream>>>>,
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
    /// Spawns a background read loop that parses incoming PRIVMSG lines
    /// and broadcasts them as `ChatMessage` via the subscriber channel.
    pub async fn connect(&mut self) -> Result<(), String> {
        let addr = format!("{}:{}", self.config.host, self.config.port);
        tracing::info!("IRC connecting to {}", addr);

        let stream = TcpStream::connect(&addr)
            .await
            .map_err(|e| format!("IRC connect failed: {}", e))?;

        let (reader, writer) = tokio::io::split(stream);

        // Store writer for send operations
        {
            let mut w = self.writer.lock().await;
            *w = Some(writer);
        }

        // Send NICK and USER registration
        if let Some(ref pass) = self.config.password {
            self.send_raw(&format!("PASS {}", pass)).await?;
        }
        self.send_raw(&format!("NICK {}", self.config.nick)).await?;
        self.send_raw(&format!("USER {} 0 * :bevy_chat client", self.config.nick))
            .await?;

        // Join channels
        for channel in &self.config.channels {
            self.send_raw(&format!("JOIN {}", channel)).await?;
        }

        tracing::info!(
            "IRC registered as {} on {} channels",
            self.config.nick,
            self.config.channels.len()
        );

        // Spawn background read loop
        let tx = self.tx.clone();
        let nick = self.config.nick.clone();
        let writer_clone = self.writer.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(reader).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                // Handle PING/PONG keepalive
                if line.starts_with("PING") {
                    let pong = line.replacen("PING", "PONG", 1);
                    if let Some(ref mut w) = *writer_clone.lock().await {
                        let _ = w.write_all(format!("{}\r\n", pong).as_bytes()).await;
                    }
                    continue;
                }

                // Parse PRIVMSG: :nick!user@host PRIVMSG #channel :message
                if let Some(privmsg) = parse_privmsg(&line, &nick) {
                    let _ = tx.send(privmsg);
                }
            }
            tracing::warn!("IRC read loop ended");
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
        writer
            .write_all(format!("{}\r\n", line).as_bytes())
            .await
            .map_err(|e| format!("IRC send failed: {}", e))
    }

    /// Whether the client has an active writer (connected).
    pub async fn is_connected(&self) -> bool {
        self.writer.lock().await.is_some()
    }

    /// Disconnect from the IRC server.
    pub async fn disconnect(&self) {
        let mut w = self.writer.lock().await;
        if let Some(ref mut writer) = *w {
            let _ = writer.write_all(b"QUIT :bevy_chat disconnecting\r\n").await;
        }
        *w = None;
    }
}

/// Parse a raw IRC PRIVMSG line into a `ChatMessage`.
/// Ignores messages from ourselves (nick match).
fn parse_privmsg(line: &str, own_nick: &str) -> Option<ChatMessage> {
    // Format: :sender!user@host PRIVMSG #channel :message text
    let line = line.strip_prefix(':')?;
    let (prefix, rest) = line.split_once(' ')?;

    // Extract sender nick from prefix (nick!user@host)
    let sender_nick = prefix.split('!').next()?;

    // Skip our own messages
    if sender_nick == own_nick {
        return None;
    }

    let rest = rest.strip_prefix("PRIVMSG ")?;
    let (channel, message) = rest.split_once(" :")?;

    // Try structured parse first, fall back to raw chat
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
            ":Player1!user@host PRIVMSG #global :[CHAT] Player1@discord: hello", // IRC `:` is the PRIVMSG separator
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
