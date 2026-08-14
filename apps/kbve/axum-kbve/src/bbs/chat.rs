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

const SUPERVISE_TICK: Duration = Duration::from_secs(5);
const PING_INTERVAL: Duration = Duration::from_secs(60);
const STALE_AFTER: Duration = Duration::from_secs(300);
const RECONNECT_DELAY: Duration = Duration::from_secs(10);
const RATE_WINDOW_SECS: u64 = 10;
const RATE_MAX_PER_WINDOW: u64 = 5;

pub const OUTBOX_LIMIT: usize = 32;
/// A line that misses its moment is worse than a line that never arrives —
/// answering a question nobody remembers asking reads as noise. Hold a
/// reconnect, not a conversation.
pub const OUTBOX_TTL: Duration = Duration::from_secs(120);

static HUB: OnceLock<Arc<ChatHub>> = OnceLock::new();

#[derive(Debug)]
pub enum SendError {
    Offline,
    Empty,
    TooFast,
}

/// Whether a caller's line went out now or is waiting on the relay.
#[derive(Debug, PartialEq, Eq)]
pub enum Delivery {
    Live,
    Queued,
}

struct Pending {
    msg: ChatMessage,
    queued_at: Instant,
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
    history: Mutex<VecDeque<ChatMessage>>,
    outbox: Mutex<VecDeque<Pending>>,
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
    ///
    /// A relay that is down is usually seconds from being back, so a line that
    /// cannot go now is held rather than refused — the caller is told it is
    /// waiting instead of being asked to retype it.
    pub async fn send(
        &self,
        user_id: &str,
        sender: &str,
        content: &str,
    ) -> Result<Delivery, SendError> {
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
                None => return self.queue(msg),
            }
        };

        match sent {
            // Ergo never echoes a client's own PRIVMSG, so this is the only
            // point at which one BBS caller's line can reach the others.
            Ok(()) => {
                self.publish(msg);
                Ok(Delivery::Live)
            }
            Err(e) => {
                tracing::warn!(error = %e, "[bbs] irc send failed, dropping connection");
                self.client.write().await.take();
                self.queue(msg)
            }
        }
    }

    /// Hold a line for the supervisor to flush once the link is rebuilt.
    /// Full means the relay has been down long enough that promising delivery
    /// would be a lie, so the caller keeps their text and hears about it.
    fn queue(&self, msg: ChatMessage) -> Result<Delivery, SendError> {
        let Ok(mut pending) = self.outbox.lock() else {
            return Err(SendError::Offline);
        };
        pending.retain(|item| item.queued_at.elapsed() < OUTBOX_TTL);
        if pending.len() >= OUTBOX_LIMIT {
            return Err(SendError::Offline);
        }
        pending.push_back(Pending {
            msg,
            queued_at: Instant::now(),
        });
        Ok(Delivery::Queued)
    }

    /// Everything a caller's own line needs once it is on the wire: the room
    /// backscroll, and every other session watching.
    fn publish(&self, msg: ChatMessage) {
        self.remember(&msg);
        let _ = self.tx.send(msg);
    }

    /// Flush held lines oldest first, stopping at the first refusal so the
    /// order callers typed in survives. Anything past its window is dropped
    /// rather than delivered into a conversation that has moved on.
    async fn flush_outbox(&self) {
        loop {
            let next = {
                let Ok(mut pending) = self.outbox.lock() else {
                    return;
                };
                loop {
                    match pending.pop_front() {
                        Some(item) if item.queued_at.elapsed() < OUTBOX_TTL => break Some(item),
                        Some(_) => continue,
                        None => break None,
                    }
                }
            };
            let Some(item) = next else { return };

            let sent = {
                let guard = self.client.read().await;
                match guard.as_ref() {
                    Some(client) => client.send(&item.msg).await,
                    None => Err("relay offline".to_owned()),
                }
            };

            match sent {
                Ok(()) => self.publish(item.msg),
                Err(e) => {
                    tracing::warn!(error = %e, "[bbs] outbox flush stalled, requeueing");
                    if let Ok(mut pending) = self.outbox.lock() {
                        pending.push_front(item);
                    }
                    return;
                }
            }
        }
    }

    pub fn queued(&self) -> usize {
        self.outbox.lock().map(|pending| pending.len()).unwrap_or(0)
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

    /// Dead link, not a quiet room. Subscribers only ever see `PRIVMSG`s, so
    /// judging by those tore down a healthy connection after five minutes of
    /// nobody talking — and the next caller to hit enter got `relay offline`.
    /// `idle_for` counts every inbound line, and the keepalive below draws a
    /// `PONG` each minute, so a live socket never goes quiet.
    async fn stale(&self) -> bool {
        match self.client.read().await.as_ref() {
            Some(client) => client.idle_for() > STALE_AFTER,
            None => false,
        }
    }
}

#[cfg(test)]
impl ChatHub {
    pub(super) fn for_tests(channel: &str) -> Self {
        let (tx, _) = broadcast::channel(256);
        Self {
            channel: channel.to_string(),
            tx,
            client: RwLock::new(None),
            history: Mutex::new(VecDeque::with_capacity(HISTORY_LEN)),
            outbox: Mutex::new(VecDeque::new()),
        }
    }

    pub(super) async fn attach_for_tests(&self, client: ChatClient) {
        *self.client.write().await = Some(client);
    }

    pub(super) async fn flush_for_tests(&self) {
        self.flush_outbox().await;
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
        history: Mutex::new(VecDeque::with_capacity(HISTORY_LEN)),
        outbox: Mutex::new(VecDeque::new()),
    });
    if HUB.set(hub.clone()).is_err() {
        return true;
    }

    tokio::spawn(async move { supervise(hub, config).await });
    true
}

/// `bevy_chat` never reconnects on its own: its read loop just ends and leaves
/// a writer pointed at a dead socket. Own that here — rebuild whenever the
/// connection drops, a keepalive write fails, or the link goes silent.
///
/// The loop wakes every few seconds rather than every minute: a failed send
/// clears the client from under us, and waiting out a whole ping interval to
/// notice left callers staring at an offline relay long after it could have
/// been back.
async fn supervise(hub: Arc<ChatHub>, config: IrcConfig) {
    let mut since_ping = Duration::ZERO;
    loop {
        if hub.client.read().await.is_none() {
            match connect(&hub, config.clone()).await {
                Ok(()) => {
                    since_ping = Duration::ZERO;
                    tracing::info!(channel = %hub.channel, "[bbs] chat relay connected");
                    hub.flush_outbox().await;
                }
                Err(e) => {
                    tracing::warn!(error = %e, "[bbs] chat relay connect failed");
                    tokio::time::sleep(RECONNECT_DELAY).await;
                    continue;
                }
            }
        }

        tokio::time::sleep(SUPERVISE_TICK).await;

        if hub.stale().await {
            tracing::warn!("[bbs] chat relay went silent, reconnecting");
            hub.client.write().await.take();
            continue;
        }

        since_ping += SUPERVISE_TICK;
        if since_ping < PING_INTERVAL {
            continue;
        }
        since_ping = Duration::ZERO;

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
