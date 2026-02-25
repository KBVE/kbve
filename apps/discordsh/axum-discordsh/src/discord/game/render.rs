use poise::serenity_prelude as serenity;

use super::types::*;

// ── Colors ──────────────────────────────────────────────────────────

const COLOR_SAFE: u32 = 0x2ECC71; // green
const COLOR_COMBAT: u32 = 0xE67E22; // orange
const COLOR_CRITICAL: u32 = 0xE74C3C; // red
const COLOR_GAME_OVER: u32 = 0x95A5A6; // grey
const COLOR_VICTORY: u32 = 0xF1C40F; // gold
const COLOR_REST: u32 = 0x3498DB; // blue

fn phase_color(session: &SessionState) -> u32 {
    match &session.phase {
        GamePhase::GameOver(GameOverReason::Victory) => COLOR_VICTORY,
        GamePhase::GameOver(_) => COLOR_GAME_OVER,
        _ if session.player.hp <= session.player.max_hp / 4 => COLOR_CRITICAL,
        GamePhase::Combat => COLOR_COMBAT,
        GamePhase::Rest => COLOR_REST,
        _ => COLOR_SAFE,
    }
}

// ── HP bar ──────────────────────────────────────────────────────────

/// Render an HP bar like `[####------] 32/50`
///
/// Uses `#` for filled and `-` for empty inside a monospace code block
/// so the bar aligns cleanly in Discord embeds.
pub fn hp_bar(current: i32, max: i32, width: usize) -> String {
    let current = current.max(0);
    let ratio = if max > 0 {
        current as f32 / max as f32
    } else {
        0.0
    };
    let filled = (ratio * width as f32).round() as usize;
    let empty = width.saturating_sub(filled);

    format!(
        "`[{}{}]` **{}/{}**",
        "#".repeat(filled),
        "-".repeat(empty),
        current,
        max
    )
}

// ── Intent description ──────────────────────────────────────────────

pub fn intent_description(intent: &Intent) -> String {
    match intent {
        Intent::Attack { dmg } => format!(">> Attack ({dmg} dmg)"),
        Intent::HeavyAttack { dmg } => format!(">> Heavy blow ({dmg} dmg)"),
        Intent::Defend { armor } => format!(">> Brace (+{armor} armor)"),
        Intent::Charge => ">> Charging...".to_owned(),
        Intent::Flee => ">> Retreating...".to_owned(),
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
                EffectKind::Poison => "Poison",
                EffectKind::Burning => "Burning",
                EffectKind::Bleed => "Bleed",
                EffectKind::Shielded => "Shielded",
                EffectKind::Weakened => "Weakened",
                EffectKind::Stunned => "Stunned",
            };
            format!("{label} ({} turns)", e.turns_left)
        })
        .collect();
    Some(parts.join(", "))
}

// ── Embed builder ───────────────────────────────────────────────────

/// Build the main game embed from session state.
///
/// Pure function — no async, no side effects.
pub fn render_embed(session: &SessionState) -> serenity::CreateEmbed {
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

    // Player stats field
    let mut player_lines = vec![
        format!(
            "HP  {}",
            hp_bar(session.player.hp, session.player.max_hp, 10)
        ),
        format!(
            "DEF `{}`  Gold `{}`",
            session.player.armor, session.player.gold
        ),
    ];
    if let Some(fx) = format_effects(&session.player.effects) {
        player_lines.push(format!("Status: {fx}"));
    }
    embed = embed.field("-- Player --", player_lines.join("\n"), true);

    // Enemy field (if in combat)
    if let Some(ref enemy) = session.enemy {
        let mut enemy_lines = vec![
            format!("**{}** (Lv.{})", enemy.name, enemy.level),
            format!("HP  {}", hp_bar(enemy.hp, enemy.max_hp, 10)),
            format!("DEF `{}`", enemy.armor),
            intent_description(&enemy.intent),
        ];
        if let Some(fx) = format_effects(&enemy.effects) {
            enemy_lines.push(format!("Status: {fx}"));
        }
        embed = embed.field("-- Enemy --", enemy_lines.join("\n"), true);
    }

    // Room modifiers
    if !session.room.modifiers.is_empty() {
        let mods: Vec<String> = session
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
        embed = embed.field("-- Room Effects --", mods.join("\n"), false);
    }

    // Combat log (last 5 entries)
    if !session.log.is_empty() {
        let log_display: String = session
            .log
            .iter()
            .rev()
            .take(5)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .map(|s| format!("| {s}"))
            .collect::<Vec<_>>()
            .join("\n");
        embed = embed.field("-- Log --", log_display, false);
    }

    // Footer
    embed = embed.footer(serenity::CreateEmbedFooter::new(format!(
        "Turn {}  //  Session {}",
        session.turn, session.short_id
    )));

    embed
}

// ── Component builders ──────────────────────────────────────────────

/// Build the action rows (buttons + optional item select) for the game message.
pub fn render_components(session: &SessionState) -> Vec<serenity::CreateActionRow> {
    let sid = &session.short_id;
    let game_over = matches!(session.phase, GamePhase::GameOver(_));
    let in_combat = session.phase == GamePhase::Combat;
    let exploring = matches!(
        session.phase,
        GamePhase::Exploring | GamePhase::Rest | GamePhase::Looting
    );

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
            .disabled(game_over || session.player.inventory.iter().all(|s| s.qty == 0)),
        serenity::CreateButton::new(format!("dng|{sid}|explore|"))
            .label("Explore")
            .style(serenity::ButtonStyle::Success)
            .disabled(game_over || !exploring),
        serenity::CreateButton::new(format!("dng|{sid}|flee|"))
            .label("Flee")
            .style(serenity::ButtonStyle::Secondary)
            .disabled(game_over),
    ];

    let mut rows = vec![serenity::CreateActionRow::Buttons(buttons)];

    // Item select menu (only shown when toggled)
    if session.show_items && !game_over {
        let options: Vec<serenity::CreateSelectMenuOption> = session
            .player
            .inventory
            .iter()
            .filter(|s| s.qty > 0)
            .filter_map(|s| {
                super::content::find_item(&s.item_id).map(|def| {
                    serenity::CreateSelectMenuOption::new(
                        format!("{} (x{})", def.name, s.qty),
                        format!("{}|{}", s.item_id, s.qty),
                    )
                    .description(def.description)
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

    rows
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    fn test_session() -> SessionState {
        let (id, short_id) = new_short_sid();
        SessionState {
            id,
            short_id,
            owner: serenity::UserId::new(1),
            party: Vec::new(),
            mode: SessionMode::Solo,
            phase: GamePhase::Exploring,
            channel_id: serenity::ChannelId::new(1),
            message_id: serenity::MessageId::new(1),
            created_at: Instant::now(),
            last_action_at: Instant::now(),
            turn: 0,
            player: PlayerState::default(),
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
        assert!(bar.contains("##########"));
    }

    #[test]
    fn hp_bar_empty() {
        let bar = hp_bar(0, 50, 10);
        assert!(bar.contains("0/50"));
        assert!(bar.contains("----------"));
    }

    #[test]
    fn hp_bar_half() {
        let bar = hp_bar(25, 50, 10);
        assert!(bar.contains("25/50"));
        assert!(bar.contains("#####-----"));
    }

    #[test]
    fn hp_bar_negative_clamped() {
        let bar = hp_bar(-5, 50, 10);
        assert!(bar.contains("0/50"));
    }

    #[test]
    fn intent_descriptions() {
        assert!(intent_description(&Intent::Attack { dmg: 5 }).contains("5 dmg"));
        assert!(intent_description(&Intent::Charge).contains("Charging"));
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
        assert!(result.contains("Poison"));
        assert!(result.contains("3 turns"));
    }

    #[test]
    fn render_embed_exploring() {
        let session = test_session();
        let _embed = render_embed(&session);
        // Embed is built without panic — primary assertion
    }

    #[test]
    fn render_embed_combat() {
        let mut session = test_session();
        session.phase = GamePhase::Combat;
        session.enemy = Some(super::super::content::spawn_enemy(0));
        let _embed = render_embed(&session);
    }

    #[test]
    fn render_embed_game_over() {
        let mut session = test_session();
        session.phase = GamePhase::GameOver(GameOverReason::Victory);
        let _embed = render_embed(&session);
    }

    #[test]
    fn render_components_exploring() {
        let session = test_session();
        let components = render_components(&session);
        assert_eq!(components.len(), 1); // just button row, no items
    }

    #[test]
    fn render_components_with_items() {
        let mut session = test_session();
        session.show_items = true;
        session.player.inventory = super::super::content::starting_inventory();
        let components = render_components(&session);
        assert_eq!(components.len(), 2); // button row + select menu
    }

    #[test]
    fn render_components_game_over_disabled() {
        let mut session = test_session();
        session.phase = GamePhase::GameOver(GameOverReason::Defeated);
        let components = render_components(&session);
        // Only 1 row (no items shown when game over)
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
        session.player.hp = 5;
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
}
