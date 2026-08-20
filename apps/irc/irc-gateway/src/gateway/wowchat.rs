//! ToCloud9 (WoW 3.3.5a) chat bridge between the cluster's NATS bus and ergo.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use bevy_chat::ChatMessage;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::tcp::OwnedWriteHalf;
use tokio::time::sleep;
use tracing::{debug, info, warn};

use crate::gateway::ergo;
use crate::gateway::filter;
use crate::gateway::ratelimit;

const DEFAULT_NATS_URL: &str = "nats://nats.tocloud9.svc.cluster.local:4222";
const DEFAULT_IRC_CHANNEL: &str = "#general";
const DEFAULT_WOW_CHANNELS: &str = "world";
const DEFAULT_REALM_ID: u32 = 1;

/// Subject chatserver broadcasts channel messages on; `ALL` is a literal, not a wildcard.
const SUBJECT_CHANNEL_MESSAGE: &str = "chat.gw.ALL.channel.message";

/// `ChatEventChannelMessage` in ToCloud9's `shared/events`.
const EVENT_CHANNEL_MESSAGE: i32 = 2;

/// Producer version stamped into the envelope, matching `chatserver.Ver`.
const CHATSERVER_VER: &str = "0.0.1";

const ECHO_TTL: Duration = Duration::from_secs(30);
const RELAY_NICK: &str = "wow-relay";

#[derive(Serialize)]
struct EnvelopeOut<'a> {
    v: &'a str,
    t: i32,
    p: ChannelMessagePayload,
}

#[derive(Deserialize)]
struct EnvelopeIn {
    #[serde(rename = "t")]
    event_type: i32,
    #[serde(rename = "p")]
    payload: serde_json::Value,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "PascalCase")]
struct ChannelMessagePayload {
    realm_id: u32,
    channel_name: String,
    #[serde(rename = "ChannelID")]
    channel_id: u32,
    #[serde(rename = "SenderGUID")]
    sender_guid: u64,
    sender_name: String,
    language: u32,
    message: String,
}

/// NATS URL for the ToCloud9 bus, from `TOCLOUD9_NATS_URL`.
fn nats_url() -> String {
    std::env::var("TOCLOUD9_NATS_URL").unwrap_or_else(|_| DEFAULT_NATS_URL.into())
}

/// IRC channel the relay mirrors WoW chat into, from `WOW_IRC_CHANNEL`.
fn irc_channel() -> String {
    std::env::var("WOW_IRC_CHANNEL").unwrap_or_else(|_| DEFAULT_IRC_CHANNEL.into())
}

/// Realm the relay injects IRC messages as, from `WOW_REALM_ID`.
fn realm_id() -> u32 {
    std::env::var("WOW_REALM_ID")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(DEFAULT_REALM_ID)
}

/// WoW channel names to mirror, from `WOW_CHAT_CHANNELS`; `*` mirrors every channel.
fn wow_channels() -> Vec<String> {
    std::env::var("WOW_CHAT_CHANNELS")
        .unwrap_or_else(|_| DEFAULT_WOW_CHANNELS.into())
        .split(',')
        .map(|s| s.trim().to_ascii_lowercase())
        .filter(|s| !s.is_empty())
        .collect()
}

fn mirrors(channel: &str, allowed: &[String]) -> bool {
    allowed.iter().any(|a| a == "*") || allowed.iter().any(|a| a == &channel.to_ascii_lowercase())
}

type ChannelIds = Mutex<HashMap<String, u32>>;

/// ToCloud9 assigns each channel a numeric id that injection has to echo back,
/// so the relay learns it from observed traffic rather than guessing.
fn channel_ids() -> &'static ChannelIds {
    static IDS: OnceLock<ChannelIds> = OnceLock::new();
    IDS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn remember_channel_id(name: &str, id: u32) {
    channel_ids()
        .lock()
        .expect("channel id map poisoned")
        .insert(name.to_ascii_lowercase(), id);
}

fn known_channel_id(name: &str) -> Option<u32> {
    channel_ids()
        .lock()
        .expect("channel id map poisoned")
        .get(&name.to_ascii_lowercase())
        .copied()
}

type Echoes = Mutex<HashMap<u64, Instant>>;

fn echoes() -> &'static Echoes {
    static ECHOES: OnceLock<Echoes> = OnceLock::new();
    ECHOES.get_or_init(|| Mutex::new(HashMap::new()))
}

fn echo_key(sender: &str, message: &str) -> u64 {
    use std::hash::{Hash, Hasher};
    let mut h = std::collections::hash_map::DefaultHasher::new();
    sender.hash(&mut h);
    message.hash(&mut h);
    h.finish()
}

/// Records a message this relay is about to emit so the same message arriving
/// back on the other transport is dropped instead of looping forever.
fn mark_echo(sender: &str, message: &str) {
    let mut guard = echoes().lock().expect("echo map poisoned");
    let now = Instant::now();
    guard.retain(|_, at| now.duration_since(*at) < ECHO_TTL);
    guard.insert(echo_key(sender, message), now);
}

fn take_echo(sender: &str, message: &str) -> bool {
    let mut guard = echoes().lock().expect("echo map poisoned");
    let now = Instant::now();
    guard.retain(|_, at| now.duration_since(*at) < ECHO_TTL);
    guard.remove(&echo_key(sender, message)).is_some()
}

/// Start the bridge unless `WOW_CHAT_DISABLED` is set. Call once at startup.
pub fn spawn() {
    if std::env::var("WOW_CHAT_DISABLED").is_ok() {
        info!("wow chat bridge disabled");
        return;
    }
    tokio::spawn(run());
}

async fn run() {
    loop {
        if let Err(e) = run_once().await {
            warn!("wow chat bridge dropped: {e}");
        }
        sleep(Duration::from_secs(5)).await;
    }
}

async fn run_once() -> anyhow::Result<()> {
    let channel = irc_channel();
    let allowed = wow_channels();
    let nats = async_nats::connect(nats_url()).await?;
    let mut sub = nats.subscribe(SUBJECT_CHANNEL_MESSAGE).await?;

    let stream = ergo::connect_irc().await?;
    let (r, mut w) = stream.into_split();
    let mut reader = BufReader::new(r);

    write_line(&mut w, &format!("NICK {RELAY_NICK}")).await?;
    write_line(&mut w, &format!("USER {RELAY_NICK} 0 * :wow chat relay")).await?;
    write_line(&mut w, &format!("JOIN {channel}")).await?;
    info!(channel = %channel, subject = SUBJECT_CHANNEL_MESSAGE, "wow chat bridge connected");

    let mut line = String::new();
    loop {
        tokio::select! {
            msg = sub.next() => {
                let Some(msg) = msg else {
                    return Ok(());
                };
                if let Some(privmsg) = wow_to_irc(&msg.payload, &channel, &allowed) {
                    write_line(&mut w, &privmsg).await?;
                }
            }
            read = reader.read_line(&mut line) => {
                let n = read?;
                if n == 0 {
                    return Ok(());
                }
                let raw = line[..n].trim_end_matches(['\r', '\n']).to_string();
                line.clear();

                if let Some(rest) = raw.strip_prefix("PING ") {
                    write_line(&mut w, &format!("PONG {rest}")).await?;
                    continue;
                }
                if let Some(payload) = irc_to_wow(&raw, &channel, &allowed).await {
                    publish(&nats, payload).await;
                }
            }
        }
    }
}

/// Turn a NATS channel-message event into an IRC `PRIVMSG`, or `None` when it is
/// filtered, off-channel, or this relay's own injected message echoing back.
fn wow_to_irc(data: &[u8], channel: &str, allowed: &[String]) -> Option<String> {
    let env: EnvelopeIn = serde_json::from_slice(data).ok()?;
    if env.event_type != EVENT_CHANNEL_MESSAGE {
        return None;
    }
    let payload: ChannelMessagePayload = serde_json::from_value(env.payload).ok()?;
    remember_channel_id(&payload.channel_name, payload.channel_id);

    if !mirrors(&payload.channel_name, allowed) {
        return None;
    }
    if take_echo(&payload.sender_name, &payload.message) {
        return None;
    }
    if payload.sender_name.is_empty() || payload.message.is_empty() {
        return None;
    }

    let nick = wow_nick(&payload.sender_name);
    if matches!(ratelimit::check(&nick), ratelimit::Verdict::Throttle) {
        debug!(sender = %nick, "wow message throttled");
        return None;
    }
    if !matches!(
        filter::check(&nick, &payload.message),
        filter::Decision::Allow
    ) {
        debug!(sender = %nick, "wow message filtered");
        return None;
    }

    let msg = ChatMessage::chat(&nick, "tocloud9", channel, &payload.message);
    mark_echo(&nick, &payload.message);
    Some(msg.to_irc_privmsg())
}

/// Turn an IRC `PRIVMSG` on the mirrored channel into a channel-message payload
/// for injection back into the game, or `None` when it should not be relayed.
async fn irc_to_wow(raw: &str, channel: &str, allowed: &[String]) -> Option<ChannelMessagePayload> {
    let (sender, ch, body) = ergo::parse_privmsg(raw)?;
    if ch != channel || sender == RELAY_NICK {
        return None;
    }

    let msg = ChatMessage::from_irc_or_plain(&ch, &sender, &body);
    let author = if msg.sender.is_empty() {
        sender
    } else {
        msg.sender.clone()
    };
    if author == RELAY_NICK || msg.content.is_empty() {
        return None;
    }
    if take_echo(&author, &msg.content) {
        return None;
    }

    let target = allowed.iter().find(|a| *a != "*")?;
    let channel_id = known_channel_id(target)?;

    Some(ChannelMessagePayload {
        realm_id: realm_id(),
        channel_name: target.clone(),
        channel_id,
        sender_guid: 0,
        sender_name: irc_nick(&author),
        language: 0,
        message: msg.content,
    })
}

async fn publish(nats: &async_nats::Client, payload: ChannelMessagePayload) {
    mark_echo(&payload.sender_name, &payload.message);
    let env = EnvelopeOut {
        v: CHATSERVER_VER,
        t: EVENT_CHANNEL_MESSAGE,
        p: payload,
    };
    let Ok(body) = serde_json::to_vec(&env) else {
        return;
    };
    if let Err(e) = nats.publish(SUBJECT_CHANNEL_MESSAGE, body.into()).await {
        warn!("wow chat publish failed: {e}");
    }
}

/// `Kbve` -> `Kbve[wow]`, so in-game speakers are distinguishable in IRC.
fn wow_nick(name: &str) -> String {
    let safe: String = name
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .take(16)
        .collect();
    if safe.is_empty() {
        "wow".into()
    } else {
        format!("{safe}[wow]")
    }
}

/// Strip the relay suffix and any non-name characters before injecting into the game.
fn irc_nick(nick: &str) -> String {
    let base = nick.split('[').next().unwrap_or(nick);
    let safe: String = base
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .take(16)
        .collect();
    if safe.is_empty() {
        "irc".into()
    } else {
        format!("{safe}[irc]")
    }
}

async fn write_line(w: &mut OwnedWriteHalf, line: &str) -> std::io::Result<()> {
    w.write_all(line.as_bytes()).await?;
    w.write_all(b"\r\n").await?;
    w.flush().await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn envelope(channel: &str, sender: &str, message: &str, id: u32) -> Vec<u8> {
        serde_json::to_vec(&EnvelopeOut {
            v: CHATSERVER_VER,
            t: EVENT_CHANNEL_MESSAGE,
            p: ChannelMessagePayload {
                realm_id: 1,
                channel_name: channel.into(),
                channel_id: id,
                sender_guid: 6,
                sender_name: sender.into(),
                language: 0,
                message: message.into(),
            },
        })
        .unwrap()
    }

    #[test]
    fn payload_uses_pascal_case_field_names() {
        let raw = envelope("world", "Kbve", "hello", 3);
        let text = String::from_utf8(raw).unwrap();
        assert!(text.contains("\"ChannelName\":\"world\""));
        assert!(text.contains("\"SenderGUID\":6"));
        assert!(text.contains("\"SenderName\":\"Kbve\""));
        assert!(text.contains("\"t\":2"));
    }

    #[test]
    fn mirrors_respects_whitelist_and_wildcard() {
        let allowed = vec!["world".to_string()];
        assert!(mirrors("world", &allowed));
        assert!(mirrors("World", &allowed));
        assert!(!mirrors("trade", &allowed));
        assert!(mirrors("trade", &["*".to_string()]));
    }

    #[test]
    fn wow_to_irc_skips_unmirrored_channel() {
        let allowed = vec!["world".to_string()];
        let raw = envelope("trade", "Kbve", "wts", 7);
        assert!(wow_to_irc(&raw, "#general", &allowed).is_none());
    }

    #[test]
    fn wow_to_irc_learns_channel_id_even_when_not_mirrored() {
        let allowed = vec!["world".to_string()];
        let raw = envelope("trade", "Kbve", "wts", 7);
        let _ = wow_to_irc(&raw, "#general", &allowed);
        assert_eq!(known_channel_id("trade"), Some(7));
    }

    #[test]
    fn wow_to_irc_emits_privmsg_and_suppresses_its_echo() {
        let allowed = vec!["world".to_string()];
        let raw = envelope("world", "Kbve", "hello there", 3);
        let line = wow_to_irc(&raw, "#general", &allowed).expect("should relay");
        assert!(line.starts_with("PRIVMSG #general "));
        assert!(line.contains("hello there"));
        assert!(take_echo("Kbve[wow]", "hello there"));
    }

    #[test]
    fn nick_helpers_tag_origin() {
        assert_eq!(wow_nick("Kbve"), "Kbve[wow]");
        assert_eq!(wow_nick("!!!"), "wow");
        assert_eq!(irc_nick("h0lybyte"), "h0lybyte[irc]");
        assert_eq!(irc_nick("Kbve[wow]"), "Kbve[irc]");
    }

    #[tokio::test]
    async fn irc_to_wow_ignores_relay_own_nick() {
        let allowed = vec!["world".to_string()];
        let raw = format!(":{RELAY_NICK}!u@h PRIVMSG #general :looped");
        assert!(irc_to_wow(&raw, "#general", &allowed).await.is_none());
    }

    #[tokio::test]
    async fn irc_to_wow_needs_a_learned_channel_id() {
        let allowed = vec!["never-seen".to_string()];
        let raw = ":someone!u@h PRIVMSG #general :hi";
        assert!(irc_to_wow(raw, "#general", &allowed).await.is_none());
    }
}
