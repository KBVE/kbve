use poise::serenity_prelude as serenity;
use tracing::{error, info};

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

    // Handle select menu and special button actions
    let action = if action_str == "useitem" {
        // For select menus, the selected value is in component.data.kind
        if let serenity::ComponentInteractionDataKind::StringSelect { values } =
            &component.data.kind
        {
            if let Some(value) = values.first() {
                // Value format: "item_id|qty"
                let item_id = value.split('|').next().unwrap_or(value);
                GameAction::UseItem(item_id.to_owned(), None)
            } else {
                return send_ephemeral(component, ctx, "No item selected.").await;
            }
        } else {
            return send_ephemeral(component, ctx, "Invalid select menu interaction.").await;
        }
    } else if action_str == "buy" {
        // Merchant buy select menu
        if let serenity::ComponentInteractionDataKind::StringSelect { values } =
            &component.data.kind
        {
            if let Some(item_id) = values.first() {
                GameAction::Buy(item_id.to_owned())
            } else {
                return send_ephemeral(component, ctx, "No item selected.").await;
            }
        } else {
            return send_ephemeral(component, ctx, "Invalid select menu interaction.").await;
        }
    } else if action_str == "atkt" {
        // Attack target select menu — enemy index from selected value
        if let serenity::ComponentInteractionDataKind::StringSelect { values } =
            &component.data.kind
        {
            if let Some(idx_str) = values.first() {
                match idx_str.parse::<u8>() {
                    Ok(idx) => GameAction::AttackTarget(idx),
                    Err(_) => {
                        return send_ephemeral(component, ctx, "Invalid target.").await;
                    }
                }
            } else {
                return send_ephemeral(component, ctx, "No target selected.").await;
            }
        } else {
            return send_ephemeral(component, ctx, "Invalid select menu interaction.").await;
        }
    } else if action_str == "equip" {
        // Equip gear — gear_id from parts[3]
        let gear_id = parts.get(3).unwrap_or(&"");
        if gear_id.is_empty() {
            return send_ephemeral(component, ctx, "No gear specified.").await;
        }
        GameAction::Equip(gear_id.to_string())
    } else if action_str == "heal" {
        // Cleric heal ally — user_id from parts[3]
        let uid_str = parts.get(3).unwrap_or(&"0");
        match uid_str.parse::<u64>() {
            Ok(uid) => GameAction::HealAlly(serenity::UserId::new(uid)),
            Err(_) => {
                return send_ephemeral(component, ctx, "Invalid heal target.").await;
            }
        }
    } else if action_str == "story" {
        // Story choice button — index is in parts[3]
        let idx_str = parts.get(3).unwrap_or(&"0");
        match idx_str.parse::<usize>() {
            Ok(idx) => GameAction::StoryChoice(idx),
            Err(_) => {
                return send_ephemeral(component, ctx, "Invalid story choice.").await;
            }
        }
    } else if action_str == "useitem_t" {
        // Targeted item use select menu — value format: "item_id|target_idx"
        if let serenity::ComponentInteractionDataKind::StringSelect { values } =
            &component.data.kind
        {
            if let Some(value) = values.first() {
                let mut parts_iter = value.splitn(2, '|');
                let item_id = parts_iter.next().unwrap_or("").to_owned();
                let target_idx = parts_iter.next().and_then(|s| {
                    if s.is_empty() {
                        None
                    } else {
                        s.parse::<u8>().ok()
                    }
                });
                if item_id.is_empty() {
                    return send_ephemeral(component, ctx, "Invalid item.").await;
                }
                GameAction::UseItem(item_id, target_idx)
            } else {
                return send_ephemeral(component, ctx, "No item selected.").await;
            }
        } else {
            return send_ephemeral(component, ctx, "Invalid select menu interaction.").await;
        }
    } else if action_str == "sell" {
        if let serenity::ComponentInteractionDataKind::StringSelect { values } =
            &component.data.kind
        {
            if let Some(item_id) = values.first() {
                GameAction::Sell(item_id.to_owned())
            } else {
                return send_ephemeral(component, ctx, "No item selected.").await;
            }
        } else {
            return send_ephemeral(component, ctx, "Invalid interaction.").await;
        }
    } else if action_str == "room" {
        let idx_str = parts.get(3).unwrap_or(&"0");
        match idx_str.parse::<u8>() {
            Ok(idx) => GameAction::RoomChoice(idx),
            Err(_) => {
                return send_ephemeral(component, ctx, "Invalid room choice.").await;
            }
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
    if let Err(e) = component
        .create_response(&ctx.http, serenity::CreateInteractionResponse::Acknowledge)
        .await
    {
        error!(
            error = %e,
            session = sid,
            user = %actor,
            action = ?action,
            "Failed to acknowledge game interaction"
        );
        return Err(e.into());
    }

    // Apply action (now safe — we already acknowledged the interaction)
    match logic::apply_action(&mut session, action.clone(), actor) {
        Ok(_logs) => {
            // Render components while we still hold the lock
            let components = render::render_components(&session);
            let session_clone = session.clone();
            drop(session); // Release lock before CPU-bound render

            // Render game card PNG on a blocking thread
            let fontdb = data.app.fontdb.clone();
            let card_png = super::card::render_game_card(&session_clone, fontdb).await;
            if let Err(ref e) = card_png {
                tracing::warn!(
                    error = %e,
                    session = sid,
                    "Failed to render game card"
                );
            }
            let has_card = card_png.is_ok();
            let embed = render::render_embed(&session_clone, has_card);

            let mut edit = serenity::EditInteractionResponse::new()
                .embed(embed)
                .components(components);

            if let Ok(png) = card_png {
                edit = edit.new_attachment(serenity::CreateAttachment::bytes(png, "game_card.png"));
            }

            if let Err(e) = component.edit_response(&ctx.http, edit).await {
                error!(
                    error = %e,
                    session = sid,
                    action = ?action,
                    "Failed to send game interaction response"
                );
            }
        }
        Err(msg) => {
            if let Err(e) = component
                .edit_response(
                    &ctx.http,
                    serenity::EditInteractionResponse::new().content(msg),
                )
                .await
            {
                error!(
                    error = %e,
                    session = sid,
                    action = ?action,
                    "Failed to send game error response"
                );
            }
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
        "rest" => Some(GameAction::Rest),
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
        assert_eq!(parse_action("rest"), Some(GameAction::Rest));
    }

    #[test]
    fn parse_action_invalid() {
        assert!(parse_action("unknown").is_none());
        assert!(parse_action("").is_none());
    }
}
