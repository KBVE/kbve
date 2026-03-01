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
                GameAction::UseItem(item_id.to_owned())
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

    #[test]
    fn test_parse_action_all_variants() {
        // Verify all valid parse_action mappings
        assert_eq!(parse_action("atk"), Some(GameAction::Attack));
        assert_eq!(parse_action("def"), Some(GameAction::Defend));
        assert_eq!(parse_action("explore"), Some(GameAction::Explore));
        assert_eq!(parse_action("flee"), Some(GameAction::Flee));
        assert_eq!(parse_action("rest"), Some(GameAction::Rest));
        assert_eq!(parse_action("item"), Some(GameAction::ToggleItems));

        // Unknown strings should return None
        assert_eq!(parse_action("xyz"), None);
        assert_eq!(parse_action("attack"), None);
        assert_eq!(parse_action("defend"), None);
        assert_eq!(parse_action("buy"), None);
        assert_eq!(parse_action("sell"), None);
    }

    #[test]
    fn test_parse_action_case_sensitivity() {
        // Parser is case-sensitive — only lowercase works
        assert!(parse_action("ATK").is_none(), "ATK should not match");
        assert!(parse_action("Atk").is_none(), "Atk should not match");
        assert!(parse_action("aTk").is_none(), "aTk should not match");
        assert!(parse_action("DEF").is_none(), "DEF should not match");
        assert!(parse_action("Def").is_none(), "Def should not match");
        assert!(
            parse_action("EXPLORE").is_none(),
            "EXPLORE should not match"
        );
        assert!(parse_action("Flee").is_none(), "Flee should not match");
        assert!(parse_action("REST").is_none(), "REST should not match");
        assert!(parse_action("ITEM").is_none(), "ITEM should not match");

        // Confirm lowercase still works
        assert!(parse_action("atk").is_some());
        assert!(parse_action("def").is_some());
        assert!(parse_action("explore").is_some());
        assert!(parse_action("flee").is_some());
        assert!(parse_action("rest").is_some());
        assert!(parse_action("item").is_some());
    }

    #[test]
    fn test_useitem_value_parsing() {
        // The useitem handler parses select menu values with format "item_id|..."
        // using: value.split('|').next().unwrap_or(value)
        // Simulate the same parsing logic used in handle_game_component

        // "bomb|1" — item_id should be "bomb"
        let value = "bomb|1";
        let item_id = value.split('|').next().unwrap_or(value);
        assert_eq!(item_id, "bomb");

        // "potion|" — item_id should be "potion"
        let value = "potion|";
        let item_id = value.split('|').next().unwrap_or(value);
        assert_eq!(item_id, "potion");

        // "ward|0" — item_id should be "ward"
        let value = "ward|0";
        let item_id = value.split('|').next().unwrap_or(value);
        assert_eq!(item_id, "ward");

        // Plain value with no delimiter — item_id should be the whole string
        let value = "elixir";
        let item_id = value.split('|').next().unwrap_or(value);
        assert_eq!(item_id, "elixir");

        // Verify that the parsed item_id can construct a valid GameAction::UseItem
        let action = GameAction::UseItem("bomb".to_owned());
        assert_eq!(action, GameAction::UseItem("bomb".to_owned()));

        // Verify target parsing from the second segment
        let value = "bomb|1";
        let parts: Vec<&str> = value.split('|').collect();
        let target: Option<u8> = parts.get(1).and_then(|s| s.parse().ok());
        assert_eq!(target, Some(1));

        let value = "potion|";
        let parts: Vec<&str> = value.split('|').collect();
        let target: Option<u8> = parts.get(1).and_then(|s| s.parse().ok());
        assert_eq!(target, None); // empty string doesn't parse as u8

        let value = "ward|0";
        let parts: Vec<&str> = value.split('|').collect();
        let target: Option<u8> = parts.get(1).and_then(|s| s.parse().ok());
        assert_eq!(target, Some(0));
    }
}
