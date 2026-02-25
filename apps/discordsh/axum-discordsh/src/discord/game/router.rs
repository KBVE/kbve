use poise::serenity_prelude as serenity;
use tracing::info;

use crate::discord::bot::{Data, Error};

use super::logic;
use super::render;
use super::types::GameAction;

/// Handle a component interaction whose `custom_id` starts with `"dng|"`.
///
/// Custom ID format: `dng|<short_sid>|<action>|<arg>`
pub async fn handle_game_component(
    component: &serenity::ComponentInteraction,
    ctx: &serenity::Context,
    data: &Data,
) -> Result<(), Error> {
    let custom_id = &component.data.custom_id;
    let parts: Vec<&str> = custom_id.split('|').collect();

    if parts.len() < 3 {
        return send_ephemeral(component, ctx, "Invalid interaction.").await;
    }

    let sid = parts[1];
    let action_str = parts[2];

    // Look up session
    let session_handle = match data.app.sessions.get(sid) {
        Some(h) => h,
        None => {
            return send_ephemeral(component, ctx, "Session not found or expired.").await;
        }
    };

    // Try to acquire per-session lock (non-blocking)
    let mut session = match session_handle.try_lock() {
        Ok(guard) => guard,
        Err(_) => {
            return send_ephemeral(component, ctx, "Action in progress, try again.").await;
        }
    };

    // Handle select menu item usage
    let action = if action_str == "useitem" {
        // For select menus, the selected value is in component.data.kind
        if let serenity::ComponentInteractionDataKind::StringSelect { values } =
            &component.data.kind
        {
            if let Some(value) = values.first() {
                // Value format: "item_id|qty"
                let item_id = value.split('|').next().unwrap_or(value);
                GameAction::UseItem(item_id.to_owned())
            } else {
                return send_ephemeral(component, ctx, "No item selected.").await;
            }
        } else {
            return send_ephemeral(component, ctx, "Invalid select menu interaction.").await;
        }
    } else {
        match parse_action(action_str) {
            Some(a) => a,
            None => {
                return send_ephemeral(component, ctx, "Unknown action.").await;
            }
        }
    };

    let actor = component.user.id;

    info!(
        session = sid,
        user = %actor,
        action = ?action,
        "Game interaction"
    );

    // Acknowledge immediately so Discord knows we received the interaction.
    // This prevents "Unknown interaction" errors when processing takes time.
    component
        .create_response(&ctx.http, serenity::CreateInteractionResponse::Acknowledge)
        .await?;

    // Apply action (now safe — we already acknowledged the interaction)
    match logic::apply_action(&mut session, action, actor) {
        Ok(_logs) => {
            // Render updated embed + components
            let embed = render::render_embed(&session);
            let components = render::render_components(&session);

            component
                .edit_response(
                    &ctx.http,
                    serenity::EditInteractionResponse::new()
                        .embed(embed)
                        .components(components),
                )
                .await?;
        }
        Err(msg) => {
            component
                .edit_response(
                    &ctx.http,
                    serenity::EditInteractionResponse::new().content(msg),
                )
                .await?;
        }
    }

    Ok(())
}

fn parse_action(s: &str) -> Option<GameAction> {
    match s {
        "atk" => Some(GameAction::Attack),
        "def" => Some(GameAction::Defend),
        "item" => Some(GameAction::ToggleItems),
        "explore" => Some(GameAction::Explore),
        "flee" => Some(GameAction::Flee),
        _ => None,
    }
}

async fn send_ephemeral(
    component: &serenity::ComponentInteraction,
    ctx: &serenity::Context,
    msg: &str,
) -> Result<(), Error> {
    component
        .create_response(
            &ctx.http,
            serenity::CreateInteractionResponse::Message(
                serenity::CreateInteractionResponseMessage::new()
                    .content(msg)
                    .ephemeral(true),
            ),
        )
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_action_valid() {
        assert_eq!(parse_action("atk"), Some(GameAction::Attack));
        assert_eq!(parse_action("def"), Some(GameAction::Defend));
        assert_eq!(parse_action("item"), Some(GameAction::ToggleItems));
        assert_eq!(parse_action("explore"), Some(GameAction::Explore));
        assert_eq!(parse_action("flee"), Some(GameAction::Flee));
    }

    #[test]
    fn parse_action_invalid() {
        assert!(parse_action("unknown").is_none());
        assert!(parse_action("").is_none());
    }
}
