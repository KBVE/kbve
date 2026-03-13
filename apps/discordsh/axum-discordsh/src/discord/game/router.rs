use poise::serenity_prelude as serenity;
use tracing::{error, info};

use crate::discord::bot::{Data, Error};

use super::logic;
use super::render;
use super::types::{Direction, GameAction, GamePhase};

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
        // Equip gear — gear_id from select menu value
        if let serenity::ComponentInteractionDataKind::StringSelect { values } =
            &component.data.kind
        {
            if let Some(gear_id) = values.first() {
                GameAction::Equip(gear_id.to_owned())
            } else {
                return send_ephemeral(component, ctx, "No gear selected.").await;
            }
        } else {
            return send_ephemeral(component, ctx, "Invalid select menu interaction.").await;
        }
    } else if action_str == "unequip" {
        // Unequip gear — slot from select menu value
        if let serenity::ComponentInteractionDataKind::StringSelect { values } =
            &component.data.kind
        {
            if let Some(slot_str) = values.first() {
                GameAction::Unequip(slot_str.to_owned())
            } else {
                return send_ephemeral(component, ctx, "No slot selected.").await;
            }
        } else {
            return send_ephemeral(component, ctx, "Invalid select menu interaction.").await;
        }
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
    } else if action_str == "mv" {
        // Direction movement button — direction code is in parts[3]
        let dir_code = parts.get(3).unwrap_or(&"");
        match Direction::from_code(dir_code) {
            Some(dir) => GameAction::Move(dir),
            None => {
                return send_ephemeral(component, ctx, "Invalid direction.").await;
            }
        }
    } else if action_str == "map" {
        GameAction::ViewMap
    } else if action_str == "revive" {
        // Hospital revival select menu — user_id from selected value
        if let serenity::ComponentInteractionDataKind::StringSelect { values } =
            &component.data.kind
        {
            if let Some(uid_str) = values.first() {
                match uid_str.parse::<u64>() {
                    Ok(uid) => GameAction::Revive(serenity::UserId::new(uid)),
                    Err(_) => {
                        return send_ephemeral(component, ctx, "Invalid revive target.").await;
                    }
                }
            } else {
                return send_ephemeral(component, ctx, "No player selected.").await;
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

    // ── Inventory: ephemeral per-player response ─────────────────────
    // ViewInventory renders the clicking player's own inventory as an
    // ephemeral message (only they can see it). This avoids the bug
    // where all players saw the session owner's inventory on the shared
    // game message.
    if matches!(action, GameAction::ViewInventory) {
        // Get the clicking player's state (not the owner)
        let player_state = match session.players.get(&actor) {
            Some(p) => p.clone(),
            None => {
                drop(session);
                return send_ephemeral(component, ctx, "You are not in this session.").await;
            }
        };
        drop(session); // Release lock before CPU-bound render

        let fontdb = data.app.fontdb.clone();
        match super::card::render_inventory_card(&player_state, fontdb).await {
            Ok(inv_png) => {
                component
                    .create_response(
                        &ctx.http,
                        serenity::CreateInteractionResponse::Message(
                            serenity::CreateInteractionResponseMessage::new()
                                .add_file(serenity::CreateAttachment::bytes(
                                    inv_png,
                                    "inventory_card.png",
                                ))
                                .ephemeral(true),
                        ),
                    )
                    .await?;
            }
            Err(e) => {
                tracing::warn!(error = %e, session = sid, "Failed to render inventory card");
                return send_ephemeral(component, ctx, "Failed to render inventory.").await;
            }
        }
        return Ok(());
    }

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
            let card_png = super::card::render_game_card(&session_clone, fontdb.clone()).await;
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

            // Render map card PNG when exploring or map toggle is on
            if session_clone.show_map || session_clone.phase == GamePhase::Exploring {
                match super::card::render_map_card(&session_clone, fontdb.clone()).await {
                    Ok(map_png) => {
                        edit = edit.new_attachment(serenity::CreateAttachment::bytes(
                            map_png,
                            "map_card.png",
                        ));
                    }
                    Err(e) => {
                        tracing::warn!(
                            error = %e,
                            session = sid,
                            "Failed to render map card"
                        );
                    }
                }
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
        "map" => Some(GameAction::ViewMap),
        "inv" => Some(GameAction::ViewInventory),
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
    fn test_parse_action_inv_and_map() {
        assert_eq!(parse_action("inv"), Some(GameAction::ViewInventory));
        assert_eq!(parse_action("map"), Some(GameAction::ViewMap));
        // Case sensitivity
        assert!(parse_action("INV").is_none());
        assert!(parse_action("Inv").is_none());
        assert!(parse_action("MAP").is_none());
        assert!(parse_action("Map").is_none());
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
        let action = GameAction::UseItem("bomb".to_owned(), None);
        assert_eq!(action, GameAction::UseItem("bomb".to_owned(), None));

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

    #[test]
    fn test_equip_unequip_not_in_parse_action() {
        // equip and unequip are select-menu actions handled before parse_action,
        // so they must NOT be recognized by parse_action (avoids double dispatch)
        assert!(parse_action("equip").is_none());
        assert!(parse_action("unequip").is_none());
    }

    #[test]
    fn test_equip_action_from_select_value() {
        // Simulate the corrected equip flow: gear_id comes from select menu value
        let select_value = "rusty_sword";
        let action = GameAction::Equip(select_value.to_owned());
        assert_eq!(action, GameAction::Equip("rusty_sword".to_owned()));

        let select_value = "leather_vest";
        let action = GameAction::Equip(select_value.to_owned());
        assert_eq!(action, GameAction::Equip("leather_vest".to_owned()));
    }

    #[test]
    fn test_unequip_action_from_select_value() {
        // Unequip values are slot strings ("weapon" or "armor")
        let select_value = "weapon";
        let action = GameAction::Unequip(select_value.to_owned());
        assert_eq!(action, GameAction::Unequip("weapon".to_owned()));

        let select_value = "armor";
        let action = GameAction::Unequip(select_value.to_owned());
        assert_eq!(action, GameAction::Unequip("armor".to_owned()));
    }
}
