use askama::Template;
use kbve::{FontDb, render_svg_to_png};

use super::types::*;

// ── Pre-computed display values ─────────────────────────────────────

pub struct EffectBadge {
    pub x: u32,
    pub label_x: u32,
    pub label: String,
    pub turns: u8,
    pub color: &'static str,
}

pub struct RoomBadge {
    pub x: u32,
    pub width: u32,
    pub text_x: u32,
    pub label: String,
    pub color: &'static str,
}

// ── Askama SVG template ─────────────────────────────────────────────

#[derive(Template)]
#[template(path = "game/card.svg")]
pub struct GameCardTemplate {
    // Header
    pub phase_color: String,
    pub phase_color_dark: String,
    pub room_number: u32,
    pub room_name: String,
    pub phase_label: String,

    // Player
    pub player_name: String,
    pub player_hp: i32,
    pub player_max_hp: i32,
    pub player_hp_width: u32,
    pub player_hp_color: String,
    pub player_armor: i32,
    pub player_gold: i32,
    pub player_effects: Vec<EffectBadge>,

    // Enemy (conditional)
    pub has_enemy: bool,
    pub enemy_name: String,
    pub enemy_level: u8,
    pub enemy_hp: i32,
    pub enemy_max_hp: i32,
    pub enemy_hp_width: u32,
    pub enemy_armor: i32,
    pub intent_icon: String,
    pub intent_text: String,
    pub enemy_effects: Vec<EffectBadge>,

    // Room
    pub room_badges: Vec<RoomBadge>,
    pub turn: u32,
}

// ── Helpers ─────────────────────────────────────────────────────────

const HP_BAR_MAX_WIDTH: u32 = 340;

fn hp_bar_width(current: i32, max: i32) -> u32 {
    let ratio = (current.max(0) as f32) / (max.max(1) as f32);
    (ratio * HP_BAR_MAX_WIDTH as f32).round() as u32
}

fn hp_ratio_color(current: i32, max: i32) -> String {
    let ratio = (current.max(0) as f32) / (max.max(1) as f32);
    if ratio > 0.6 {
        "#2ecc71".to_owned()
    } else if ratio > 0.3 {
        "#f1c40f".to_owned()
    } else {
        "#e74c3c".to_owned()
    }
}

fn phase_colors(session: &SessionState) -> (String, String) {
    let owner = session.owner_player();
    match &session.phase {
        GamePhase::GameOver(GameOverReason::Victory) => ("#f1c40f".into(), "#c29d0b".into()),
        GamePhase::GameOver(_) => ("#95a5a6".into(), "#7f8c8d".into()),
        _ if owner.hp <= owner.max_hp / 4 => ("#e74c3c".into(), "#c0392b".into()),
        GamePhase::Combat => ("#e67e22".into(), "#d35400".into()),
        GamePhase::Rest => ("#3498db".into(), "#2980b9".into()),
        GamePhase::City => ("#9b59b6".into(), "#8e44ad".into()),
        _ => ("#2ecc71".into(), "#27ae60".into()),
    }
}

fn phase_label(phase: &GamePhase) -> &'static str {
    match phase {
        GamePhase::Exploring => "Exploring",
        GamePhase::Combat => "Combat",
        GamePhase::Looting => "Looting",
        GamePhase::Event => "Event",
        GamePhase::Rest => "Rest",
        GamePhase::Merchant => "Merchant",
        GamePhase::City => "City",
        GamePhase::GameOver(GameOverReason::Victory) => "Victory",
        GamePhase::GameOver(GameOverReason::Defeated) => "Defeated",
        GamePhase::GameOver(GameOverReason::Escaped) => "Escaped",
        GamePhase::GameOver(GameOverReason::Expired) => "Expired",
    }
}

fn effect_color(kind: &EffectKind) -> &'static str {
    match kind {
        EffectKind::Poison => "#27ae60",
        EffectKind::Burning => "#e67e22",
        EffectKind::Bleed => "#e74c3c",
        EffectKind::Shielded => "#3498db",
        EffectKind::Weakened => "#9b59b6",
        EffectKind::Stunned => "#95a5a6",
    }
}

fn effect_label(kind: &EffectKind) -> &'static str {
    match kind {
        EffectKind::Poison => "PSN",
        EffectKind::Burning => "BRN",
        EffectKind::Bleed => "BLD",
        EffectKind::Shielded => "SHD",
        EffectKind::Weakened => "WKN",
        EffectKind::Stunned => "STN",
    }
}

fn build_effect_badges(effects: &[EffectInstance], base_x: u32) -> Vec<EffectBadge> {
    effects
        .iter()
        .enumerate()
        .map(|(i, e)| {
            let x = base_x + (i as u32) * 70;
            EffectBadge {
                x,
                label_x: x + 12,
                label: effect_label(&e.kind).to_owned(),
                turns: e.turns_left,
                color: effect_color(&e.kind),
            }
        })
        .collect()
}

fn intent_to_icon_and_text(intent: &Intent) -> (String, String) {
    match intent {
        Intent::Attack { dmg } => ("\u{2694}".into(), format!("Attack ({dmg})")),
        Intent::HeavyAttack { dmg } => ("\u{2620}".into(), format!("Heavy ({dmg})")),
        Intent::Defend { armor } => ("\u{1F6E1}".into(), format!("Brace (+{armor})")),
        Intent::Charge => ("\u{2605}".into(), "Charging...".into()),
        Intent::Flee => ("\u{2192}".into(), "Retreating".into()),
    }
}

fn build_room_badges(session: &SessionState) -> Vec<RoomBadge> {
    let mut badges = Vec::new();
    let mut x: u32 = 20;

    for modifier in &session.room.modifiers {
        let (label, color) = match modifier {
            RoomModifier::Fog { accuracy_penalty } => {
                (format!("Fog -{:.0}%", accuracy_penalty * 100.0), "#7f8c8d")
            }
            RoomModifier::Blessing { heal_bonus } => (format!("Blessing +{heal_bonus}"), "#2ecc71"),
            RoomModifier::Cursed { dmg_multiplier } => (
                format!("Cursed +{:.0}%", (dmg_multiplier - 1.0) * 100.0),
                "#9b59b6",
            ),
        };
        let width = (label.len() as u32) * 8 + 20;
        badges.push(RoomBadge {
            x,
            width,
            text_x: x + width / 2,
            label,
            color,
        });
        x += width + 8;
    }

    for hazard in &session.room.hazards {
        let (label, color) = match hazard {
            Hazard::Spikes { dmg } => (format!("Spikes {dmg}"), "#e74c3c"),
            Hazard::Gas { effect, .. } => (format!("Gas {:?}", effect), "#e67e22"),
        };
        let width = (label.len() as u32) * 8 + 20;
        badges.push(RoomBadge {
            x,
            width,
            text_x: x + width / 2,
            label,
            color,
        });
        x += width + 8;
    }

    badges
}

// ── Template construction ───────────────────────────────────────────

impl GameCardTemplate {
    pub fn from_session(session: &SessionState) -> Self {
        let (phase_color, phase_color_dark) = phase_colors(session);
        let owner = session.owner_player();

        let player_effects = build_effect_badges(&owner.effects, 30);

        let (
            has_enemy,
            enemy_name,
            enemy_level,
            enemy_hp,
            enemy_max_hp,
            enemy_hp_width,
            enemy_armor,
            intent_icon,
            intent_text,
            enemy_effects,
        ) = if let Some(ref enemy) = session.enemy {
            let (icon, text) = intent_to_icon_and_text(&enemy.intent);
            (
                true,
                enemy.name.clone(),
                enemy.level,
                enemy.hp,
                enemy.max_hp,
                hp_bar_width(enemy.hp, enemy.max_hp),
                enemy.armor,
                icon,
                text,
                build_effect_badges(&enemy.effects, 430),
            )
        } else {
            (
                false,
                String::new(),
                0,
                0,
                0,
                0,
                0,
                String::new(),
                String::new(),
                Vec::new(),
            )
        };

        Self {
            phase_color,
            phase_color_dark,
            room_number: session.room.index + 1,
            room_name: session.room.name.clone(),
            phase_label: phase_label(&session.phase).to_owned(),

            player_name: owner.name.clone(),
            player_hp: owner.hp.max(0),
            player_max_hp: owner.max_hp,
            player_hp_width: hp_bar_width(owner.hp, owner.max_hp),
            player_hp_color: hp_ratio_color(owner.hp, owner.max_hp),
            player_armor: owner.armor,
            player_gold: owner.gold,
            player_effects,

            has_enemy,
            enemy_name,
            enemy_level,
            enemy_hp: enemy_hp.max(0),
            enemy_max_hp,
            enemy_hp_width,
            enemy_armor,
            intent_icon,
            intent_text,
            enemy_effects,

            room_badges: build_room_badges(session),
            turn: session.turn,
        }
    }
}

// ── Public render function ──────────────────────────────────────────

/// Render the game card as PNG bytes (CPU-bound, ~5-40ms).
///
/// Call from `tokio::task::spawn_blocking`.
pub fn render_game_card_blocking(
    session: &SessionState,
    fontdb: &FontDb,
) -> Result<Vec<u8>, String> {
    let template = GameCardTemplate::from_session(session);
    let svg_string = template
        .render()
        .map_err(|e| format!("SVG template error: {e}"))?;

    render_svg_to_png(&svg_string, fontdb).map_err(|e| format!("SVG render error: {e}"))
}

/// Async wrapper — clones session and renders on a blocking thread.
pub async fn render_game_card(session: &SessionState, fontdb: FontDb) -> Result<Vec<u8>, String> {
    let session_clone = session.clone();
    tokio::task::spawn_blocking(move || render_game_card_blocking(&session_clone, &fontdb))
        .await
        .map_err(|e| format!("Render task panicked: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use poise::serenity_prelude as serenity;
    use std::collections::HashMap;
    use std::time::Instant;

    const OWNER: serenity::UserId = serenity::UserId::new(1);

    fn test_fontdb() -> FontDb {
        let mut db = FontDb::new();
        // Try project font; tests still pass without it
        let _ = db.load_font_file("../../../alagard.ttf");
        db
    }

    fn test_session() -> SessionState {
        let (id, short_id) = new_short_sid();
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
            turn: 3,
            players: HashMap::from([(OWNER, PlayerState::default())]),
            enemy: None,
            room: super::super::content::generate_room(0),
            log: Vec::new(),
            show_items: false,
            member_status: None,
        }
    }

    #[test]
    fn render_exploring_card() {
        let db = test_fontdb();
        let session = test_session();
        let png = render_game_card_blocking(&session, &db);
        assert!(png.is_ok(), "Render failed: {:?}", png.err());
        let bytes = png.unwrap();
        assert!(!bytes.is_empty());
        assert_eq!(&bytes[0..4], &[0x89, 0x50, 0x4E, 0x47]);
    }

    #[test]
    fn render_combat_card() {
        let db = test_fontdb();
        let mut session = test_session();
        session.phase = GamePhase::Combat;
        session.enemy = Some(super::super::content::spawn_enemy(0));
        let png = render_game_card_blocking(&session, &db).unwrap();
        assert!(!png.is_empty());
        assert_eq!(&png[0..4], &[0x89, 0x50, 0x4E, 0x47]);
    }

    #[test]
    fn render_game_over_card() {
        let db = test_fontdb();
        let mut session = test_session();
        session.phase = GamePhase::GameOver(GameOverReason::Victory);
        let png = render_game_card_blocking(&session, &db).unwrap();
        assert!(!png.is_empty());
    }

    #[test]
    fn render_with_effects() {
        let db = test_fontdb();
        let mut session = test_session();
        session.phase = GamePhase::Combat;
        session.enemy = Some(super::super::content::spawn_enemy(2));
        session.player_mut(OWNER).effects = vec![
            EffectInstance {
                kind: EffectKind::Poison,
                stacks: 2,
                turns_left: 3,
            },
            EffectInstance {
                kind: EffectKind::Shielded,
                stacks: 1,
                turns_left: 2,
            },
        ];
        let png = render_game_card_blocking(&session, &db).unwrap();
        assert!(!png.is_empty());
    }

    #[test]
    fn template_from_session_no_panic() {
        let session = test_session();
        let template = GameCardTemplate::from_session(&session);
        assert_eq!(template.turn, 3);
        assert!(!template.has_enemy);
    }

    #[test]
    fn template_from_session_combat() {
        let mut session = test_session();
        session.phase = GamePhase::Combat;
        session.enemy = Some(super::super::content::spawn_enemy(0));
        let template = GameCardTemplate::from_session(&session);
        assert!(template.has_enemy);
        assert!(!template.enemy_name.is_empty());
    }

    #[test]
    fn phase_label_city() {
        assert_eq!(phase_label(&GamePhase::City), "City");
    }

    #[test]
    fn phase_colors_city() {
        let mut session = test_session();
        session.phase = GamePhase::City;
        let (color, _) = phase_colors(&session);
        assert_eq!(color, "#9b59b6");
    }
}
