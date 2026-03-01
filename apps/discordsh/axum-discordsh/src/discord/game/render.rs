use poise::serenity_prelude as serenity;

use super::types::*;

// ── Colors ──────────────────────────────────────────────────────────

const COLOR_SAFE: u32 = 0x2ECC71; // green
const COLOR_COMBAT: u32 = 0xE67E22; // orange
const COLOR_CRITICAL: u32 = 0xE74C3C; // red
const COLOR_GAME_OVER: u32 = 0x95A5A6; // grey
const COLOR_VICTORY: u32 = 0xF1C40F; // gold
const COLOR_REST: u32 = 0x3498DB; // blue
const COLOR_CITY: u32 = 0x9B59B6; // purple

fn phase_color(session: &SessionState) -> u32 {
    let owner = session.owner_player();
    match &session.phase {
        GamePhase::GameOver(GameOverReason::Victory) => COLOR_VICTORY,
        GamePhase::GameOver(_) => COLOR_GAME_OVER,
        _ if owner.hp <= owner.max_hp / 4 => COLOR_CRITICAL,
        GamePhase::Combat | GamePhase::WaitingForActions => COLOR_COMBAT,
        GamePhase::Trap => COLOR_COMBAT,
        GamePhase::Treasure => COLOR_VICTORY,
        GamePhase::Hallway => COLOR_SAFE,
        GamePhase::Rest => COLOR_REST,
        GamePhase::City => COLOR_CITY,
        _ => COLOR_SAFE,
    }
}

// ── HP bar ──────────────────────────────────────────────────────────

/// Render an HP bar like `♥♥♥♥♡` **32/50**
///
/// Each heart represents `points_per_heart` HP (default 10).
/// ♥ = filled, ♡ = empty.
pub fn hp_bar(current: i32, max: i32, points_per_heart: i32) -> String {
    let current = current.max(0);
    let total_hearts = (max + points_per_heart - 1) / points_per_heart;
    let filled_hearts = current / points_per_heart;
    let empty_hearts = total_hearts - filled_hearts;

    format!(
        "{}{}  **{}/{}**",
        "\u{2665}".repeat(filled_hearts as usize),
        "\u{2661}".repeat(empty_hearts as usize),
        current,
        max
    )
}

/// Render a block progress bar like `♦ [████░░░░░░]` **20/60**
///
/// Useful for expandable resource pools (mana, stamina, XP, etc.)
/// where the total can grow over time.
pub fn progress_bar(label: &str, current: i32, max: i32, width: usize) -> String {
    let current = current.max(0);
    let ratio = if max > 0 {
        current as f32 / max as f32
    } else {
        0.0
    };
    let filled = (ratio * width as f32).round() as usize;
    let empty = width.saturating_sub(filled);

    format!(
        "{} `[{}{}]` **{}/{}**",
        label,
        "\u{2588}".repeat(filled),
        "\u{2591}".repeat(empty),
        current,
        max
    )
}

// ── Intent description ──────────────────────────────────────────────

pub fn intent_description(intent: &Intent) -> String {
    match intent {
        Intent::Attack { dmg } => format!("\u{2660} Attack ({dmg} dmg)"),
        Intent::HeavyAttack { dmg } => {
            format!("\u{2620} Heavy blow ({dmg} dmg)")
        }
        Intent::Defend { armor } => {
            format!("\u{2726} Brace (+{armor} armor)")
        }
        Intent::Charge => "\u{2605} Charging...".to_owned(),
        Intent::Flee => "\u{2663} Retreating...".to_owned(),
        Intent::Debuff {
            effect,
            stacks,
            turns,
        } => {
            format!(
                "\u{2622} Debuff ({:?} x{}, {} turns)",
                effect, stacks, turns
            )
        }
        Intent::AoeAttack { dmg } => format!("\u{1F4A5} AoE Attack ({dmg} dmg)"),
        Intent::HealSelf { amount } => format!("\u{2764} Heal Self (+{amount} HP)"),
    }
}

// ── Effect display ──────────────────────────────────────────────────

fn format_effects(effects: &[EffectInstance]) -> Option<String> {
    if effects.is_empty() {
        return None;
    }
    let parts: Vec<String> = effects
        .iter()
        .map(|e| {
            let label = match e.kind {
                EffectKind::Poison => "\u{2622} Poison",     // ☢
                EffectKind::Burning => "\u{2666} Burning",   // ♦
                EffectKind::Bleed => "\u{2660} Bleed",       // ♠
                EffectKind::Shielded => "\u{2726} Shielded", // ✦
                EffectKind::Weakened => "\u{2727} Weakened", // ✧
                EffectKind::Stunned => "\u{2620} Stunned",   // ☠
                EffectKind::Sharpened => "\u{2742} Sharp",   // ❂
                EffectKind::Thorns => "\u{2748} Thorns",     // ❈
            };
            if e.stacks > 1 {
                format!("{label} x{} ({} turns)", e.stacks, e.turns_left)
            } else {
                format!("{label} ({} turns)", e.turns_left)
            }
        })
        .collect();
    Some(parts.join(", "))
}

// ── Embed builder ───────────────────────────────────────────────────

/// Build the main game embed from session state.
///
/// When `with_card` is `true`, player/enemy/room stats are omitted
/// (they're rendered in the attached PNG) and the embed references the
/// card image via `attachment://game_card.png`.
///
/// Pure function — no async, no side effects.
pub fn render_embed(session: &SessionState, with_card: bool) -> serenity::CreateEmbed {
    let title = format!(
        "The Glass Catacombs -- Room {}: {}",
        session.room.index + 1,
        session.room.name
    );

    let description = match &session.phase {
        GamePhase::GameOver(GameOverReason::Victory) => {
            "You have conquered The Glass Catacombs. Glory awaits.".to_owned()
        }
        GamePhase::GameOver(GameOverReason::Defeated) => {
            "Your adventure ends here. The catacombs claim another soul.".to_owned()
        }
        GamePhase::GameOver(GameOverReason::Escaped) => {
            "You escaped the dungeon, living to fight another day.".to_owned()
        }
        GamePhase::GameOver(GameOverReason::Expired) => {
            "Session expired due to inactivity.".to_owned()
        }
        _ => format!("*{}*", session.room.description),
    };

    let mut embed = serenity::CreateEmbed::new()
        .title(title)
        .description(description)
        .color(phase_color(session));

    // Attach game card image when available
    if with_card {
        embed = embed.image("attachment://game_card.png");
    }

    // Game Over stats summary
    if matches!(session.phase, GamePhase::GameOver(_)) {
        let owner = session.owner_player();
        let mut stats = vec![
            format!("Rooms Cleared: {}", owner.lifetime_rooms_cleared),
            format!("Enemies Killed: {}", owner.lifetime_kills),
            format!("Gold Earned: {}", owner.lifetime_gold_earned),
            format!("Bosses Defeated: {}", owner.lifetime_bosses_defeated),
            format!("Final Level: {}", owner.level),
        ];
        if let Some(ref wep) = owner.weapon {
            if let Some(gear) = super::content::find_gear(wep) {
                stats.push(format!("Weapon: {} {}", gear.emoji, gear.name));
            }
        }
        if let Some(ref arm) = owner.armor_gear {
            if let Some(gear) = super::content::find_gear(arm) {
                stats.push(format!("Armor: {} {}", gear.emoji, gear.name));
            }
        }
        embed = embed.field("-- Final Stats --", stats.join("\n"), false);
    }

    // Player stats — unified roster in party mode, owner-only in solo
    if session.mode == SessionMode::Party && session.players.len() > 1 {
        for (_, player) in session.roster() {
            let class_badge = format!("{} {}", player.class.emoji(), player.class.label());
            let mut lines = vec![
                format!("{} Lv.{}", class_badge, player.level),
                hp_bar(player.hp, player.max_hp, 10),
                format!("DEF `{}`  Gold `{}`", player.armor, player.gold),
                progress_bar("\u{2726}", player.xp as i32, player.xp_to_next as i32, 8),
            ];
            if let Some(ref wep) = player.weapon {
                if let Some(gear) = super::content::find_gear(wep) {
                    lines.push(format!("Weapon: {} {}", gear.emoji, gear.name));
                }
            }
            if let Some(ref arm) = player.armor_gear {
                if let Some(gear) = super::content::find_gear(arm) {
                    lines.push(format!("Armor: {} {}", gear.emoji, gear.name));
                }
            }
            if let Some(fx) = format_effects(&player.effects) {
                lines.push(format!("Status: {fx}"));
            }
            if !player.alive {
                lines.push("**DEFEATED**".to_owned());
            }
            let member_badge = match &player.member_status {
                MemberStatusTag::Member { .. } => " [M]",
                MemberStatusTag::Guest => "",
            };
            embed = embed.field(
                format!("-- {}{} --", player.name, member_badge),
                lines.join("\n"),
                true,
            );
        }
    } else {
        let owner = session.owner_player();
        let class_badge = format!("{} {}", owner.class.emoji(), owner.class.label());
        let mut player_lines = vec![
            format!("{} Lv.{}", class_badge, owner.level),
            hp_bar(owner.hp, owner.max_hp, 10),
            format!("DEF `{}`  Gold `{}`", owner.armor, owner.gold),
            progress_bar("\u{2726}", owner.xp as i32, owner.xp_to_next as i32, 8),
        ];
        if let Some(ref wep) = owner.weapon {
            if let Some(gear) = super::content::find_gear(wep) {
                player_lines.push(format!("Weapon: {} {}", gear.emoji, gear.name));
            }
        }
        if let Some(ref arm) = owner.armor_gear {
            if let Some(gear) = super::content::find_gear(arm) {
                player_lines.push(format!("Armor: {} {}", gear.emoji, gear.name));
            }
        }
        if let Some(fx) = format_effects(&owner.effects) {
            player_lines.push(format!("Status: {fx}"));
        }
        if !owner.alive {
            player_lines.push("**DEFEATED**".to_owned());
        }
        embed = embed.field(
            format!("-- {} --", owner.name),
            player_lines.join("\n"),
            true,
        );
    }

    // Enemy fields (multi-enemy support)
    for enemy in &session.enemies {
        let enrage_tag = if enemy.enraged { " \u{1F525}" } else { "" };
        let mut enemy_lines = vec![
            format!("**{}{}** (Lv.{})", enemy.name, enrage_tag, enemy.level),
            hp_bar(enemy.hp, enemy.max_hp, 10),
            format!("DEF `{}`", enemy.armor),
            intent_description(&enemy.intent),
        ];
        if let Some(fx) = format_effects(&enemy.effects) {
            enemy_lines.push(format!("Status: {fx}"));
        }
        let label = if session.enemies.len() > 1 {
            format!("-- Enemy #{} --", enemy.index + 1)
        } else {
            "-- Enemy --".to_owned()
        };
        embed = embed.field(label, enemy_lines.join("\n"), true);
    }

    // Waiting for actions indicator (party mode)
    if session.phase == GamePhase::WaitingForActions {
        let pending: Vec<String> = session
            .alive_player_ids()
            .iter()
            .filter(|uid| !session.pending_actions.contains_key(uid))
            .filter_map(|uid| session.players.get(uid))
            .map(|p| p.name.clone())
            .collect();
        if !pending.is_empty() {
            embed = embed.field("-- Waiting For --", pending.join(", "), false);
        }
    }

    // Room modifiers + hazards
    let mut room_effects: Vec<String> = session
        .room
        .modifiers
        .iter()
        .map(|m| match m {
            RoomModifier::Fog { accuracy_penalty } => {
                format!("Fog -- accuracy -{:.0}%", accuracy_penalty * 100.0)
            }
            RoomModifier::Blessing { heal_bonus } => {
                format!("Blessing -- +{heal_bonus} heal")
            }
            RoomModifier::Cursed { dmg_multiplier } => {
                format!(
                    "Cursed -- +{:.0}% damage taken",
                    (dmg_multiplier - 1.0) * 100.0
                )
            }
        })
        .collect();
    for hazard in &session.room.hazards {
        match hazard {
            Hazard::Spikes { dmg } => {
                room_effects.push(format!("Spikes -- {dmg} dmg on entry"));
            }
            Hazard::Gas { effect, .. } => {
                room_effects.push(format!("Gas -- applies {effect:?}"));
            }
        }
    }
    if !room_effects.is_empty() {
        embed = embed.field("-- Room Effects --", room_effects.join("\n"), false);
    }

    // Merchant/City stock
    if matches!(session.phase, GamePhase::Merchant | GamePhase::City)
        && !session.room.merchant_stock.is_empty()
    {
        let stock_lines: Vec<String> = session
            .room
            .merchant_stock
            .iter()
            .filter_map(|offer| {
                if offer.is_gear {
                    super::content::find_gear(&offer.item_id).map(|def| {
                        let slot_label = match def.slot {
                            EquipSlot::Weapon => "Weapon",
                            EquipSlot::Armor => "Armor",
                        };
                        format!(
                            "{} {} [{}] -- {} gold",
                            def.emoji, def.name, slot_label, offer.price
                        )
                    })
                } else {
                    super::content::find_item(&offer.item_id)
                        .map(|def| format!("{} -- {} gold", def.name, offer.price))
                }
            })
            .collect();
        let label = if session.phase == GamePhase::City {
            "-- City Shop --"
        } else {
            "-- Merchant --"
        };
        embed = embed.field(label, stock_lines.join("\n"), false);
    }

    // City inn info
    if session.phase == GamePhase::City {
        let inn_cost = 10 + (session.room.index as i32 * 2);
        embed = embed.field(
            "-- Inn --",
            format!("Full heal + clear effects for {} gold", inn_cost),
            false,
        );
    }

    // Story event choices (always shown — matches interactive story buttons)
    if session.phase == GamePhase::Event {
        if let Some(ref event) = session.room.story_event {
            let choice_lines: Vec<String> = event
                .choices
                .iter()
                .enumerate()
                .map(|(i, c)| format!("{}. **{}** -- {}", i + 1, c.label, c.description))
                .collect();
            embed = embed.field("-- Choices --", choice_lines.join("\n"), false);
        }
    }

    // Adventure log (last 5 entries)
    if !session.log.is_empty() {
        let (label, prefix) = if with_card {
            ("-- Adventure Log --", "> ")
        } else {
            ("-- Log --", "| ")
        };
        let log_display: String = session
            .log
            .iter()
            .rev()
            .take(5)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .map(|s| format!("{prefix}{s}"))
            .collect::<Vec<_>>()
            .join("\n");
        embed = embed.field(label, log_display, false);
    }

    // Footer — party roster with membership badges
    let roster_parts: Vec<String> = session
        .roster()
        .iter()
        .enumerate()
        .map(|(i, (_, player))| {
            let badge = match &player.member_status {
                MemberStatusTag::Member { username } => {
                    format!("{} -- kbve.com/@{}", player.name, username)
                }
                MemberStatusTag::Guest => format!("{} (Guest)", player.name),
            };
            format!("[{}] {}", i + 1, badge)
        })
        .collect();
    let footer_text = format!(
        "Turn {}  //  Session {}\n{}",
        session.turn,
        session.short_id,
        roster_parts.join("  |  ")
    );
    embed = embed.footer(serenity::CreateEmbedFooter::new(footer_text));

    embed
}

// ── Component builders ──────────────────────────────────────────────

/// Build the action rows (buttons + optional item select) for the game message.
pub fn render_components(session: &SessionState) -> Vec<serenity::CreateActionRow> {
    let sid = &session.short_id;
    let game_over = matches!(session.phase, GamePhase::GameOver(_));
    let in_combat = matches!(
        session.phase,
        GamePhase::Combat | GamePhase::WaitingForActions
    );
    let in_city = session.phase == GamePhase::City;
    let exploring = matches!(
        session.phase,
        GamePhase::Exploring
            | GamePhase::Rest
            | GamePhase::Looting
            | GamePhase::Merchant
            | GamePhase::Event
            | GamePhase::City
    );

    let owner = session.owner_player();

    // Primary button row — no emojis, clean labels, color conveys meaning
    let buttons = vec![
        serenity::CreateButton::new(format!("dng|{sid}|atk|"))
            .label("Attack")
            .style(serenity::ButtonStyle::Danger)
            .disabled(game_over || !in_combat),
        serenity::CreateButton::new(format!("dng|{sid}|def|"))
            .label("Defend")
            .style(serenity::ButtonStyle::Primary)
            .disabled(game_over || !in_combat),
        serenity::CreateButton::new(format!("dng|{sid}|item|"))
            .label("Items")
            .style(serenity::ButtonStyle::Secondary)
            .disabled(game_over || owner.inventory.iter().all(|s| s.qty == 0)),
        serenity::CreateButton::new(format!("dng|{sid}|explore|"))
            .label("Explore")
            .style(serenity::ButtonStyle::Success)
            .disabled(game_over || !exploring),
        serenity::CreateButton::new(format!("dng|{sid}|flee|"))
            .label("Flee")
            .style(serenity::ButtonStyle::Secondary)
            .disabled(game_over || !in_combat),
    ];

    let mut rows = vec![serenity::CreateActionRow::Buttons(buttons)];

    // Multi-enemy target select menu
    if in_combat && session.enemies.len() > 1 && !game_over {
        let target_options: Vec<serenity::CreateSelectMenuOption> = session
            .enemies
            .iter()
            .map(|e| {
                serenity::CreateSelectMenuOption::new(
                    format!("{} (HP {}/{})", e.name, e.hp.max(0), e.max_hp),
                    format!("{}", e.index),
                )
            })
            .collect();

        if !target_options.is_empty() {
            let select = serenity::CreateSelectMenu::new(
                format!("dng|{sid}|atkt|select"),
                serenity::CreateSelectMenuKind::String {
                    options: target_options,
                },
            )
            .placeholder("Target an enemy...");

            rows.push(serenity::CreateActionRow::SelectMenu(select));
        }
    }

    // City rest button
    if in_city && !game_over {
        let rest_button = serenity::CreateButton::new(format!("dng|{sid}|rest|"))
            .label("Rest at Inn")
            .style(serenity::ButtonStyle::Success);

        rows.push(serenity::CreateActionRow::Buttons(vec![rest_button]));
    }

    // Item select menu (only shown when toggled)
    if session.show_items && !game_over {
        let multi_enemy_combat = in_combat && session.enemies.len() > 1;

        if multi_enemy_combat {
            // Multi-enemy targeted item menu: damage items get one option per alive enemy,
            // non-damage items use the regular untargeted action.
            let mut targeted_options: Vec<serenity::CreateSelectMenuOption> = Vec::new();
            let mut untargeted_options: Vec<serenity::CreateSelectMenuOption> = Vec::new();

            for stack in owner.inventory.iter().filter(|s| s.qty > 0) {
                if let Some(def) = super::content::find_item(&stack.item_id) {
                    let is_damage = matches!(def.use_effect, Some(UseEffect::DamageEnemy { .. }));
                    if is_damage {
                        // One option per alive enemy
                        for enemy in &session.enemies {
                            targeted_options.push(
                                serenity::CreateSelectMenuOption::new(
                                    format!("{} -> {} (x{})", def.name, enemy.name, stack.qty),
                                    format!("{}|{}", stack.item_id, enemy.index),
                                )
                                .description(format!("[{:?}] {}", def.rarity, def.description)),
                            );
                        }
                    } else {
                        let rarity_label = format!("{:?}", def.rarity);
                        untargeted_options.push(
                            serenity::CreateSelectMenuOption::new(
                                format!("{} (x{})", def.name, stack.qty),
                                format!("{}|{}", stack.item_id, stack.qty),
                            )
                            .description(format!("[{}] {}", rarity_label, def.description)),
                        );
                    }
                }
            }

            // Targeted items use useitem_t action
            if !targeted_options.is_empty() {
                let select = serenity::CreateSelectMenu::new(
                    format!("dng|{sid}|useitem_t|select"),
                    serenity::CreateSelectMenuKind::String {
                        options: targeted_options,
                    },
                )
                .placeholder("Use item on target...");
                rows.push(serenity::CreateActionRow::SelectMenu(select));
            }

            // Non-damage items use regular useitem action
            if !untargeted_options.is_empty() {
                let select = serenity::CreateSelectMenu::new(
                    format!("dng|{sid}|useitem|select"),
                    serenity::CreateSelectMenuKind::String {
                        options: untargeted_options,
                    },
                )
                .placeholder("Use item...");
                rows.push(serenity::CreateActionRow::SelectMenu(select));
            }
        } else {
            // Single enemy or non-combat: standard item menu
            let options: Vec<serenity::CreateSelectMenuOption> = owner
                .inventory
                .iter()
                .filter(|s| s.qty > 0)
                .filter_map(|s| {
                    super::content::find_item(&s.item_id).map(|def| {
                        let rarity_label = format!("{:?}", def.rarity);
                        serenity::CreateSelectMenuOption::new(
                            format!("{} (x{})", def.name, s.qty),
                            format!("{}|{}", s.item_id, s.qty),
                        )
                        .description(format!("[{}] {}", rarity_label, def.description))
                    })
                })
                .collect();

            if !options.is_empty() {
                let select = serenity::CreateSelectMenu::new(
                    format!("dng|{sid}|useitem|select"),
                    serenity::CreateSelectMenuKind::String { options },
                )
                .placeholder("Select an item...");

                rows.push(serenity::CreateActionRow::SelectMenu(select));
            }
        }
    }

    // Gear equip select menu
    let gear_items: Vec<_> = owner
        .inventory
        .iter()
        .filter(|s| s.qty > 0 && super::content::find_gear(&s.item_id).is_some())
        .collect();
    if !gear_items.is_empty() && !game_over {
        let mut options = Vec::new();
        for stack in &gear_items {
            if let Some(gear) = super::content::find_gear(&stack.item_id) {
                let slot_label = match gear.slot {
                    EquipSlot::Weapon => "Weapon",
                    EquipSlot::Armor => "Armor",
                };
                options.push(serenity::CreateSelectMenuOption::new(
                    format!("{} {} [{}]", gear.emoji, gear.name, slot_label),
                    &stack.item_id,
                ));
            }
        }
        if !options.is_empty() {
            let menu = serenity::CreateSelectMenu::new(
                format!("dng|{sid}|equip"),
                serenity::CreateSelectMenuKind::String { options },
            )
            .placeholder("Equip gear...");
            rows.push(serenity::CreateActionRow::SelectMenu(menu));
        }
    }

    // Cleric heal target menu (show if any party Cleric has heals remaining)
    let is_combat_phase =
        session.phase == GamePhase::Combat || session.phase == GamePhase::WaitingForActions;
    let has_cleric_with_heals = session
        .players
        .values()
        .any(|p| p.class == ClassType::Cleric && p.alive && p.heals_used_this_combat < 1);
    if is_combat_phase && has_cleric_with_heals {
        let heal_targets: Vec<_> = session
            .roster()
            .iter()
            .filter(|(_, p)| p.alive)
            .map(|(uid, p)| (*uid, p.name.clone(), p.hp, p.max_hp))
            .collect();
        if !heal_targets.is_empty() {
            let options: Vec<_> = heal_targets
                .iter()
                .map(|(uid, name, hp, max_hp)| {
                    serenity::CreateSelectMenuOption::new(
                        format!("Heal {} (HP {}/{})", name, hp, max_hp),
                        format!("{}", uid.get()),
                    )
                })
                .collect();
            let menu = serenity::CreateSelectMenu::new(
                format!("dng|{sid}|heal"),
                serenity::CreateSelectMenuKind::String { options },
            )
            .placeholder("Heal ally (Cleric)...");
            rows.push(serenity::CreateActionRow::SelectMenu(menu));
        }
    }

    // Merchant/City buy select menu
    if matches!(session.phase, GamePhase::Merchant | GamePhase::City) && !game_over {
        let buy_options: Vec<serenity::CreateSelectMenuOption> = session
            .room
            .merchant_stock
            .iter()
            .filter_map(|offer| {
                if offer.is_gear {
                    super::content::find_gear(&offer.item_id).map(|def| {
                        let slot_label = match def.slot {
                            EquipSlot::Weapon => "Weapon",
                            EquipSlot::Armor => "Armor",
                        };
                        serenity::CreateSelectMenuOption::new(
                            format!(
                                "{} {} [{}] -- {} gold",
                                def.emoji, def.name, slot_label, offer.price
                            ),
                            offer.item_id.clone(),
                        )
                        .description(format!(
                            "[{:?}] +{}dmg +{}def +{}hp",
                            def.rarity, def.bonus_damage, def.bonus_armor, def.bonus_hp
                        ))
                    })
                } else {
                    super::content::find_item(&offer.item_id).map(|def| {
                        serenity::CreateSelectMenuOption::new(
                            format!("{} -- {} gold", def.name, offer.price),
                            offer.item_id.clone(),
                        )
                        .description(format!("[{:?}] {}", def.rarity, def.description))
                    })
                }
            })
            .collect();

        if !buy_options.is_empty() {
            let select = serenity::CreateSelectMenu::new(
                format!("dng|{sid}|buy|select"),
                serenity::CreateSelectMenuKind::String {
                    options: buy_options,
                },
            )
            .placeholder("Buy an item...");

            rows.push(serenity::CreateActionRow::SelectMenu(select));
        }
    }

    // Sell select menu at merchant/city
    if matches!(session.phase, GamePhase::Merchant | GamePhase::City) && !game_over {
        let sell_options: Vec<serenity::CreateSelectMenuOption> = owner
            .inventory
            .iter()
            .filter(|s| s.qty > 0)
            .filter_map(|s| {
                let (name, sell_price) = if let Some(gear) = super::content::find_gear(&s.item_id) {
                    let price = super::content::sell_price_for_gear(&s.item_id)?;
                    (format!("{} {} (x{})", gear.emoji, gear.name, s.qty), price)
                } else {
                    let def = super::content::find_item(&s.item_id)?;
                    let price = super::content::sell_price_for_item(&s.item_id)?;
                    (format!("{} (x{})", def.name, s.qty), price)
                };
                Some(serenity::CreateSelectMenuOption::new(
                    format!("{} -- {} gold", name, sell_price),
                    s.item_id.clone(),
                ))
            })
            .collect();

        if !sell_options.is_empty() {
            let select = serenity::CreateSelectMenu::new(
                format!("dng|{sid}|sell|select"),
                serenity::CreateSelectMenuKind::String {
                    options: sell_options,
                },
            )
            .placeholder("Sell an item...");
            rows.push(serenity::CreateActionRow::SelectMenu(select));
        }
    }

    // Story choice buttons
    if session.phase == GamePhase::Event && !game_over {
        if let Some(ref event) = session.room.story_event {
            let story_buttons: Vec<serenity::CreateButton> = event
                .choices
                .iter()
                .enumerate()
                .map(|(i, choice)| {
                    serenity::CreateButton::new(format!("dng|{sid}|story|{i}"))
                        .label(&choice.label)
                        .style(serenity::ButtonStyle::Primary)
                })
                .collect();

            if !story_buttons.is_empty() {
                rows.push(serenity::CreateActionRow::Buttons(story_buttons));
            }
        }
    }

    // Room choice buttons (Trap, Treasure, Rest, Hallway)
    if !game_over {
        let room_choices: Option<Vec<(&str, serenity::ButtonStyle)>> = match session.phase {
            GamePhase::Trap => Some(vec![
                ("Disarm", serenity::ButtonStyle::Primary),
                ("Brace", serenity::ButtonStyle::Secondary),
            ]),
            GamePhase::Treasure => Some(vec![
                ("Open Carefully", serenity::ButtonStyle::Primary),
                ("Force Open", serenity::ButtonStyle::Danger),
            ]),
            GamePhase::Rest if session.room.room_type == RoomType::RestShrine => Some(vec![
                ("Rest", serenity::ButtonStyle::Success),
                ("Meditate", serenity::ButtonStyle::Primary),
            ]),
            GamePhase::Hallway => Some(vec![
                ("Move Quickly", serenity::ButtonStyle::Success),
                ("Search", serenity::ButtonStyle::Primary),
            ]),
            _ => None,
        };

        if let Some(choices) = room_choices {
            let choice_buttons: Vec<serenity::CreateButton> = choices
                .iter()
                .enumerate()
                .map(|(i, (label, style))| {
                    serenity::CreateButton::new(format!("dng|{sid}|room|{i}"))
                        .label(*label)
                        .style(*style)
                })
                .collect();
            if !choice_buttons.is_empty() {
                rows.push(serenity::CreateActionRow::Buttons(choice_buttons));
            }
        }
    }

    rows
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::time::Instant;

    const OWNER: serenity::UserId = serenity::UserId::new(1);

    fn test_session() -> SessionState {
        let (id, short_id) = new_short_sid();
        let mut players = HashMap::new();
        players.insert(OWNER, PlayerState::default());

        SessionState {
            id,
            short_id,
            owner: OWNER,
            party: Vec::new(),
            mode: SessionMode::Solo,
            phase: GamePhase::Exploring,
            channel_id: serenity::ChannelId::new(1),
            message_id: serenity::MessageId::new(1),
            created_at: Instant::now(),
            last_action_at: Instant::now(),
            turn: 0,
            players,
            enemies: Vec::new(),
            room: super::super::content::generate_room(0),
            log: Vec::new(),
            show_items: false,
            pending_actions: HashMap::new(),
        }
    }

    #[test]
    fn hp_bar_full() {
        let bar = hp_bar(50, 50, 10);
        assert!(bar.contains("50/50"));
        assert!(bar.contains("\u{2665}\u{2665}\u{2665}\u{2665}\u{2665}"));
        assert!(!bar.contains("\u{2661}"));
    }

    #[test]
    fn hp_bar_empty() {
        let bar = hp_bar(0, 50, 10);
        assert!(bar.contains("0/50"));
        assert!(bar.contains("\u{2661}\u{2661}\u{2661}\u{2661}\u{2661}"));
        assert!(!bar.contains("\u{2665}"));
    }

    #[test]
    fn hp_bar_half() {
        let bar = hp_bar(25, 50, 10);
        assert!(bar.contains("25/50"));
        assert!(bar.contains("\u{2665}\u{2665}"));
        assert!(bar.contains("\u{2661}\u{2661}\u{2661}"));
    }

    #[test]
    fn hp_bar_negative_clamped() {
        let bar = hp_bar(-5, 50, 10);
        assert!(bar.contains("0/50"));
        assert!(!bar.contains("\u{2665}"));
    }

    #[test]
    fn intent_descriptions() {
        let atk = intent_description(&Intent::Attack { dmg: 5 });
        assert!(atk.contains("5 dmg"));
        assert!(atk.contains("\u{2660}"));
        let charge = intent_description(&Intent::Charge);
        assert!(charge.contains("Charging"));
        assert!(charge.contains("\u{2605}"));
    }

    #[test]
    fn format_effects_empty() {
        assert!(format_effects(&[]).is_none());
    }

    #[test]
    fn format_effects_single() {
        let effects = vec![EffectInstance {
            kind: EffectKind::Poison,
            stacks: 1,
            turns_left: 3,
        }];
        let result = format_effects(&effects).unwrap();
        assert!(result.contains("\u{2622} Poison"));
        assert!(result.contains("3 turns"));
    }

    #[test]
    fn render_embed_exploring() {
        let session = test_session();
        let _embed = render_embed(&session, false);
    }

    #[test]
    fn render_embed_combat() {
        let mut session = test_session();
        session.phase = GamePhase::Combat;
        session.enemies = vec![super::super::content::spawn_enemy(0)];
        let _embed = render_embed(&session, false);
    }

    #[test]
    fn render_embed_game_over() {
        let mut session = test_session();
        session.phase = GamePhase::GameOver(GameOverReason::Victory);
        let _embed = render_embed(&session, false);
    }

    #[test]
    fn render_components_exploring() {
        let session = test_session();
        let components = render_components(&session);
        assert_eq!(components.len(), 1);
    }

    #[test]
    fn render_components_with_items() {
        let mut session = test_session();
        session.show_items = true;
        session.player_mut(OWNER).inventory = super::super::content::starting_inventory();
        let components = render_components(&session);
        assert_eq!(components.len(), 2); // button row + select menu
    }

    #[test]
    fn render_components_game_over_disabled() {
        let mut session = test_session();
        session.phase = GamePhase::GameOver(GameOverReason::Defeated);
        let components = render_components(&session);
        assert_eq!(components.len(), 1);
    }

    #[test]
    fn phase_color_exploring_is_green() {
        let session = test_session();
        assert_eq!(phase_color(&session), COLOR_SAFE);
    }

    #[test]
    fn phase_color_combat_is_orange() {
        let mut session = test_session();
        session.phase = GamePhase::Combat;
        assert_eq!(phase_color(&session), COLOR_COMBAT);
    }

    #[test]
    fn phase_color_critical_is_red() {
        let mut session = test_session();
        session.player_mut(OWNER).hp = 5;
        assert_eq!(phase_color(&session), COLOR_CRITICAL);
    }

    #[test]
    fn phase_color_victory_is_gold() {
        let mut session = test_session();
        session.phase = GamePhase::GameOver(GameOverReason::Victory);
        assert_eq!(phase_color(&session), COLOR_VICTORY);
    }

    #[test]
    fn phase_color_rest_is_blue() {
        let mut session = test_session();
        session.phase = GamePhase::Rest;
        assert_eq!(phase_color(&session), COLOR_REST);
    }

    #[test]
    fn phase_color_city_is_purple() {
        let mut session = test_session();
        session.phase = GamePhase::City;
        assert_eq!(phase_color(&session), COLOR_CITY);
    }

    #[test]
    fn render_components_city_has_rest_button() {
        let mut session = test_session();
        session.phase = GamePhase::City;
        session.room.merchant_stock = super::super::content::generate_merchant_stock(3);
        let components = render_components(&session);
        // Button row + rest button row + buy select menu
        assert!(components.len() >= 2);
    }
}
