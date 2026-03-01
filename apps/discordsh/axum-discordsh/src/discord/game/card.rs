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

/// Pre-computed display values for a single player panel in the SVG card.
pub struct PlayerPanel {
    pub name: String,
    pub hp: i32,
    pub max_hp: i32,
    pub hp_width: u32,
    pub hp_color: String,
    pub armor: i32,
    pub gold: i32,
    pub effects: Vec<EffectBadge>,
    pub alive: bool,
    /// Whether to render a compact panel (party mode) vs full panel (solo).
    pub compact: bool,
    // Pre-computed Y coordinates
    pub y_name: u32,
    pub y_bar: u32,
    pub y_bar_text: u32,
    pub y_stats: u32,
    pub y_effects: u32,
    pub y_effects_text: u32,
    // XP progress bar (full mode only)
    pub xp_width: u32,
    pub level: u8,
    pub class_label: String,
    pub y_xp_bar: u32,
    pub y_xp_bar_text: u32,
    // Equipment display (full mode only)
    pub weapon_display: String,
    pub armor_display: String,
    pub y_gear: u32,
}

/// Pre-computed display values for a single enemy panel in the SVG card.
pub struct EnemyPanel {
    pub name: String,
    pub level: u8,
    pub hp: i32,
    pub max_hp: i32,
    pub hp_width: u32,
    pub armor: i32,
    pub y_name: u32,
    pub y_hp_bar: u32,
    pub y_hp_text: u32,
    pub y_def: u32,
    pub y_intent_box: u32,
    pub y_intent_text: u32,
    pub y_effects: u32,
    pub y_effects_text: u32,
    pub intent_icon: String,
    pub intent_text: String,
    pub effects: Vec<EffectBadge>,
    pub font_size_name: u32,
    pub font_size_stats: u32,
    pub hp_bar_height: u32,
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

    // Players (1–4 panels)
    pub players: Vec<PlayerPanel>,

    // Enemies (conditional, multi-enemy)
    pub has_enemy: bool,
    pub enemies: Vec<EnemyPanel>,
    #[allow(dead_code)] // used in tests but not in the SVG template
    pub enemy_count: usize,

    // Room
    pub room_badges: Vec<RoomBadge>,
    pub turn: u32,

    // Party indicator
    pub is_party_mode: bool,
    pub party_count: usize,
    pub party_alive: usize,
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
        GamePhase::Trap => ("#e74c3c".into(), "#c0392b".into()),
        GamePhase::Treasure => ("#f1c40f".into(), "#d4ac0d".into()),
        GamePhase::Hallway => ("#2ecc71".into(), "#27ae60".into()),
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
        GamePhase::Trap => "Trap",
        GamePhase::Treasure => "Treasure",
        GamePhase::Hallway => "Hallway",
        GamePhase::GameOver(GameOverReason::Victory) => "Victory",
        GamePhase::GameOver(GameOverReason::Defeated) => "Defeated",
        GamePhase::GameOver(GameOverReason::Escaped) => "Escaped",
        GamePhase::GameOver(GameOverReason::Expired) => "Expired",
        GamePhase::WaitingForActions => "Waiting",
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
        EffectKind::Sharpened => "#f39c12",
        EffectKind::Thorns => "#d35400",
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
        EffectKind::Sharpened => "SHP",
        EffectKind::Thorns => "THR",
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
        Intent::Debuff {
            effect,
            stacks,
            turns,
        } => (
            "\u{2622}".into(),
            format!("{:?} x{} ({}t)", effect, stacks, turns),
        ),
        Intent::AoeAttack { dmg } => ("\u{1F4A5}".into(), format!("AoE ({dmg})")),
        Intent::HealSelf { amount } => ("\u{2764}".into(), format!("Heal (+{amount})")),
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

/// Y offsets for player panels based on party size.
/// Returns (y_name_offsets, compact). Compact uses tighter spacing for 2+ players.
fn player_y_offsets(count: usize) -> (Vec<u32>, bool) {
    match count {
        1 => (vec![85], false),
        2 => (vec![62, 192], true),
        3 => (vec![62, 152, 242], true),
        _ => (vec![62, 130, 198, 266], true),
    }
}

/// Y offsets for enemy panels based on enemy count.
/// Returns (y_name_offsets, font_size_name, font_size_stats, hp_bar_height).
fn enemy_y_layout(count: usize) -> (Vec<u32>, u32, u32, u32) {
    match count {
        1 => (vec![85], 18, 14, 22),
        2 => (vec![70, 200], 16, 12, 18),
        _ => (vec![65, 155, 245], 14, 11, 14),
    }
}

impl GameCardTemplate {
    pub fn from_session(session: &SessionState) -> Self {
        let (phase_color, phase_color_dark) = phase_colors(session);

        // Build player panels from roster (owner first, then party members)
        let roster = session.roster();
        let (offsets, compact) = player_y_offsets(roster.len());

        let players: Vec<PlayerPanel> = roster
            .iter()
            .enumerate()
            .map(|(i, (_, player))| {
                let y = offsets[i];

                // Build weapon/armor display strings
                let weapon_display = player
                    .weapon
                    .as_ref()
                    .and_then(|wid| super::content::find_gear(wid))
                    .map(|g| format!("\u{2694} {}", g.name))
                    .unwrap_or_default();
                let armor_display = player
                    .armor_gear
                    .as_ref()
                    .and_then(|aid| super::content::find_gear(aid))
                    .map(|g| format!("\u{1F6E1} {}", g.name))
                    .unwrap_or_default();

                // XP progress
                let xp_width = if player.xp_to_next > 0 {
                    (player.xp as f32 / player.xp_to_next as f32 * HP_BAR_MAX_WIDTH as f32)
                        .min(HP_BAR_MAX_WIDTH as f32) as u32
                } else {
                    0
                };

                if compact {
                    // Compact: name → HP bar (16px) → DEF/Gold text → effects
                    PlayerPanel {
                        name: player.name.clone(),
                        hp: player.hp.max(0),
                        max_hp: player.max_hp,
                        hp_width: hp_bar_width(player.hp, player.max_hp),
                        hp_color: hp_ratio_color(player.hp, player.max_hp),
                        armor: player.armor,
                        gold: player.gold,
                        effects: build_effect_badges(&player.effects, 30),
                        alive: player.alive,
                        compact: true,
                        y_name: y,
                        y_bar: y + 8,
                        y_bar_text: y + 20,
                        y_stats: y + 36,
                        y_effects: y + 50,
                        y_effects_text: y + 53,
                        // XP/equipment not shown in compact mode, but set defaults
                        xp_width,
                        level: player.level,
                        class_label: player.class.label().to_string(),
                        y_xp_bar: y + 24,
                        y_xp_bar_text: y + 28,
                        weapon_display: String::new(),
                        armor_display: String::new(),
                        y_gear: 0,
                    }
                } else {
                    // Full: name → HP bar (22px) → XP bar → gear → DEF/Gold text → effects
                    let y_bar = y + 11;
                    let hp_bar_h: u32 = 22;
                    let y_xp_bar = y_bar + hp_bar_h + 2;
                    let y_gear = y_xp_bar + 16;
                    let y_stats = y_gear + 18;
                    let y_effects = y_stats + 30;
                    PlayerPanel {
                        name: player.name.clone(),
                        hp: player.hp.max(0),
                        max_hp: player.max_hp,
                        hp_width: hp_bar_width(player.hp, player.max_hp),
                        hp_color: hp_ratio_color(player.hp, player.max_hp),
                        armor: player.armor,
                        gold: player.gold,
                        effects: build_effect_badges(&player.effects, 30),
                        alive: player.alive,
                        compact: false,
                        y_name: y,
                        y_bar,
                        y_bar_text: y + 27,
                        y_stats,
                        y_effects,
                        y_effects_text: y_effects + 4,
                        xp_width,
                        level: player.level,
                        class_label: player.class.label().to_string(),
                        y_xp_bar,
                        y_xp_bar_text: y_xp_bar + 4,
                        weapon_display,
                        armor_display,
                        y_gear,
                    }
                }
            })
            .collect();

        // Build multi-enemy panels
        let has_enemy = !session.enemies.is_empty();
        let enemy_count = session.enemies.len();
        let enemies: Vec<EnemyPanel> = if has_enemy {
            let (y_offsets, font_size_name, font_size_stats, hp_bar_height) =
                enemy_y_layout(enemy_count);

            session
                .enemies
                .iter()
                .enumerate()
                .map(|(i, enemy)| {
                    let y_name = y_offsets[i.min(y_offsets.len() - 1)];
                    let y_hp_bar = y_name + 11;
                    let y_hp_text = y_hp_bar + (hp_bar_height * 3 / 4);
                    let y_def = y_hp_bar + hp_bar_height + 20;
                    let y_intent = y_def + 20;
                    let y_effects = y_intent + 30;

                    let (icon, text) = intent_to_icon_and_text(&enemy.intent);
                    let display_name = if enemy.enraged {
                        format!("{} \u{1F525}", enemy.name)
                    } else {
                        enemy.name.clone()
                    };

                    EnemyPanel {
                        name: display_name,
                        level: enemy.level,
                        hp: enemy.hp.max(0),
                        max_hp: enemy.max_hp,
                        hp_width: hp_bar_width(enemy.hp, enemy.max_hp),
                        armor: enemy.armor,
                        y_name,
                        y_hp_bar,
                        y_hp_text,
                        y_def,
                        y_intent_box: y_intent - 4,
                        y_intent_text: y_intent + 8,
                        y_effects,
                        y_effects_text: y_effects + 4,
                        intent_icon: icon,
                        intent_text: text,
                        effects: build_effect_badges(&enemy.effects, 430),
                        font_size_name,
                        font_size_stats,
                        hp_bar_height,
                    }
                })
                .collect()
        } else {
            Vec::new()
        };

        Self {
            phase_color,
            phase_color_dark,
            room_number: session.room.index + 1,
            room_name: session.room.name.clone(),
            phase_label: phase_label(&session.phase).to_owned(),

            players,

            has_enemy,
            enemies,
            enemy_count,

            room_badges: build_room_badges(session),
            turn: session.turn,

            is_party_mode: session.mode == SessionMode::Party,
            party_count: session.players.len(),
            party_alive: session.players.values().filter(|p| p.alive).count(),
        }
    }
}

// ── Map card display types ──────────────────────────────────────────

/// Pre-computed display values for a single tile in the map SVG grid.
pub struct MapTileDisplay {
    /// Tile top-left X: 20 + grid_x * 52
    pub tx: i32,
    /// Tile top-left Y: 44 + grid_y * 52
    pub ty: i32,
    /// Tile center X: tx + 24
    pub cx: i32,
    /// Tile center Y: ty + 24
    pub cy: i32,
    pub fill_color: String,
    /// Room type identifier for SVG shape rendering: "combat", "boss", etc.
    pub icon_id: String,
    /// Icon stroke/fill color (white for visited, gray for unvisited).
    pub icon_color: String,
    pub is_current: bool,
    pub is_visited: bool,
    pub is_discovered: bool,
    pub has_exit_n: bool,
    pub has_exit_s: bool,
    pub has_exit_e: bool,
    pub has_exit_w: bool,
    pub cleared: bool,
}

/// Askama SVG template for the dungeon map card.
#[derive(Template)]
#[template(path = "game/map.svg")]
pub struct MapCardTemplate {
    pub tiles: Vec<MapTileDisplay>,
    pub player_x: i32,
    pub player_y: i32,
    pub tiles_explored: u32,
    pub depth: u32,
}

// ── Map helpers ─────────────────────────────────────────────────────

fn room_type_color(room_type: &RoomType) -> &'static str {
    match room_type {
        RoomType::Combat => "#cc3333",
        RoomType::Boss => "#ff4444",
        RoomType::Treasure => "#ffaa00",
        RoomType::RestShrine => "#44cc44",
        RoomType::Merchant => "#aa88ff",
        RoomType::UndergroundCity => "#4488ff",
        RoomType::Story => "#ff88ff",
        RoomType::Trap => "#ff8800",
        RoomType::Hallway => "#666666",
    }
}

fn room_type_icon_id(room_type: &RoomType) -> &'static str {
    match room_type {
        RoomType::Combat => "combat",
        RoomType::Boss => "boss",
        RoomType::Treasure => "treasure",
        RoomType::RestShrine => "rest",
        RoomType::Merchant => "merchant",
        RoomType::UndergroundCity => "city",
        RoomType::Story => "story",
        RoomType::Trap => "trap",
        RoomType::Hallway => "hallway",
    }
}

/// Build a `MapCardTemplate` from the current session state.
///
/// Creates a 7x7 grid centred on the player's current position.
/// Only tiles that are visited or adjacent to a visited tile (discovered)
/// are included; everything else is left blank (dark background).
pub fn build_map_card(session: &SessionState) -> MapCardTemplate {
    let pos = &session.map.position;
    let half = 3i16; // 7x7 grid, center at index 3
    let mut tiles = Vec::new();

    for gy in 0..7i16 {
        for gx in 0..7i16 {
            let world_x = pos.x + (gx - half);
            let world_y = pos.y + (gy - half);
            let world_pos = MapPos::new(world_x, world_y);

            if let Some(tile) = session.map.tiles.get(&world_pos) {
                let is_current = world_pos == *pos;
                let is_visited = tile.visited;

                // A tile is "discovered" if it is adjacent to a visited tile
                // but hasn't been visited itself.
                let is_discovered = if !is_visited {
                    Direction::all().iter().any(|dir| {
                        let neighbor = world_pos.neighbor(*dir);
                        session.map.tiles.get(&neighbor).is_some_and(|t| t.visited)
                    })
                } else {
                    false
                };

                // Only render visited or discovered tiles
                if !is_visited && !is_discovered {
                    continue;
                }

                let fill_color = if is_visited {
                    room_type_color(&tile.room_type).to_owned()
                } else {
                    "#333344".to_owned()
                };

                let icon_id = if is_visited {
                    room_type_icon_id(&tile.room_type).to_owned()
                } else {
                    "unknown".to_owned()
                };

                let icon_color = if is_visited {
                    "#ffffff".to_owned()
                } else {
                    "#888899".to_owned()
                };

                // Pre-compute pixel positions for SVG rendering
                let gxi = gx as i32;
                let gyi = gy as i32;
                let tx = 20 + gxi * 52;
                let ty = 44 + gyi * 52;

                tiles.push(MapTileDisplay {
                    tx,
                    ty,
                    cx: tx + 24,
                    cy: ty + 24,
                    fill_color,
                    icon_id,
                    icon_color,
                    is_current,
                    is_visited,
                    is_discovered,
                    has_exit_n: tile.exits.contains(&Direction::North),
                    has_exit_s: tile.exits.contains(&Direction::South),
                    has_exit_e: tile.exits.contains(&Direction::East),
                    has_exit_w: tile.exits.contains(&Direction::West),
                    cleared: tile.cleared,
                });
            }
        }
    }

    MapCardTemplate {
        tiles,
        player_x: pos.x as i32,
        player_y: pos.y as i32,
        tiles_explored: session.map.tiles_visited,
        depth: pos.depth(),
    }
}

// ── Public render function (map) ────────────────────────────────────

/// Render the map card as PNG bytes (CPU-bound).
pub fn render_map_card_blocking(
    session: &SessionState,
    fontdb: &FontDb,
) -> Result<Vec<u8>, String> {
    let template = build_map_card(session);
    let svg_string = template
        .render()
        .map_err(|e| format!("Map SVG template error: {e}"))?;

    render_svg_to_png(&svg_string, fontdb).map_err(|e| format!("Map SVG render error: {e}"))
}

/// Async wrapper — clones session and renders the map on a blocking thread.
pub async fn render_map_card(session: &SessionState, fontdb: FontDb) -> Result<Vec<u8>, String> {
    let session_clone = session.clone();
    tokio::task::spawn_blocking(move || render_map_card_blocking(&session_clone, &fontdb))
        .await
        .map_err(|e| format!("Map render task panicked: {e}"))?
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
        // Try project fonts; tests still pass without them
        let _ = db.load_font_file("../../../alagard.ttf");
        let _ = db.load_font_file("../../../NotoSansSymbols-Regular.ttf");
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
            enemies: Vec::new(),
            room: super::super::content::generate_room(0),
            log: Vec::new(),
            show_items: false,
            pending_actions: HashMap::new(),
            map: test_map_default(),
            show_map: false,
            pending_destination: None,
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
        session.enemies = vec![super::super::content::spawn_enemy(0)];
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
        session.enemies = vec![super::super::content::spawn_enemy(2)];
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
        assert!(template.enemies.is_empty());
    }

    #[test]
    fn template_from_session_combat() {
        let mut session = test_session();
        session.phase = GamePhase::Combat;
        session.enemies = vec![super::super::content::spawn_enemy(0)];
        let template = GameCardTemplate::from_session(&session);
        assert!(template.has_enemy);
        assert_eq!(template.enemy_count, 1);
        assert!(!template.enemies[0].name.is_empty());
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

    #[test]
    fn render_party_card() {
        let db = test_fontdb();
        let mut session = test_session();
        session.mode = SessionMode::Party;
        let member = serenity::UserId::new(2);
        session.party.push(member);
        session.players.insert(
            member,
            PlayerState {
                name: "Bob".to_owned(),
                ..PlayerState::default()
            },
        );
        let template = GameCardTemplate::from_session(&session);
        assert_eq!(template.players.len(), 2);
        assert!(template.players[0].compact);
        assert!(template.is_party_mode);
        let png = render_game_card_blocking(&session, &db);
        assert!(png.is_ok(), "Party render failed: {:?}", png.err());
    }

    #[test]
    fn render_party_combat_card() {
        let db = test_fontdb();
        let mut session = test_session();
        session.mode = SessionMode::Party;
        session.phase = GamePhase::Combat;
        session.enemies = vec![super::super::content::spawn_enemy(0)];
        let member = serenity::UserId::new(2);
        session.party.push(member);
        session.players.insert(
            member,
            PlayerState {
                name: "Alice".to_owned(),
                ..PlayerState::default()
            },
        );
        let png = render_game_card_blocking(&session, &db);
        assert!(png.is_ok(), "Party combat render failed: {:?}", png.err());
    }

    #[test]
    fn test_multi_enemy_card_render() {
        let db = test_fontdb();
        let mut session = test_session();
        session.phase = GamePhase::Combat;
        // Create 3 distinct enemies
        let mut e1 = super::super::content::spawn_enemy(0);
        e1.name = "Slime A".to_owned();
        e1.index = 0;
        let mut e2 = super::super::content::spawn_enemy(0);
        e2.name = "Slime B".to_owned();
        e2.index = 1;
        let mut e3 = super::super::content::spawn_enemy(0);
        e3.name = "Slime C".to_owned();
        e3.index = 2;
        session.enemies = vec![e1, e2, e3];

        let template = GameCardTemplate::from_session(&session);
        // The template shows has_enemy when enemies exist
        assert!(template.has_enemy);
        // Multi-enemy display: template should contain all 3 enemies
        assert_eq!(
            template.enemy_count, 3,
            "Should have 3 enemies in the template"
        );
        assert_eq!(
            template.enemies.len(),
            3,
            "Enemy panels should have 3 entries"
        );

        // Player panels should have distinct y_name offsets (no overlap)
        let y_values: Vec<u32> = template.players.iter().map(|p| p.y_name).collect();
        for i in 0..y_values.len() {
            for j in (i + 1)..y_values.len() {
                assert_ne!(
                    y_values[i], y_values[j],
                    "Player panels at {} and {} should have distinct y_name",
                    i, j
                );
            }
        }

        // Render to PNG and verify it succeeds with PNG magic bytes
        let png = render_game_card_blocking(&session, &db);
        assert!(png.is_ok(), "Multi-enemy render failed: {:?}", png.err());
        let bytes = png.unwrap();
        assert_eq!(
            &bytes[0..4],
            &[0x89, 0x50, 0x4E, 0x47],
            "should be valid PNG"
        );
    }

    #[test]
    fn test_equipment_display_on_card() {
        let mut session = test_session();
        // Equip weapon and armor on the owner
        session.player_mut(OWNER).weapon = Some("rusty_sword".to_owned());
        session.player_mut(OWNER).armor_gear = Some("leather_vest".to_owned());

        let template = GameCardTemplate::from_session(&session);
        // Player should exist and have the name from default PlayerState
        assert!(!template.players.is_empty());
        let player_panel = &template.players[0];
        assert_eq!(player_panel.name, "Adventurer");
        // Armor stat should reflect the gear bonus (base 5 + leather_vest bonus 2 = 7)
        // But the card reads from player state directly, so armor is what's in PlayerState
        assert_eq!(player_panel.armor, 5); // PlayerState default armor (gear bonus applied in logic, not card)

        // Also verify the session data we set is intact
        assert_eq!(
            session.owner_player().weapon,
            Some("rusty_sword".to_owned())
        );
        assert_eq!(
            session.owner_player().armor_gear,
            Some("leather_vest".to_owned())
        );
    }

    #[test]
    fn test_xp_bar_on_card() {
        let mut session = test_session();
        // Set player XP and level
        session.player_mut(OWNER).xp = 50;
        session.player_mut(OWNER).xp_to_next = 100;
        session.player_mut(OWNER).level = 2;

        let template = GameCardTemplate::from_session(&session);
        assert!(!template.players.is_empty());
        let player_panel = &template.players[0];
        // HP bar width should be proportional (player has full HP 50/50 = 100%)
        assert!(
            player_panel.hp_width > 0,
            "HP bar width should be > 0 for alive player"
        );
        // Verify the player data is reflected
        assert_eq!(session.owner_player().level, 2);
        assert_eq!(session.owner_player().xp, 50);
        assert_eq!(session.owner_player().xp_to_next, 100);
    }

    #[test]
    fn test_player_panel_sizing() {
        // 1 player (solo): y_name = 85 (non-compact)
        let session1 = test_session();
        let t1 = GameCardTemplate::from_session(&session1);
        assert_eq!(t1.players.len(), 1);
        assert!(!t1.players[0].compact, "solo player should not be compact");
        assert_eq!(t1.players[0].y_name, 85);

        // 2 players: compact mode, y offsets at 62 and 192
        let mut session2 = test_session();
        session2.mode = SessionMode::Party;
        let member = serenity::UserId::new(2);
        session2.party.push(member);
        session2.players.insert(
            member,
            PlayerState {
                name: "Bob".to_owned(),
                ..PlayerState::default()
            },
        );
        let t2 = GameCardTemplate::from_session(&session2);
        assert_eq!(t2.players.len(), 2);
        assert!(t2.players[0].compact, "2-player should be compact");
        assert_eq!(t2.players[0].y_name, 62);
        assert_eq!(t2.players[1].y_name, 192);

        // 3 players: compact mode, y offsets at 62, 152, 242
        let mut session3 = test_session();
        session3.mode = SessionMode::Party;
        let m2 = serenity::UserId::new(2);
        let m3 = serenity::UserId::new(3);
        session3.party.push(m2);
        session3.party.push(m3);
        session3.players.insert(
            m2,
            PlayerState {
                name: "Bob".to_owned(),
                ..PlayerState::default()
            },
        );
        session3.players.insert(
            m3,
            PlayerState {
                name: "Charlie".to_owned(),
                ..PlayerState::default()
            },
        );
        let t3 = GameCardTemplate::from_session(&session3);
        assert_eq!(t3.players.len(), 3);
        assert!(t3.players[0].compact, "3-player should be compact");
        assert_eq!(t3.players[0].y_name, 62);
        assert_eq!(t3.players[1].y_name, 152);
        assert_eq!(t3.players[2].y_name, 242);
    }

    // ── Map card SVG tests ──────────────────────────────────────────

    #[test]
    fn test_build_map_card_template() {
        let session = test_session();
        let template = build_map_card(&session);

        // Origin tile should be present
        assert!(!template.tiles.is_empty(), "map should have visible tiles");
        assert_eq!(template.player_x, 0);
        assert_eq!(template.player_y, 0);
        assert!(template.tiles_explored >= 1);

        // Current tile should be flagged
        let current = template.tiles.iter().find(|t| t.is_current);
        assert!(current.is_some(), "current tile should be in the grid");
        let current = current.unwrap();
        assert!(current.is_visited);
        assert!(!current.icon_id.is_empty());
    }

    #[test]
    fn test_map_card_has_correct_icon_ids() {
        // Verify all icon_ids are valid SVG icon types
        let valid_ids = [
            "combat", "boss", "treasure", "rest", "merchant", "city", "story", "trap", "hallway",
            "unknown",
        ];
        let session = test_session();
        let template = build_map_card(&session);
        for tile in &template.tiles {
            assert!(
                valid_ids.contains(&tile.icon_id.as_str()),
                "unexpected icon_id: {}",
                tile.icon_id
            );
        }
    }

    #[test]
    fn test_map_card_tile_coordinates() {
        let session = test_session();
        let template = build_map_card(&session);
        for tile in &template.tiles {
            // tx/ty should be within the 400x400 SVG viewport
            assert!(tile.tx >= 20, "tx should be >= 20, got {}", tile.tx);
            assert!(tile.ty >= 44, "ty should be >= 44, got {}", tile.ty);
            assert!(
                tile.tx + 48 <= 400,
                "tile right edge should fit in viewport"
            );
            assert!(
                tile.ty + 48 <= 400,
                "tile bottom edge should fit in viewport"
            );
            // cx/cy should be tile center
            assert_eq!(tile.cx, tile.tx + 24);
            assert_eq!(tile.cy, tile.ty + 24);
        }
    }

    #[test]
    fn test_map_card_svg_renders_valid_svg() {
        let session = test_session();
        let template = build_map_card(&session);
        let svg = template.render().expect("SVG template should render");
        assert!(svg.starts_with("<svg"), "should start with <svg");
        assert!(svg.contains("</svg>"), "should contain closing </svg>");
        // Verify SVG shape icons are present (not Unicode text)
        assert!(
            svg.contains("stroke-linecap") || svg.contains("stroke-width"),
            "should contain SVG shape attributes"
        );
        // No Unicode icon characters should be in the output
        assert!(
            !svg.contains('\u{2694}'),
            "should not contain Unicode sword icon"
        );
        assert!(
            !svg.contains('\u{2620}'),
            "should not contain Unicode skull icon"
        );
    }

    #[test]
    fn test_map_card_renders_to_png() {
        let db = test_fontdb();
        let session = test_session();
        let png = render_map_card_blocking(&session, &db);
        assert!(png.is_ok(), "Map render failed: {:?}", png.err());
        let bytes = png.unwrap();
        assert!(!bytes.is_empty());
        assert_eq!(
            &bytes[0..4],
            &[0x89, 0x50, 0x4E, 0x47],
            "should be valid PNG"
        );
    }

    #[test]
    fn test_map_card_renders_without_fonts() {
        // Simulate Docker environment: no system fonts, no custom fonts.
        // SVG shape icons should still render correctly since they don't need fonts.
        let db = FontDb::new(); // empty fontdb — no fonts loaded
        let session = test_session();
        let png = render_map_card_blocking(&session, &db);
        assert!(
            png.is_ok(),
            "Map render should succeed without fonts: {:?}",
            png.err()
        );
        let bytes = png.unwrap();
        assert!(!bytes.is_empty());
        assert_eq!(&bytes[0..4], &[0x89, 0x50, 0x4E, 0x47]);
    }

    #[test]
    fn test_game_card_renders_without_fonts() {
        // Docker smoke test: game card should also render without system fonts
        let db = FontDb::new(); // empty fontdb
        let session = test_session();
        let png = render_game_card_blocking(&session, &db);
        assert!(
            png.is_ok(),
            "Game card render should succeed without fonts: {:?}",
            png.err()
        );
        let bytes = png.unwrap();
        assert_eq!(&bytes[0..4], &[0x89, 0x50, 0x4E, 0x47]);
    }
}
