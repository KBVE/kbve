//! Per-channel chat history ring buffer.
//!
//! Each `/minechat` and `/gamechat` session is an independent ergo proxy with
//! no shared state, so a freshly-connected client sees an empty channel even
//! when others have been talking. This module keeps the last [`HISTORY_LEN`]
//! messages per channel so a new client can be shown recent backscroll on
//! connect.
//!
//! A single dedicated "listener" task per channel owns the writes: it holds its
//! own ergo connection, joins the channel, and appends every PRIVMSG it sees to
//! the buffer. Client sessions are pure readers ([`recent`]) — this avoids the
//! N-fold duplication you'd get if every client connection appended what it
//! received.

use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

use bevy_chat::ChatMessage;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::time::sleep;
use tracing::{debug, info, warn};

use crate::gateway::ergo;

/// Messages retained per channel.
pub const HISTORY_LEN: usize = 50;

/// Channels the gateway keeps history for (union of the game + minechat
/// channel whitelists).
const HISTORY_CHANNELS: &[&str] = &["#general", "#world-events", "#mc-global"];

type Store = Arc<Mutex<HashMap<String, VecDeque<ChatMessage>>>>;

fn store() -> &'static Store {
    static STORE: OnceLock<Store> = OnceLock::new();
    STORE.get_or_init(|| Arc::new(Mutex::new(HashMap::new())))
}

/// Append a message to a channel's ring buffer, evicting the oldest past
/// [`HISTORY_LEN`].
fn push(channel: &str, msg: ChatMessage) {
    let mut guard = store().lock().expect("history mutex poisoned");
    let buf = guard.entry(channel.to_string()).or_default();
    if buf.len() == HISTORY_LEN {
        buf.pop_front();
    }
    buf.push_back(msg);
}

/// Snapshot a channel's buffered messages, oldest first.
pub fn recent(channel: &str) -> Vec<ChatMessage> {
    store()
        .lock()
        .expect("history mutex poisoned")
        .get(channel)
        .map(|b| b.iter().cloned().collect())
        .unwrap_or_default()
}

/// Spawn one always-on listener task per tracked channel. Call once at startup.
pub fn spawn_listeners() {
    for ch in HISTORY_CHANNELS {
        tokio::spawn(run_listener(ch.to_string()));
    }
}

/// Keep a listener alive for a channel, reconnecting with a fixed backoff.
async fn run_listener(channel: String) {
    loop {
        if let Err(e) = listen_once(&channel).await {
            warn!(channel = %channel, "history listener dropped: {e}");
        }
        sleep(Duration::from_secs(5)).await;
    }
}

async fn listen_once(channel: &str) -> std::io::Result<()> {
    let stream = ergo::connect_irc().await?;
    let (r, mut w) = stream.into_split();
    let mut reader = BufReader::new(r);

    let nick = format!("hist-{}", sanitize_channel(channel));
    write_line(&mut w, &format!("NICK {nick}")).await?;
    write_line(&mut w, &format!("USER {nick} 0 * :history listener")).await?;
    write_line(&mut w, &format!("JOIN {channel}")).await?;
    info!(channel = %channel, nick = %nick, "history listener joined");

    let mut line = String::new();
    loop {
        line.clear();
        let n = reader.read_line(&mut line).await?;
        if n == 0 {
            return Ok(());
        }
        let raw = line[..n].trim_end_matches(['\r', '\n']).to_string();
        if let Some(rest) = raw.strip_prefix("PING ") {
            write_line(&mut w, &format!("PONG {rest}")).await?;
            continue;
        }
        if let Some((sender, ch, payload)) = ergo::parse_privmsg(&raw) {
            if ch != channel {
                continue;
            }
            let mut msg = ChatMessage::from_irc_or_plain(&ch, &sender, &payload);
            if msg.platform.is_empty() {
                msg.platform = "irc".into();
            }
            debug!(channel = %channel, "history buffered a message");
            push(channel, msg);
        }
    }
}

async fn write_line(w: &mut tokio::net::tcp::OwnedWriteHalf, line: &str) -> std::io::Result<()> {
    w.write_all(line.as_bytes()).await?;
    w.write_all(b"\r\n").await?;
    w.flush().await
}

/// `#cryptothrone` -> `cryptothrone`; keep alphanumerics, lowercase.
fn sanitize_channel(channel: &str) -> String {
    channel
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect::<String>()
        .to_ascii_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn msg(text: &str) -> ChatMessage {
        ChatMessage::from_irc_privmsg("#t", &format!("[CHAT] a@irc: {text}")).unwrap()
    }

    #[test]
    fn ring_buffer_evicts_oldest_and_keeps_order() {
        let ch = "#ring-test";
        for i in 0..HISTORY_LEN + 3 {
            push(ch, msg(&format!("m{i}")));
        }
        let got = recent(ch);
        assert_eq!(got.len(), HISTORY_LEN);
        // oldest three (m0,m1,m2) evicted; newest retained in order
        assert_eq!(got.first().unwrap().content, "m3");
        assert_eq!(got.last().unwrap().content, format!("m{}", HISTORY_LEN + 2));
    }

    #[test]
    fn sanitize_channel_strips_hash() {
        assert_eq!(sanitize_channel("#cryptothrone"), "cryptothrone");
        assert_eq!(sanitize_channel("#world-events"), "worldevents");
    }

    #[test]
    fn recent_empty_for_unknown_channel() {
        assert!(recent("#never-seen").is_empty());
    }
}
