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
use crate::gateway::kv;
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

/// Content-only echoes are a blunt instrument: a second speaker repeating the
/// exact same line inside this window gets swallowed. That is deliberate — a
/// relay loop is far worse than one dropped duplicate — so the window is kept
/// much shorter than [`ECHO_TTL`].
const ECHO_CONTENT_TTL: Duration = Duration::from_secs(5);

const RELAY_NICK: &str = "wow-relay";

/// Valkey key prefix for channel ids learned from observed traffic.
const CHANNEL_ID_KEY_PREFIX: &str = "wow:chanid";

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
    #[serde(rename = "RealmID")]
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

/// WoW channel names to mirror, from `WOW_CHAT_CHANNELS`; `*` mirrors every
/// channel. Spelling is preserved: matching is case-insensitive, but the
/// configured casing is the cold-start fallback for the injected `ChannelName`.
fn wow_channels() -> Vec<String> {
    std::env::var("WOW_CHAT_CHANNELS")
        .unwrap_or_else(|_| DEFAULT_WOW_CHANNELS.into())
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

fn mirrors(channel: &str, allowed: &[String]) -> bool {
    allowed
        .iter()
        .any(|a| a == "*" || a.eq_ignore_ascii_case(channel))
}

fn wildcard_only(allowed: &[String]) -> bool {
    !allowed.iter().any(|a| a != "*")
}

/// The single WoW channel IRC traffic is injected into. `*` is a mirror filter,
/// never a real channel, so a wildcard-only config falls back to the default.
fn injection_target(allowed: &[String]) -> String {
    allowed
        .iter()
        .find(|a| a.as_str() != "*")
        .cloned()
        .unwrap_or_else(|| DEFAULT_WOW_CHANNELS.to_string())
}

/// A channel as ToCloud9 knows it: the numeric id injection has to echo back,
/// plus the exact spelling seen on the wire. The gateway matches a session's
/// membership on `ChannelName`, so `world` and `World` are not interchangeable.
#[derive(Clone, Debug, PartialEq, Eq)]
struct ChannelRef {
    name: String,
    id: u32,
}

type ChannelIds = Mutex<HashMap<String, ChannelRef>>;

/// ToCloud9 assigns each channel a numeric id that injection has to echo back,
/// so the relay learns it from observed traffic rather than guessing.
fn channel_ids() -> &'static ChannelIds {
    static IDS: OnceLock<ChannelIds> = OnceLock::new();
    IDS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn channel_id_key(name: &str) -> String {
    format!("{CHANNEL_ID_KEY_PREFIX}:{}", name.to_ascii_lowercase())
}

fn encode_channel_ref(chan: &ChannelRef) -> String {
    format!("{}:{}", chan.id, chan.name)
}

fn decode_channel_ref(raw: &str) -> Option<ChannelRef> {
    let (id, name) = raw.trim().split_once(':')?;
    let id = id.trim().parse().ok()?;
    if name.is_empty() {
        return None;
    }
    Some(ChannelRef {
        name: name.to_string(),
        id,
    })
}

/// Cold-start seed from `WOW_CHANNEL_ID`, used only until a real id is learned.
fn seeded_channel_id() -> Option<u32> {
    let raw = std::env::var("WOW_CHANNEL_ID").ok()?;
    match raw.trim().parse::<u32>() {
        Ok(id) => Some(id),
        Err(_) => {
            warn!(value = %raw, "WOW_CHANNEL_ID is not a u32; ignoring seed");
            None
        }
    }
}

fn cache_channel(chan: &ChannelRef) -> bool {
    channel_ids()
        .lock()
        .expect("channel id map poisoned")
        .insert(chan.name.to_ascii_lowercase(), chan.clone())
        .as_ref()
        != Some(chan)
}

/// Learn a channel id and its wire spelling from observed traffic and, when
/// Valkey is configured, persist both so a restarted pod can inject before any
/// player has spoken.
fn remember_channel_id(name: &str, id: u32) {
    let chan = ChannelRef {
        name: name.to_string(),
        id,
    };
    if !cache_channel(&chan) {
        return;
    }
    debug!(channel = %chan.name, id, "learned wow channel id");
    let Ok(handle) = tokio::runtime::Handle::try_current() else {
        return;
    };
    handle.spawn(async move {
        let Some(cache) = kv::get() else { return };
        if cache
            .kv_set_str(&channel_id_key(&chan.name), &encode_channel_ref(&chan))
            .await
            .is_none()
        {
            debug!(channel = %chan.name, "wow channel id not persisted; valkey unavailable");
        }
    });
}

fn known_channel(name: &str) -> Option<ChannelRef> {
    channel_ids()
        .lock()
        .expect("channel id map poisoned")
        .get(&name.to_ascii_lowercase())
        .cloned()
}

#[cfg(test)]
fn known_channel_id(name: &str) -> Option<u32> {
    known_channel(name).map(|c| c.id)
}

/// Resolve the injection target for `name`: the in-process learned entry first,
/// then the entry persisted in Valkey by a previous run, then the
/// `WOW_CHANNEL_ID` seed paired with the configured spelling. Learned always
/// wins over the seed, and a learned entry carries the wire casing the gateway
/// matches session membership on.
async fn resolve_channel(name: &str) -> Option<ChannelRef> {
    if let Some(chan) = known_channel(name) {
        return Some(chan);
    }
    if let Some(cache) = kv::get() {
        if let Some(raw) = cache.kv_get_str(&channel_id_key(name)).await {
            match decode_channel_ref(&raw) {
                Some(chan) => {
                    debug!(channel = %chan.name, id = chan.id, "restored wow channel id from valkey");
                    cache_channel(&chan);
                    return Some(chan);
                }
                None => {
                    warn!(channel = %name, value = %raw, "malformed persisted wow channel id")
                }
            }
        }
    }
    if let Some(id) = seeded_channel_id() {
        debug!(channel = %name, id, "using seeded wow channel id");
        return Some(ChannelRef {
            name: name.to_string(),
            id,
        });
    }
    None
}

type Echoes = Mutex<HashMap<u64, Instant>>;

fn echoes() -> &'static Echoes {
    static ECHOES: OnceLock<Echoes> = OnceLock::new();
    ECHOES.get_or_init(|| Mutex::new(HashMap::new()))
}

fn content_echoes() -> &'static Echoes {
    static ECHOES: OnceLock<Echoes> = OnceLock::new();
    ECHOES.get_or_init(|| Mutex::new(HashMap::new()))
}

/// `Kbve[irc]`, `Kbve[wow]`, `kbve` and `Kbve` all collapse to one key, so a
/// transport that rewrites or re-tags the sender still hits the echo entry.
fn echo_name(sender: &str) -> String {
    sender
        .split('[')
        .next()
        .unwrap_or(sender)
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .flat_map(|c| c.to_lowercase())
        .collect()
}

fn hash_of(parts: &[&str]) -> u64 {
    use std::hash::{Hash, Hasher};
    let mut h = std::collections::hash_map::DefaultHasher::new();
    for p in parts {
        p.hash(&mut h);
    }
    h.finish()
}

fn echo_key(sender: &str, message: &str) -> u64 {
    hash_of(&[&echo_name(sender), message])
}

fn content_key(message: &str) -> u64 {
    hash_of(&[message])
}

fn sweep(
    map: &'static Echoes,
    ttl: Duration,
) -> std::sync::MutexGuard<'static, HashMap<u64, Instant>> {
    let mut guard = map.lock().expect("echo map poisoned");
    let now = Instant::now();
    guard.retain(|_, at| now.duration_since(*at) < ttl);
    guard
}

/// Records a message this relay is about to emit so the same message arriving
/// back on the other transport is dropped instead of looping forever. The
/// sender-keyed entry is the precise one; the content-only entry is the
/// backstop for a transport that rewrites the sender name entirely.
fn mark_echo(sender: &str, message: &str) {
    let now = Instant::now();
    sweep(echoes(), ECHO_TTL).insert(echo_key(sender, message), now);
    sweep(content_echoes(), ECHO_CONTENT_TTL).insert(content_key(message), now);
}

fn take_echo(sender: &str, message: &str) -> bool {
    let by_sender = sweep(echoes(), ECHO_TTL)
        .remove(&echo_key(sender, message))
        .is_some();
    let by_content = sweep(content_echoes(), ECHO_CONTENT_TTL)
        .remove(&content_key(message))
        .is_some();
    by_sender || by_content
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
    let target = injection_target(&allowed);
    if wildcard_only(&allowed) {
        warn!(
            target = %target,
            "WOW_CHAT_CHANNELS is `*` only; a wildcard cannot be an injection target,              falling back for IRC -> WoW. Set a concrete channel name."
        );
    }
    let nats = async_nats::connect(nats_url()).await?;
    let mut sub = nats.subscribe(SUBJECT_CHANNEL_MESSAGE).await?;

    let stream = ergo::connect_irc().await?;
    let (r, mut w) = stream.into_split();
    let mut reader = BufReader::new(r);

    write_line(&mut w, &format!("NICK {RELAY_NICK}")).await?;
    write_line(&mut w, &format!("USER {RELAY_NICK} 0 * :wow chat relay")).await?;
    write_line(&mut w, &format!("JOIN {channel}")).await?;
    match resolve_channel(&target).await {
        Some(chan) => {
            info!(target = %chan.name, channel_id = chan.id, "wow injection channel id ready")
        }
        None => warn!(
            target = %target,
            "no wow channel id known yet (set WOW_CHANNEL_ID to seed); IRC -> WoW is dropped until              an in-game message is observed"
        ),
    }
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
    let env: EnvelopeIn = match serde_json::from_slice(data) {
        Ok(env) => env,
        Err(e) => {
            debug!("dropping wow message: undecodable envelope: {e}");
            return None;
        }
    };
    if env.event_type != EVENT_CHANNEL_MESSAGE {
        debug!(
            event = env.event_type,
            "dropping wow message: not a channel message"
        );
        return None;
    }
    let payload: ChannelMessagePayload = match serde_json::from_value(env.payload) {
        Ok(p) => p,
        Err(e) => {
            debug!("dropping wow message: undecodable channel payload: {e}");
            return None;
        }
    };
    remember_channel_id(&payload.channel_name, payload.channel_id);

    if !mirrors(&payload.channel_name, allowed) {
        debug!(channel = %payload.channel_name, "dropping wow message: channel not mirrored");
        return None;
    }
    if take_echo(&payload.sender_name, &payload.message) {
        debug!(sender = %payload.sender_name, "dropping wow message: own injected echo");
        return None;
    }
    if payload.sender_name.is_empty() || payload.message.is_empty() {
        debug!(channel = %payload.channel_name, "dropping wow message: empty sender or body");
        return None;
    }

    let nick = wow_nick(&payload.sender_name);
    if !matches!(ratelimit::check(&nick), ratelimit::Verdict::Allow) {
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
    if ch != channel {
        return None;
    }
    if sender == RELAY_NICK {
        debug!("dropping irc message: sent by this relay");
        return None;
    }

    let msg = ChatMessage::from_irc_or_plain(&ch, &sender, &body);
    let author = if msg.sender.is_empty() {
        sender
    } else {
        msg.sender.clone()
    };
    if author == RELAY_NICK || msg.content.is_empty() {
        debug!(sender = %author, "dropping irc message: relay author or empty body");
        return None;
    }
    if take_echo(&author, &msg.content) {
        debug!(sender = %author, "dropping irc message: mirrored wow echo");
        return None;
    }

    let target = injection_target(allowed);
    let Some(chan) = resolve_channel(&target).await else {
        warn!(
            target = %target,
            "dropping irc message: no wow channel id known; seed WOW_CHANNEL_ID or wait for an              in-game message"
        );
        return None;
    };

    Some(ChannelMessagePayload {
        realm_id: realm_id(),
        channel_name: chan.name,
        channel_id: chan.id,
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
        warn!("dropping irc message: channel payload failed to serialize");
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
    use serial_test::serial;

    fn reset_channel_ids() {
        channel_ids()
            .lock()
            .expect("channel id map poisoned")
            .clear();
    }

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

    #[serial]
    #[test]
    fn wow_to_irc_keeps_dropping_past_the_kick_ceiling() {
        reset_channel_ids();
        let allowed = vec!["world".to_string()];
        let mut relayed = 0;
        for i in 0..40 {
            let raw = envelope("world", "Floods", &format!("flood {i}"), 5);
            if wow_to_irc(&raw, "#general", &allowed).is_some() {
                relayed += 1;
            }
        }
        assert!(
            relayed <= 10,
            "flood past the kick ceiling must stay dropped, relayed {relayed}"
        );
    }

    #[serial]
    #[test]
    fn wow_to_irc_decodes_the_exact_go_wire_payload() {
        reset_channel_ids();
        let wire = br#"{"v":"0.0.1","t":2,"p":{"RealmID":1,"ChannelName":"world","ChannelID":5,"SenderGUID":123,"SenderName":"Kbve","Language":0,"Message":"wire shape probe"}}"#;
        let allowed = vec!["world".to_string()];
        let line = wow_to_irc(wire, "#general", &allowed).expect("go wire payload must decode");
        assert!(line.contains("wire shape probe"));
        assert_eq!(known_channel("world").map(|c| c.id), Some(5));
    }

    #[serial]
    #[test]
    fn wow_to_irc_skips_unmirrored_channel() {
        let allowed = vec!["world".to_string()];
        let raw = envelope("trade", "Kbve", "wts", 7);
        assert!(wow_to_irc(&raw, "#general", &allowed).is_none());
    }

    #[serial]
    #[test]
    fn wow_to_irc_learns_channel_id_even_when_not_mirrored() {
        let allowed = vec!["world".to_string()];
        let raw = envelope("trade", "Kbve", "wts", 7);
        let _ = wow_to_irc(&raw, "#general", &allowed);
        assert_eq!(known_channel_id("trade"), Some(7));
    }

    #[serial]
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

    #[serial]
    #[tokio::test]
    async fn irc_to_wow_ignores_relay_own_nick() {
        let allowed = vec!["world".to_string()];
        let raw = format!(":{RELAY_NICK}!u@h PRIVMSG #general :looped");
        assert!(irc_to_wow(&raw, "#general", &allowed).await.is_none());
    }

    #[tokio::test]
    #[serial]
    async fn irc_to_wow_needs_a_learned_channel_id() {
        reset_channel_ids();
        std::env::remove_var("WOW_CHANNEL_ID");
        let allowed = vec!["never-seen".to_string()];
        let raw = ":someone!u@h PRIVMSG #general :hi";
        assert!(irc_to_wow(raw, "#general", &allowed).await.is_none());
    }

    #[test]
    fn injection_target_never_resolves_to_the_wildcard() {
        assert!(wildcard_only(&["*".to_string()]));
        assert_eq!(injection_target(&["*".to_string()]), DEFAULT_WOW_CHANNELS);
        assert!(!wildcard_only(&["*".to_string(), "trade".to_string()]));
        assert_eq!(
            injection_target(&["*".to_string(), "trade".to_string()]),
            "trade"
        );
    }

    #[tokio::test]
    #[serial]
    async fn irc_to_wow_still_injects_under_wildcard_config() {
        reset_channel_ids();
        std::env::remove_var("WOW_CHANNEL_ID");
        remember_channel_id(DEFAULT_WOW_CHANNELS, 11);
        let allowed = vec!["*".to_string()];
        let raw = ":someone!u@h PRIVMSG #general :wildcard body";
        let payload = irc_to_wow(raw, "#general", &allowed)
            .await
            .expect("wildcard config must still inject");
        assert_eq!(payload.channel_name, DEFAULT_WOW_CHANNELS);
        assert_eq!(payload.channel_id, 11);
    }

    #[tokio::test]
    #[serial]
    async fn irc_to_wow_uses_env_seed_on_cold_start() {
        reset_channel_ids();
        std::env::set_var("WOW_CHANNEL_ID", "42");
        let allowed = vec!["cold-start".to_string()];
        let raw = ":someone!u@h PRIVMSG #general :cold start body";
        let payload = irc_to_wow(raw, "#general", &allowed)
            .await
            .expect("seeded id must unblock a cold start");
        std::env::remove_var("WOW_CHANNEL_ID");
        assert_eq!(payload.channel_name, "cold-start");
        assert_eq!(payload.channel_id, 42);
    }

    #[tokio::test]
    #[serial]
    async fn learned_channel_id_beats_the_env_seed() {
        reset_channel_ids();
        std::env::set_var("WOW_CHANNEL_ID", "42");
        remember_channel_id("warm", 7);
        let chan = resolve_channel("warm").await;
        std::env::remove_var("WOW_CHANNEL_ID");
        assert_eq!(chan.map(|c| c.id), Some(7));
    }

    #[tokio::test]
    #[serial]
    async fn irc_to_wow_injects_the_observed_channel_casing() {
        reset_channel_ids();
        std::env::remove_var("WOW_CHANNEL_ID");
        let observed = envelope("World", "Kbve", "casing probe", 5);
        let _ = wow_to_irc(&observed, "#general", &["world".to_string()]);

        let allowed = vec!["world".to_string()];
        let raw = ":someone!u@h PRIVMSG #general :casing body";
        let payload = irc_to_wow(raw, "#general", &allowed)
            .await
            .expect("should inject");
        assert_eq!(payload.channel_name, "World");
        assert_eq!(payload.channel_id, 5);
    }

    #[test]
    fn channel_ref_round_trips_through_valkey_encoding() {
        let chan = ChannelRef {
            name: "World".into(),
            id: 5,
        };
        assert_eq!(encode_channel_ref(&chan), "5:World");
        assert_eq!(decode_channel_ref("5:World"), Some(chan));
        assert_eq!(decode_channel_ref("nope"), None);
        assert_eq!(decode_channel_ref("5:"), None);
    }

    #[tokio::test]
    #[serial]
    async fn malformed_env_seed_is_ignored_not_fatal() {
        reset_channel_ids();
        std::env::set_var("WOW_CHANNEL_ID", "not-a-number");
        let chan = resolve_channel("cold-start").await;
        std::env::remove_var("WOW_CHANNEL_ID");
        assert_eq!(chan, None);
    }

    #[serial]
    #[test]
    fn echo_survives_a_sender_name_rewrite() {
        mark_echo("Kbve[irc]", "echo rewrite probe");
        assert!(take_echo("kbve", "echo rewrite probe"));
        assert!(!take_echo("kbve", "echo rewrite probe"));
    }

    #[serial]
    #[test]
    fn echo_content_backstop_catches_a_full_rename() {
        mark_echo("Kbve[irc]", "content backstop probe");
        assert!(take_echo("SomeoneElse", "content backstop probe"));
    }

    #[test]
    fn echo_name_collapses_tagged_variants() {
        assert_eq!(echo_name("Kbve[wow]"), "kbve");
        assert_eq!(echo_name("Kbve[irc]"), "kbve");
        assert_eq!(echo_name("kbve"), "kbve");
    }
}
