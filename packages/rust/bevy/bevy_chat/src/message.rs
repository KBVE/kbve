use crate::proto::chat::{ChatEnvelope, ChatKind, Platform};
use serde::{Deserialize, Serialize};

/// The kind of message being sent or received.
///
/// Variants mirror the `kbve.chat.ChatKind` proto enum one-for-one; the
/// `From`/`Into` bridges below are exhaustive, so adding a proto value fails
/// the build until this enum is updated — no silent drift. The serde
/// representation is the snake_case name and is a stable contract for the FFI
/// JSON surface (`chat_drain_messages`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MessageKind {
    /// Reserved / unknown.
    Unspecified,
    /// Player chat message.
    Chat,
    /// System announcement (server-wide).
    System,
    /// User joined a channel.
    Join,
    /// User left a channel.
    Part,
    /// IRC NOTICE (operator hints, mode changes, server announcements).
    Notice,
    /// Boss/enemy killed.
    Kill,
    /// Rare item dropped.
    RareDrop,
    /// Creature captured.
    Capture,
    /// Quest completed.
    QuestComplete,
    /// New area unlocked.
    AreaUnlocked,
    /// Player death.
    Death,
    /// Craft completed.
    Craft,
    /// Custom event (extensible); holds the free-form event label.
    Custom(String),
}

impl From<&MessageKind> for ChatKind {
    fn from(kind: &MessageKind) -> Self {
        match kind {
            MessageKind::Unspecified => ChatKind::Unspecified,
            MessageKind::Chat => ChatKind::Chat,
            MessageKind::System => ChatKind::System,
            MessageKind::Join => ChatKind::Join,
            MessageKind::Part => ChatKind::Part,
            MessageKind::Notice => ChatKind::Notice,
            MessageKind::Kill => ChatKind::EventKill,
            MessageKind::RareDrop => ChatKind::EventRareDrop,
            MessageKind::Capture => ChatKind::EventCapture,
            MessageKind::QuestComplete => ChatKind::EventQuestComplete,
            MessageKind::AreaUnlocked => ChatKind::EventAreaUnlocked,
            MessageKind::Death => ChatKind::EventDeath,
            MessageKind::Craft => ChatKind::EventCraft,
            MessageKind::Custom(_) => ChatKind::Custom,
        }
    }
}

impl From<ChatKind> for MessageKind {
    fn from(kind: ChatKind) -> Self {
        match kind {
            ChatKind::Unspecified => MessageKind::Unspecified,
            ChatKind::Chat => MessageKind::Chat,
            ChatKind::System => MessageKind::System,
            ChatKind::Join => MessageKind::Join,
            ChatKind::Part => MessageKind::Part,
            ChatKind::Notice => MessageKind::Notice,
            ChatKind::EventKill => MessageKind::Kill,
            ChatKind::EventRareDrop => MessageKind::RareDrop,
            ChatKind::EventCapture => MessageKind::Capture,
            ChatKind::EventQuestComplete => MessageKind::QuestComplete,
            ChatKind::EventAreaUnlocked => MessageKind::AreaUnlocked,
            ChatKind::EventDeath => MessageKind::Death,
            ChatKind::EventCraft => MessageKind::Craft,
            ChatKind::Custom => MessageKind::Custom(String::new()),
        }
    }
}

/// Derive the on-wire `[KIND]` token from a message kind. The token is the
/// proto enum name with the `CHAT_KIND_` prefix stripped and a leading
/// `EVENT_` rewritten to `EVENT:` — the same rule the TS codec applies.
fn wire_tag(kind: &MessageKind) -> String {
    if let MessageKind::Custom(name) = kind {
        return format!("EVENT:{name}");
    }
    let name = ChatKind::from(kind).as_str_name();
    let body = name.strip_prefix("CHAT_KIND_").unwrap_or(name);
    match body.strip_prefix("EVENT_") {
        Some(rest) => format!("EVENT:{rest}"),
        None => body.to_owned(),
    }
}

/// Inverse of [`wire_tag`] — resolve a `[KIND]` token back to a message kind.
/// Unknown `EVENT:*` tags collapse to [`MessageKind::Custom`]; anything else
/// unrecognized returns `None` so the caller can fall back to a plain chat.
fn kind_from_wire(tag: &str) -> Option<MessageKind> {
    if let Some(rest) = tag.strip_prefix("EVENT:") {
        let name = format!("CHAT_KIND_EVENT_{rest}");
        return Some(match ChatKind::from_str_name(&name) {
            Some(ck) => MessageKind::from(ck),
            None => MessageKind::Custom(rest.to_owned()),
        });
    }
    ChatKind::from_str_name(&format!("CHAT_KIND_{tag}")).map(MessageKind::from)
}

fn platform_to_proto(platform: &str) -> Platform {
    Platform::from_str_name(&format!("PLATFORM_{}", platform.to_uppercase()))
        .unwrap_or(Platform::Unspecified)
}

fn platform_from_proto(platform: Platform) -> String {
    platform
        .as_str_name()
        .strip_prefix("PLATFORM_")
        .unwrap_or("unknown")
        .to_lowercase()
}

fn json_to_prost_value(value: &serde_json::Value) -> prost_types::Value {
    use prost_types::value::Kind;
    let kind = match value {
        serde_json::Value::Null => Kind::NullValue(0),
        serde_json::Value::Bool(b) => Kind::BoolValue(*b),
        serde_json::Value::Number(n) => Kind::NumberValue(n.as_f64().unwrap_or(0.0)),
        serde_json::Value::String(s) => Kind::StringValue(s.clone()),
        serde_json::Value::Array(items) => Kind::ListValue(prost_types::ListValue {
            values: items.iter().map(json_to_prost_value).collect(),
        }),
        serde_json::Value::Object(_) => Kind::StructValue(json_to_struct(value)),
    };
    prost_types::Value { kind: Some(kind) }
}

fn json_to_struct(value: &serde_json::Value) -> prost_types::Struct {
    match value {
        serde_json::Value::Object(map) => prost_types::Struct {
            fields: map
                .iter()
                .map(|(k, v)| (k.clone(), json_to_prost_value(v)))
                .collect(),
        },
        _ => prost_types::Struct::default(),
    }
}

fn prost_value_to_json(value: &prost_types::Value) -> serde_json::Value {
    use prost_types::value::Kind;
    match &value.kind {
        None | Some(Kind::NullValue(_)) => serde_json::Value::Null,
        Some(Kind::BoolValue(b)) => serde_json::Value::Bool(*b),
        Some(Kind::NumberValue(n)) => serde_json::Number::from_f64(*n)
            .map(serde_json::Value::Number)
            .unwrap_or(serde_json::Value::Null),
        Some(Kind::StringValue(s)) => serde_json::Value::String(s.clone()),
        Some(Kind::ListValue(list)) => {
            serde_json::Value::Array(list.values.iter().map(prost_value_to_json).collect())
        }
        Some(Kind::StructValue(s)) => serde_json::Value::Object(
            s.fields
                .iter()
                .map(|(k, v)| (k.clone(), prost_value_to_json(v)))
                .collect(),
        ),
    }
}

/// A structured chat/event message.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    /// Message type.
    pub kind: MessageKind,
    /// Sender display name (player name, NPC name, or "System").
    pub sender: String,
    /// Source platform ("discord", "isometric", "system").
    pub platform: String,
    /// IRC channel this was sent to/received from (e.g. "#global").
    pub channel: String,
    /// Human-readable message content.
    pub content: String,
    /// Optional structured payload (JSON) for events.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub payload: Option<serde_json::Value>,
}

impl ChatMessage {
    /// Create a plain chat message.
    pub fn chat(sender: &str, platform: &str, channel: &str, content: &str) -> Self {
        Self {
            kind: MessageKind::Chat,
            sender: sender.to_owned(),
            platform: platform.to_owned(),
            channel: channel.to_owned(),
            content: content.to_owned(),
            payload: None,
        }
    }

    /// Create a world event message.
    pub fn event(
        kind: MessageKind,
        sender: &str,
        platform: &str,
        channel: &str,
        content: &str,
        payload: Option<serde_json::Value>,
    ) -> Self {
        Self {
            kind,
            sender: sender.to_owned(),
            platform: platform.to_owned(),
            channel: channel.to_owned(),
            content: content.to_owned(),
            payload,
        }
    }

    /// Encode this message as an IRC PRIVMSG line.
    ///
    /// Format: `PRIVMSG #channel :[KIND] sender@platform: content {json}`
    pub fn to_irc_privmsg(&self) -> String {
        let mut line = format!(
            "PRIVMSG {} :[{}] {}@{}: {}",
            self.channel,
            wire_tag(&self.kind),
            self.sender,
            self.platform,
            self.content
        );

        if let Some(ref payload) = self.payload
            && let Ok(json) = serde_json::to_string(payload)
        {
            line.push(' ');
            line.push_str(&json);
        }

        line
    }

    /// Parse an IRC PRIVMSG text into a ChatMessage.
    ///
    /// Expected format: `[KIND] sender@platform: content {optional json}`
    /// (The IRC `:` prefix should already be stripped by the caller.)
    pub fn from_irc_privmsg(channel: &str, text: &str) -> Option<Self> {
        let text = text.strip_prefix('[')?;
        let (kind_str, rest) = text.split_once("] ")?;

        let (sender_platform, rest) = rest.split_once(": ")?;
        let (sender, platform) = sender_platform
            .rsplit_once('@')
            .unwrap_or((sender_platform, "unknown"));

        let kind = kind_from_wire(kind_str)?;

        let (content, payload) = if let Some(idx) = rest.find(" {") {
            let (c, j) = rest.split_at(idx);
            let payload = serde_json::from_str(j.trim()).ok();
            (c.to_owned(), payload)
        } else {
            (rest.to_owned(), None)
        };

        Some(Self {
            kind,
            sender: sender.to_owned(),
            platform: platform.to_owned(),
            channel: channel.to_owned(),
            content,
            payload,
        })
    }

    /// Parse an IRC PRIVMSG, falling back to a plain `Chat` message (platform
    /// `irc`) for lines without the `[KIND] sender@platform:` wrapper — so
    /// chatter from real IRC clients still reaches game clients. `sender` is
    /// the IRC nick from the line prefix, used only for the plain fallback.
    pub fn from_irc_or_plain(channel: &str, sender: &str, text: &str) -> Self {
        Self::from_irc_privmsg(channel, text)
            .unwrap_or_else(|| Self::chat(sender, "irc", channel, text))
    }
}

impl From<&ChatMessage> for ChatEnvelope {
    fn from(msg: &ChatMessage) -> Self {
        let custom_kind = match &msg.kind {
            MessageKind::Custom(name) => name.clone(),
            _ => String::new(),
        };
        ChatEnvelope {
            kind: ChatKind::from(&msg.kind) as i32,
            sender: msg.sender.clone(),
            platform: platform_to_proto(&msg.platform) as i32,
            channel: msg.channel.clone(),
            content: msg.content.clone(),
            payload: msg.payload.as_ref().map(json_to_struct),
            timestamp_ms: 0,
            custom_kind,
        }
    }
}

impl From<ChatEnvelope> for ChatMessage {
    fn from(env: ChatEnvelope) -> Self {
        let kind = match ChatKind::try_from(env.kind).unwrap_or(ChatKind::Unspecified) {
            ChatKind::Custom => MessageKind::Custom(env.custom_kind),
            other => MessageKind::from(other),
        };
        let payload = env.payload.map(|s| {
            prost_value_to_json(&prost_types::Value {
                kind: Some(prost_types::value::Kind::StructValue(s)),
            })
        });
        Self {
            kind,
            sender: env.sender,
            platform: platform_from_proto(
                Platform::try_from(env.platform).unwrap_or(Platform::Unspecified),
            ),
            channel: env.channel,
            content: env.content,
            payload,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_chat() {
        let msg = ChatMessage::chat("Player1", "discord", "#global", "hello world");
        let irc = msg.to_irc_privmsg();
        assert_eq!(irc, "PRIVMSG #global :[CHAT] Player1@discord: hello world");

        let parsed =
            ChatMessage::from_irc_privmsg("#global", "[CHAT] Player1@discord: hello world")
                .unwrap();
        assert_eq!(parsed.kind, MessageKind::Chat);
        assert_eq!(parsed.sender, "Player1");
        assert_eq!(parsed.platform, "discord");
        assert_eq!(parsed.content, "hello world");
        assert!(parsed.payload.is_none());
    }

    #[test]
    fn from_irc_or_plain_wraps_bare_irc_lines() {
        let wrapped = ChatMessage::from_irc_or_plain("#general", "ergo", "[CHAT] bob@discord: hi");
        assert_eq!(wrapped.kind, MessageKind::Chat);
        assert_eq!(wrapped.sender, "bob");
        assert_eq!(wrapped.platform, "discord");
        assert_eq!(wrapped.content, "hi");

        let plain = ChatMessage::from_irc_or_plain("#general", "carol", "just chatting");
        assert_eq!(plain.kind, MessageKind::Chat);
        assert_eq!(plain.sender, "carol");
        assert_eq!(plain.platform, "irc");
        assert_eq!(plain.content, "just chatting");
    }

    #[test]
    fn event_tags_use_long_proto_names() {
        let drop = ChatMessage::event(
            MessageKind::RareDrop,
            "Hero",
            "discord",
            "#world-events",
            "found a relic",
            None,
        );
        assert!(drop.to_irc_privmsg().contains("[EVENT:RARE_DROP]"));

        let parsed = ChatMessage::from_irc_privmsg(
            "#world-events",
            "[EVENT:QUEST_COMPLETE] Hero@discord: done",
        )
        .unwrap();
        assert_eq!(parsed.kind, MessageKind::QuestComplete);
    }

    #[test]
    fn roundtrip_event_with_payload() {
        let payload = serde_json::json!({"target": "Glass Golem", "xp": 100});
        let msg = ChatMessage::event(
            MessageKind::Kill,
            "Hero",
            "discord",
            "#world-events",
            "Hero slew the Glass Golem",
            Some(payload.clone()),
        );
        let irc = msg.to_irc_privmsg();
        assert!(irc.starts_with(
            "PRIVMSG #world-events :[EVENT:KILL] Hero@discord: Hero slew the Glass Golem"
        ));
        assert!(irc.contains("Glass Golem"));

        let text = irc
            .strip_prefix("PRIVMSG #world-events :")
            .expect("expected PRIVMSG prefix");
        let parsed = ChatMessage::from_irc_privmsg("#world-events", text).unwrap();
        assert_eq!(parsed.kind, MessageKind::Kill);
        assert!(parsed.payload.is_some());
    }

    #[test]
    fn parse_system_message() {
        let parsed = ChatMessage::from_irc_privmsg(
            "#global",
            "[SYSTEM] Server@system: Maintenance in 5 minutes",
        )
        .unwrap();
        assert_eq!(parsed.kind, MessageKind::System);
        assert_eq!(parsed.sender, "Server");
        assert_eq!(parsed.platform, "system");
    }

    #[test]
    fn parse_notice_message() {
        let parsed =
            ChatMessage::from_irc_privmsg("#global", "[NOTICE] Server@system: +o granted").unwrap();
        assert_eq!(parsed.kind, MessageKind::Notice);
    }

    #[test]
    fn parse_custom_event() {
        let parsed = ChatMessage::from_irc_privmsg(
            "#world-events",
            "[EVENT:WEATHER] System@system: A storm approaches",
        )
        .unwrap();
        assert_eq!(parsed.kind, MessageKind::Custom("WEATHER".to_owned()));
    }

    #[test]
    fn envelope_roundtrip_preserves_kind_and_payload() {
        let msg = ChatMessage::event(
            MessageKind::Kill,
            "Hero",
            "discord",
            "#world-events",
            "Hero slew the Glass Golem",
            Some(serde_json::json!({"target": "Glass Golem", "xp": 100})),
        );
        let env: ChatEnvelope = (&msg).into();
        assert_eq!(env.kind, ChatKind::EventKill as i32);
        assert_eq!(env.platform, Platform::Discord as i32);

        let back: ChatMessage = env.into();
        assert_eq!(back.kind, MessageKind::Kill);
        assert_eq!(back.platform, "discord");
        // google.protobuf.Struct carries all numbers as f64, so ints come back
        // as floats (100 -> 100.0); compare field-wise to document the lossiness.
        let payload = back.payload.expect("payload survives the round-trip");
        assert_eq!(payload["target"], serde_json::json!("Glass Golem"));
        assert_eq!(payload["xp"].as_f64(), Some(100.0));
    }

    #[test]
    fn envelope_roundtrip_custom_label() {
        let msg = ChatMessage::event(
            MessageKind::Custom("WEATHER".to_owned()),
            "System",
            "system",
            "#world-events",
            "A storm approaches",
            None,
        );
        let env: ChatEnvelope = (&msg).into();
        assert_eq!(env.kind, ChatKind::Custom as i32);
        assert_eq!(env.custom_kind, "WEATHER");

        let back: ChatMessage = env.into();
        assert_eq!(back.kind, MessageKind::Custom("WEATHER".to_owned()));
    }
}
