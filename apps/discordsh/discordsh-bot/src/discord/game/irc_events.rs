//! Fire-and-forget IRC event emission for world events.
//!
//! All functions check if IRC is connected and silently no-op if not.
//! Events are sent to `#world-events` as structured `ChatMessage` objects.

use bevy_chat::{ChatClient, ChatMessage, MessageKind};

const WORLD_EVENTS_CHANNEL: &str = "#world-events";
const PLATFORM: &str = "discord";

/// Emit a boss-killed event to IRC.
pub fn emit_boss_killed(irc: &Option<ChatClient>, player_name: &str, boss_name: &str) {
    let Some(client) = irc else { return };
    let msg = ChatMessage::event(
        MessageKind::Kill,
        player_name,
        PLATFORM,
        WORLD_EVENTS_CHANNEL,
        &format!("{} defeated {}", player_name, boss_name),
        Some(serde_json::json!({"boss": boss_name})),
    );
    let client = client.clone();
    tokio::spawn(async move {
        if let Err(e) = client.send(&msg).await {
            tracing::debug!(error = %e, "IRC boss event send failed");
        }
    });
}

/// Emit a rare item drop event to IRC.
pub fn emit_rare_drop(irc: &Option<ChatClient>, player_name: &str, item_name: &str) {
    let Some(client) = irc else { return };
    let msg = ChatMessage::event(
        MessageKind::RareDrop,
        player_name,
        PLATFORM,
        WORLD_EVENTS_CHANNEL,
        &format!("{} found {}", player_name, item_name),
        Some(serde_json::json!({"item": item_name})),
    );
    let client = client.clone();
    tokio::spawn(async move {
        if let Err(e) = client.send(&msg).await {
            tracing::debug!(error = %e, "IRC drop event send failed");
        }
    });
}

/// Emit a player death event to IRC.
pub fn emit_player_death(irc: &Option<ChatClient>, player_name: &str, cause: &str) {
    let Some(client) = irc else { return };
    let msg = ChatMessage::event(
        MessageKind::Death,
        player_name,
        PLATFORM,
        WORLD_EVENTS_CHANNEL,
        &format!("{} was slain ({})", player_name, cause),
        None,
    );
    let client = client.clone();
    tokio::spawn(async move {
        if let Err(e) = client.send(&msg).await {
            tracing::debug!(error = %e, "IRC death event send failed");
        }
    });
}

/// Emit a dungeon victory event to IRC.
pub fn emit_victory(irc: &Option<ChatClient>, player_name: &str, depth: u32) {
    let Some(client) = irc else { return };
    let msg = ChatMessage::event(
        MessageKind::Custom("VICTORY".to_owned()),
        player_name,
        PLATFORM,
        WORLD_EVENTS_CHANNEL,
        &format!("{} cleared the dungeon (depth {})", player_name, depth),
        Some(serde_json::json!({"depth": depth})),
    );
    let client = client.clone();
    tokio::spawn(async move {
        if let Err(e) = client.send(&msg).await {
            tracing::debug!(error = %e, "IRC victory event send failed");
        }
    });
}

/// Emit a quest completed event to IRC.
pub fn emit_quest_complete(irc: &Option<ChatClient>, player_name: &str, quest_title: &str) {
    let Some(client) = irc else { return };
    let msg = ChatMessage::event(
        MessageKind::QuestComplete,
        player_name,
        PLATFORM,
        WORLD_EVENTS_CHANNEL,
        &format!("{} completed quest: {}", player_name, quest_title),
        Some(serde_json::json!({"quest": quest_title})),
    );
    let client = client.clone();
    tokio::spawn(async move {
        if let Err(e) = client.send(&msg).await {
            tracing::debug!(error = %e, "IRC quest event send failed");
        }
    });
}
