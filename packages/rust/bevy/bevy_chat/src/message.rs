use serde::{Deserialize, Serialize};

/// The kind of message being sent or received.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MessageKind {
    /// Player chat message.
    Chat,
    /// System announcement (server-wide).
    System,
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
    /// Custom event (extensible).
    Custom(String),
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
        let kind_tag = match &self.kind {
            MessageKind::Chat => "CHAT",
            MessageKind::System => "SYSTEM",
            MessageKind::Kill => "EVENT:KILL",
            MessageKind::RareDrop => "EVENT:DROP",
            MessageKind::Capture => "EVENT:CAPTURE",
            MessageKind::QuestComplete => "EVENT:QUEST",
            MessageKind::AreaUnlocked => "EVENT:AREA",
            MessageKind::Death => "EVENT:DEATH",
            MessageKind::Craft => "EVENT:CRAFT",
            MessageKind::Custom(s) => {
                return format!(
                    "PRIVMSG {} :[EVENT:{}] {}@{}: {}",
                    self.channel, s, self.sender, self.platform, self.content
                );
            }
        };

        let mut line = format!(
            "PRIVMSG {} :[{}] {}@{}: {}",
            self.channel, kind_tag, self.sender, self.platform, self.content
        );

        if let Some(ref payload) = self.payload {
            if let Ok(json) = serde_json::to_string(payload) {
                line.push(' ');
                line.push_str(&json);
            }
        }

        line
    }

    /// Parse an IRC PRIVMSG text into a ChatMessage.
    ///
    /// Expected format: `[KIND] sender@platform: content {optional json}`
    /// (The IRC `:` prefix should already be stripped by the caller.)
    pub fn from_irc_privmsg(channel: &str, text: &str) -> Option<Self> {
        // Extract [KIND]
        let text = text.strip_prefix('[')?;
        let (kind_str, rest) = text.split_once("] ")?;

        // Extract sender@platform
        let (sender_platform, rest) = rest.split_once(": ")?;
        let (sender, platform) = sender_platform
            .rsplit_once('@')
            .unwrap_or((sender_platform, "unknown"));

        // Parse kind
        let kind = match kind_str {
            "CHAT" => MessageKind::Chat,
            "SYSTEM" => MessageKind::System,
            "EVENT:KILL" => MessageKind::Kill,
            "EVENT:DROP" => MessageKind::RareDrop,
            "EVENT:CAPTURE" => MessageKind::Capture,
            "EVENT:QUEST" => MessageKind::QuestComplete,
            "EVENT:AREA" => MessageKind::AreaUnlocked,
            "EVENT:DEATH" => MessageKind::Death,
            "EVENT:CRAFT" => MessageKind::Craft,
            other if other.starts_with("EVENT:") => {
                MessageKind::Custom(other.strip_prefix("EVENT:")?.to_owned())
            }
            _ => return None,
        };

        // Try to split content from JSON payload
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
        assert_eq!(parsed.sender, "Hero");
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
    fn parse_custom_event() {
        let parsed = ChatMessage::from_irc_privmsg(
            "#world-events",
            "[EVENT:WEATHER] System@system: A storm approaches",
        )
        .unwrap();
        assert_eq!(parsed.kind, MessageKind::Custom("WEATHER".to_owned()));
    }
}
