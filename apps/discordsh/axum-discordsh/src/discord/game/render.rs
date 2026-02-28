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
        GamePhase::Combat => COLOR_COMBAT,
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

    // Player stats — unified roster in party mode, owner-only in solo
    if session.mode == SessionMode::Party && session.players.len() > 1 {
        for (_, player) in session.roster() {
            let mut lines = vec![
                hp_bar(player.hp, player.max_hp, 10),
                format!("DEF `{}`  Gold `{}`", player.armor, player.gold),
            ];
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
        let mut player_lines = vec![
            hp_bar(owner.hp, owner.max_hp, 10),
            format!("DEF `{}`  Gold `{}`", owner.armor, owner.gold),
        ];
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

    // Enemy field (if in combat)
    if let Some(ref enemy) = session.enemy {
        let mut enemy_lines = vec![
            format!("**{}** (Lv.{})", enemy.name, enemy.level),
            hp_bar(enemy.hp, enemy.max_hp, 10),
            format!("DEF `{}`", enemy.armor),
            intent_description(&enemy.intent),
        ];
        if let Some(fx) = format_effects(&enemy.effects) {
            enemy_lines.push(format!("Status: {fx}"));
        }
        embed = embed.field("-- Enemy --", enemy_lines.join("\n"), true);
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
                super::content::find_item(&offer.item_id)
                    .map(|def| format!("{} -- {} gold", def.name, offer.price))
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
    let in_combat = session.phase == GamePhase::Combat;
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

    // City rest button
    if in_city && !game_over {
        let rest_button = serenity::CreateButton::new(format!("dng|{sid}|rest|"))
            .label("Rest at Inn")
            .style(serenity::ButtonStyle::Success);

        rows.push(serenity::CreateActionRow::Buttons(vec![rest_button]));
    }

    // Item select menu (only shown when toggled)
    if session.show_items && !game_over {
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

    // Merchant/City buy select menu
    if matches!(session.phase, GamePhase::Merchant | GamePhase::City) && !game_over {
        let buy_options: Vec<serenity::CreateSelectMenuOption> = session
            .room
            .merchant_stock
            .iter()
            .filter_map(|offer| {
                super::content::find_item(&offer.item_id).map(|def| {
                    serenity::CreateSelectMenuOption::new(
                        format!("{} -- {} gold", def.name, offer.price),
                        offer.item_id.clone(),
                    )
                    .description(format!("[{:?}] {}", def.rarity, def.description))
                })
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
            enemy: None,
            room: super::super::content::generate_room(0),
            log: Vec::new(),
            show_items: false,
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
        session.enemy = Some(super::super::content::spawn_enemy(0));
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
