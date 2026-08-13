use std::collections::VecDeque;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use bevy_chat::{ChatClient, ChatMessage, IrcConfig, IrcTransport};
use tokio::sync::{RwLock, broadcast};

use crate::db::get_kv_cache;

const DEFAULT_HOST: &str = "ergo-irc-service.irc.svc.cluster.local";
const DEFAULT_PORT: u16 = 6667;
const DEFAULT_CHANNEL: &str = "#general";
const DEFAULT_NICK: &str = "bbs-bot";

pub const PLATFORM: &str = "bbs";
pub const MAX_CHAT_LEN: usize = 350;
pub const HISTORY_LEN: usize = 80;

const PING_INTERVAL: Duration = Duration::from_secs(60);
const STALE_AFTER: Duration = Duration::from_secs(300);
const RECONNECT_DELAY: Duration = Duration::from_secs(10);
const RATE_WINDOW_SECS: u64 = 10;
const RATE_MAX_PER_WINDOW: u64 = 5;

static HUB: OnceLock<Arc<ChatHub>> = OnceLock::new();

#[derive(Debug)]
pub enum SendError {
    Offline,
    Empty,
    TooFast,
}

/// Shared bridge between every BBS caller and `#general` on ergo.
///
/// One IRC connection serves the whole process; caller identity rides in the
/// `bevy_chat` envelope rather than the IRC nick, matching how the Discord bot
/// and the Palworld relay publish.
pub struct ChatHub {
    channel: String,
    tx: broadcast::Sender<ChatMessage>,
    client: RwLock<Option<ChatClient>>,
    last_rx: Mutex<Instant>,
    history: Mutex<VecDeque<ChatMessage>>,
}

impl ChatHub {
    pub fn channel(&self) -> &str {
        &self.channel
    }

    pub fn subscribe(&self) -> broadcast::Receiver<ChatMessage> {
        self.tx.subscribe()
    }

    /// Backscroll for a caller opening the room, oldest first. Kept in process:
    /// the gateway's own ring lives in its Valkey database, which is not the
    /// one this service is pointed at, so reading it would depend on two URLs
    /// agreeing that nothing here can check.
    pub fn recent(&self) -> Vec<ChatMessage> {
        self.history
            .lock()
            .map(|ring| ring.iter().cloned().collect())
            .unwrap_or_default()
    }

    fn remember(&self, msg: &ChatMessage) {
        if let Ok(mut ring) = self.history.lock() {
            if ring.len() >= HISTORY_LEN {
                ring.pop_front();
            }
            ring.push_back(msg.clone());
        }
    }

    pub async fn online(&self) -> bool {
        self.client.read().await.is_some()
    }

    /// Relay one caller line to `#general`. `sender` is the caller's account
    /// username; both it and the body are scrubbed before they reach the wire.
    pub async fn send(&self, user_id: &str, sender: &str, content: &str) -> Result<(), SendError> {
        let content = sanitize_content(content);
        if content.is_empty() {
            return Err(SendError::Empty);
        }
        if self.throttled(user_id).await {
            return Err(SendError::TooFast);
        }

        let nick = sanitize_nick(sender);
        let msg = ChatMessage::chat(&nick, PLATFORM, &self.channel, &content);

        let sent = {
            let guard = self.client.read().await;
            match guard.as_ref() {
                Some(client) => client.send(&msg).await,
                None => return Err(SendError::Offline),
            }
        };

        match sent {
            // Ergo never echoes a client's own PRIVMSG, so this is the only
            // point at which one BBS caller's line can reach the others.
            Ok(()) => {
                self.remember(&msg);
                let _ = self.tx.send(msg);
                Ok(())
            }
            Err(e) => {
                tracing::warn!(error = %e, "[bbs] irc send failed, dropping connection");
                self.client.write().await.take();
                Err(SendError::Offline)
            }
        }
    }

    /// Fixed-window limiter shared with the rest of the fleet through Valkey.
    /// Unlike the claim endpoint this fails closed: chat leaves the process
    /// unfiltered, so a missing counter must not read as headroom.
    async fn throttled(&self, user_id: &str) -> bool {
        let Some(cache) = get_kv_cache() else {
            return false;
        };
        match cache
            .check_rate(&format!("bbs:chat:{user_id}"), RATE_WINDOW_SECS)
            .await
        {
            Some(hits) => hits > RATE_MAX_PER_WINDOW,
            None => true,
        }
    }

    fn mark_rx(&self) {
        if let Ok(mut slot) = self.last_rx.lock() {
            *slot = Instant::now();
        }
    }

    fn stale(&self) -> bool {
        self.last_rx
            .lock()
            .map(|slot| slot.elapsed() > STALE_AFTER)
            .unwrap_or(false)
    }
}

pub fn hub() -> Option<&'static Arc<ChatHub>> {
    HUB.get()
}

fn env_str(key: &str, default: &str) -> String {
    std::env::var(key)
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| default.to_string())
}

/// Bind the `#general` bridge. Off unless `BBS_CHAT_ENABLED` is set, so the
/// telnet frontend can ship without the relay live.
pub fn init_chat() -> bool {
    if !super::env_flag("BBS_CHAT_ENABLED", false) {
        tracing::info!("[bbs] chat relay disabled");
        return false;
    }

    let channel = env_str("BBS_IRC_CHANNEL", DEFAULT_CHANNEL);
    let config = IrcConfig {
        host: env_str("BBS_IRC_HOST", DEFAULT_HOST),
        port: std::env::var("BBS_IRC_PORT")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(DEFAULT_PORT),
        tls: false,
        nick: env_str("BBS_IRC_NICK", DEFAULT_NICK),
        channels: vec![channel.clone()],
        password: std::env::var("BBS_IRC_PASSWORD").ok(),
        reconnect_delay_secs: 0,
        transport: IrcTransport::Tcp,
        skip_registration: false,
    };

    let (tx, _) = broadcast::channel(256);
    let hub = Arc::new(ChatHub {
        channel,
        tx,
        client: RwLock::new(None),
        last_rx: Mutex::new(Instant::now()),
        history: Mutex::new(VecDeque::with_capacity(HISTORY_LEN)),
    });
    if HUB.set(hub.clone()).is_err() {
        return true;
    }

    tokio::spawn(async move { supervise(hub, config).await });
    true
}

/// `bevy_chat` never reconnects on its own: its read loop just ends and leaves
/// a writer pointed at a dead socket. Own that here — rebuild whenever the
/// connection drops, a keepalive write fails, or the link goes quiet.
async fn supervise(hub: Arc<ChatHub>, config: IrcConfig) {
    loop {
        if hub.client.read().await.is_none() {
            match connect(&hub, config.clone()).await {
                Ok(()) => tracing::info!(channel = %hub.channel, "[bbs] chat relay connected"),
                Err(e) => {
                    tracing::warn!(error = %e, "[bbs] chat relay connect failed");
                    tokio::time::sleep(RECONNECT_DELAY).await;
                    continue;
                }
            }
        }

        tokio::time::sleep(PING_INTERVAL).await;

        if hub.stale() {
            tracing::warn!("[bbs] chat relay went quiet, reconnecting");
            hub.client.write().await.take();
            continue;
        }

        let alive = {
            let guard = hub.client.read().await;
            match guard.as_ref() {
                Some(client) => client.send_raw("PING :bbs").await.is_ok(),
                None => false,
            }
        };
        if !alive {
            hub.client.write().await.take();
        }
    }
}

async fn connect(hub: &Arc<ChatHub>, config: IrcConfig) -> Result<(), String> {
    let mut client = ChatClient::new(config);
    client.connect().await?;

    let mut rx = client.subscribe();
    let pump = hub.clone();
    tokio::spawn(async move {
        loop {
            match rx.recv().await {
                Ok(msg) => {
                    pump.mark_rx();
                    if msg.channel == pump.channel && msg.platform != PLATFORM {
                        pump.remember(&msg);
                        let _ = pump.tx.send(msg);
                    }
                }
                Err(broadcast::error::RecvError::Lagged(n)) => {
                    tracing::debug!(skipped = n, "[bbs] chat relay lagged");
                }
                Err(broadcast::error::RecvError::Closed) => break,
            }
        }
    });

    hub.mark_rx();
    *hub.client.write().await = Some(client);
    Ok(())
}

/// Reduce a caller line to something that cannot escape its own envelope.
///
/// CR/LF would terminate the `PRIVMSG` and let the rest of the line run as an
/// IRC command under the bot's own nick, so they go first. Everything else is
/// clamped to printable ASCII, and `@` becomes its fullwidth twin so a body can
/// never read back as another platform's `sender@platform:` prefix.
pub fn sanitize_content(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for ch in input.chars() {
        match ch {
            '\r' | '\n' | '\t' => out.push(' '),
            '@' => out.push('\u{ff20}'),
            c if c.is_ascii_graphic() || c == ' ' => out.push(c),
            _ => {}
        }
    }
    let trimmed = out.trim();
    match trimmed.char_indices().nth(MAX_CHAT_LEN) {
        Some((idx, _)) => trimmed[..idx].to_string(),
        None => trimmed.to_string(),
    }
}

/// Usernames are caller-controlled and land inside the envelope prefix, where a
/// space, `@` or `: ` would let one caller pose as another sender or platform.
/// Keep the conservative handle alphabet and nothing else.
pub fn sanitize_nick(input: &str) -> String {
    let cleaned: String = input
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.'))
        .take(32)
        .collect();
    if cleaned.is_empty() {
        "anon".to_string()
    } else {
        cleaned
    }
}
