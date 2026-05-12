use std::sync::Arc;

use bevy_chat::{ChatMessage, MessageKind};
use poise::serenity_prelude as serenity;
use tracing::{debug, error, info, warn};

use crate::state::AppState;

const MAX_RELAY_LEN: usize = 350;
const PLATFORM_DISCORD: &str = "discord";

pub async fn handle_discord_message(message: &serenity::Message, app: &Arc<AppState>) {
    let Some(relay) = app.relay.as_ref() else {
        return;
    };
    let Some(irc) = app.irc.as_ref() else {
        return;
    };
    if message.author.bot {
        return;
    }
    if message.guild_id != Some(relay.guild_id) || message.channel_id != relay.channel_id {
        return;
    }

    let content = sanitize(&message.content);
    if content.is_empty() {
        return;
    }
    let sender = message
        .author
        .global_name
        .clone()
        .unwrap_or_else(|| message.author.name.clone());

    let chat = ChatMessage::chat(&sender, PLATFORM_DISCORD, &relay.irc_channel, &content);
    if let Err(e) = irc.send(&chat).await {
        warn!(error = %e, "Failed to relay Discord -> IRC");
    } else {
        debug!(sender = %sender, "Relayed Discord -> IRC");
    }
}

pub fn spawn_irc_forwarder(app: Arc<AppState>, http: Arc<serenity::Http>) {
    let Some(relay) = app.relay.clone() else {
        return;
    };
    let Some(irc) = app.irc.as_ref() else {
        return;
    };
    let mut rx = irc.subscribe();
    info!(
        irc_channel = %relay.irc_channel,
        discord_channel = %relay.channel_id,
        "Spawning IRC -> Discord forwarder"
    );

    tokio::spawn(async move {
        loop {
            match rx.recv().await {
                Ok(msg) => {
                    if !should_forward_irc(&msg, &relay.irc_channel) {
                        continue;
                    }
                    let body = format_irc_for_discord(&msg);
                    if let Err(e) = relay.channel_id.say(&http, body).await {
                        warn!(error = %e, "Failed to relay IRC -> Discord");
                    }
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(skipped)) => {
                    warn!(skipped, "IRC -> Discord forwarder lagged, dropped messages");
                }
                Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                    error!("IRC -> Discord forwarder channel closed; exiting task");
                    break;
                }
            }
        }
    });
}

fn should_forward_irc(msg: &ChatMessage, target_channel: &str) -> bool {
    if msg.channel != target_channel {
        return false;
    }
    if msg.platform == PLATFORM_DISCORD {
        return false;
    }
    matches!(msg.kind, MessageKind::Chat)
}

fn format_irc_for_discord(msg: &ChatMessage) -> String {
    let sender = sanitize(&msg.sender);
    let content = sanitize(&msg.content);
    let head = if sender.is_empty() {
        "**IRC**".to_owned()
    } else {
        format!("**IRC \u{2022} {sender}**")
    };
    if content.is_empty() {
        head
    } else {
        format!("{head}: {content}")
    }
}

fn sanitize(input: &str) -> String {
    let stripped = input.trim();
    if stripped.is_empty() {
        return String::new();
    }
    let neutralised: String = stripped
        .chars()
        .map(|c| match c {
            '\r' | '\n' => ' ',
            '`' => '\'',
            '@' => '＠',
            other => other,
        })
        .collect();
    if neutralised.chars().count() > MAX_RELAY_LEN {
        neutralised.chars().take(MAX_RELAY_LEN).collect::<String>() + "…"
    } else {
        neutralised
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn forwarder_skips_non_chat() {
        let msg = ChatMessage::event(
            MessageKind::Kill,
            "Bob",
            "isometric",
            "#kbve",
            "killed something",
            None,
        );
        assert!(!should_forward_irc(&msg, "#kbve"));
    }

    #[test]
    fn forwarder_skips_other_channels() {
        let msg = ChatMessage::chat("Bob", "irc", "#other", "hi");
        assert!(!should_forward_irc(&msg, "#kbve"));
    }

    #[test]
    fn forwarder_skips_discord_platform() {
        let msg = ChatMessage::chat("Alice", PLATFORM_DISCORD, "#kbve", "hi");
        assert!(!should_forward_irc(&msg, "#kbve"));
    }

    #[test]
    fn forwarder_passes_chat_from_irc() {
        let msg = ChatMessage::chat("Bob", "irc", "#kbve", "hello there");
        assert!(should_forward_irc(&msg, "#kbve"));
    }

    #[test]
    fn sanitize_strips_at_signs_and_backticks() {
        let out = sanitize("hey @everyone `pwn`");
        assert!(!out.contains('@'));
        assert!(!out.contains('`'));
    }

    #[test]
    fn sanitize_caps_length() {
        let long = "a".repeat(500);
        let out = sanitize(&long);
        assert!(out.chars().count() <= MAX_RELAY_LEN + 1);
    }
}
