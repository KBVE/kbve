// ---------------------------------------------------------------------------
// MC Stats Display Module
//
// Phase 1: Mock data + scoreboard sidebar + XP boss bar.
// Phase 2 will swap the DashMap for Supabase Edge Function calls.
// ---------------------------------------------------------------------------

use std::sync::LazyLock;

use dashmap::DashMap;
use pumpkin::command::args::ConsumedArgs;
use pumpkin::command::dispatcher::CommandError;
use pumpkin::command::{CommandExecutor, CommandResult, CommandSender};
use pumpkin::entity::player::Player;
use pumpkin::server::Server;
use pumpkin::world::bossbar::{Bossbar, BossbarColor, BossbarDivisions};
use pumpkin_data::scoreboard::ScoreboardDisplaySlot;
use pumpkin_protocol::NumberFormat;
use pumpkin_protocol::codec::var_int::VarInt;
use pumpkin_protocol::java::client::play::{
    CDisplayObjective, CUpdateObjectives, CUpdateScore, Mode, RenderType,
};
use pumpkin_util::text::TextComponent;
use pumpkin_util::text::color::NamedColor;
use uuid::Uuid;

// ---------------------------------------------------------------------------
// Character data (mirrors proto McCharacter / McCharacterStats)
// ---------------------------------------------------------------------------

#[derive(Clone, Debug)]
pub struct CharacterData {
    pub level: i32,
    pub experience: i64,
    pub strength: i32,
    pub dexterity: i32,
    pub constitution: i32,
    pub intelligence: i32,
    pub wisdom: i32,
    pub charisma: i32,
}

impl Default for CharacterData {
    fn default() -> Self {
        Self {
            level: 1,
            experience: 0,
            strength: 10,
            dexterity: 10,
            constitution: 10,
            intelligence: 10,
            wisdom: 10,
            charisma: 10,
        }
    }
}

impl CharacterData {
    /// XP required to reach a given level: `(level - 1)^2 * 100`
    pub fn xp_for_level(level: i32) -> i64 {
        let l = (level - 1) as i64;
        l * l * 100
    }

    /// Progress fraction toward next level (0.0 to 1.0)
    pub fn level_progress(&self) -> f32 {
        let current_xp = Self::xp_for_level(self.level);
        let next_xp = Self::xp_for_level(self.level + 1);
        let range = next_xp - current_xp;
        if range <= 0 {
            return 1.0;
        }
        ((self.experience - current_xp) as f32 / range as f32).clamp(0.0, 1.0)
    }
}

// ---------------------------------------------------------------------------
// Per-player state (DashMap, same pattern as ORBITAL_COOLDOWNS in lib.rs)
// ---------------------------------------------------------------------------

/// Per-player character data store. Key: player UUID as u128.
pub static PLAYER_STATS: LazyLock<DashMap<u128, CharacterData>> = LazyLock::new(DashMap::new);

/// Per-player boss bar UUID tracking (for update/removal).
pub static PLAYER_BOSSBARS: LazyLock<DashMap<u128, Uuid>> = LazyLock::new(DashMap::new);

/// Per-player sidebar visibility toggle.
pub static SIDEBAR_VISIBLE: LazyLock<DashMap<u128, bool>> = LazyLock::new(DashMap::new);

// ---------------------------------------------------------------------------
// Scoreboard sidebar
// ---------------------------------------------------------------------------

const OBJECTIVE_NAME: &str = "kbve_stats";

/// Send the full stats sidebar to a single player.
pub async fn send_stats_sidebar(player: &Player, data: &CharacterData) {
    // 1. Create objective (Mode::Add)
    player
        .client
        .enqueue_packet(&CUpdateObjectives::new(
            OBJECTIVE_NAME.to_string(),
            Mode::Add,
            TextComponent::text("KBVE Stats")
                .color_named(NamedColor::Gold)
                .bold(),
            RenderType::Integer,
            Some(NumberFormat::Blank),
        ))
        .await;

    // 2. Assign to sidebar
    player
        .client
        .enqueue_packet(&CDisplayObjective::new(
            ScoreboardDisplaySlot::Sidebar,
            OBJECTIVE_NAME.to_string(),
        ))
        .await;

    // 3. Send score entries — highest score value = top of sidebar
    let lines: [(TextComponent, i32); 13] = [
        (
            TextComponent::text("--- Character ---")
                .color_named(NamedColor::Gold)
                .bold(),
            15,
        ),
        (
            TextComponent::text("Level: ")
                .color_named(NamedColor::White)
                .add_child(
                    TextComponent::text(format!("{}", data.level))
                        .color_named(NamedColor::Green)
                        .bold(),
                ),
            14,
        ),
        (
            TextComponent::text("XP: ")
                .color_named(NamedColor::White)
                .add_child(
                    TextComponent::text(format!("{}", data.experience))
                        .color_named(NamedColor::Aqua),
                ),
            13,
        ),
        (TextComponent::text(" "), 12), // spacer
        (
            TextComponent::text("--- Stats ---")
                .color_named(NamedColor::Yellow)
                .bold(),
            11,
        ),
        (stat_line("STR", data.strength, NamedColor::Red), 10),
        (stat_line("DEX", data.dexterity, NamedColor::Green), 9),
        (stat_line("CON", data.constitution, NamedColor::DarkRed), 8),
        (stat_line("INT", data.intelligence, NamedColor::Blue), 7),
        (stat_line("WIS", data.wisdom, NamedColor::DarkPurple), 6),
        (stat_line("CHA", data.charisma, NamedColor::Gold), 5),
        (TextComponent::text("  "), 4), // spacer
        (
            TextComponent::text("kbve.com")
                .color_named(NamedColor::Gray)
                .italic(),
            3,
        ),
    ];

    for (text, score) in lines {
        let entity_name = format!("kbve_line_{score}");
        player
            .client
            .enqueue_packet(&CUpdateScore::new(
                entity_name,
                OBJECTIVE_NAME.to_string(),
                VarInt(score),
                Some(text),
                Some(NumberFormat::Blank),
            ))
            .await;
    }
}

fn stat_line(name: &str, value: i32, color: NamedColor) -> TextComponent {
    TextComponent::text(format!("{name}: "))
        .color_named(NamedColor::White)
        .add_child(
            TextComponent::text(format!("{value}"))
                .color_named(color)
                .bold(),
        )
}

/// Remove the stats sidebar from a player.
pub async fn remove_stats_sidebar(player: &Player) {
    player
        .client
        .enqueue_packet(&CUpdateObjectives::new(
            OBJECTIVE_NAME.to_string(),
            Mode::Remove,
            TextComponent::text(""),
            RenderType::Integer,
            None,
        ))
        .await;
}

// ---------------------------------------------------------------------------
// Boss bar (XP progress)
// ---------------------------------------------------------------------------

/// Create and send the XP progress boss bar.
pub async fn send_xp_bossbar(player: &Player, data: &CharacterData) {
    let uuid_bits = player.gameprofile.id.as_u128();

    let current_level_xp = CharacterData::xp_for_level(data.level);
    let next_level_xp = CharacterData::xp_for_level(data.level + 1);
    let xp_in_level = data.experience - current_level_xp;
    let xp_needed = next_level_xp - current_level_xp;

    let title = TextComponent::text(format!(
        "Lvl {} \u{2014} {}/{} XP",
        data.level, xp_in_level, xp_needed
    ))
    .color_named(NamedColor::Gold);

    let mut bossbar = Bossbar::new(title);
    bossbar.health = data.level_progress();
    bossbar.color = BossbarColor::Green;
    bossbar.division = BossbarDivisions::Notches10;

    PLAYER_BOSSBARS.insert(uuid_bits, bossbar.uuid);
    player.send_bossbar(&bossbar).await;
}

/// Remove the XP boss bar for a player.
pub async fn remove_xp_bossbar(player: &Player) {
    let uuid_bits = player.gameprofile.id.as_u128();
    if let Some((_, bar_uuid)) = PLAYER_BOSSBARS.remove(&uuid_bits) {
        player.remove_bossbar(bar_uuid).await;
    }
}

// ---------------------------------------------------------------------------
// Cleanup (called on player leave)
// ---------------------------------------------------------------------------

pub fn cleanup_player(uuid_bits: u128) {
    PLAYER_STATS.remove(&uuid_bits);
    PLAYER_BOSSBARS.remove(&uuid_bits);
    SIDEBAR_VISIBLE.remove(&uuid_bits);
}

// ---------------------------------------------------------------------------
// /kbve stats command
// ---------------------------------------------------------------------------

pub struct StatsCommandExecutor;

impl CommandExecutor for StatsCommandExecutor {
    fn execute<'a>(
        &'a self,
        sender: &'a CommandSender,
        _server: &'a Server,
        _args: &'a ConsumedArgs<'a>,
    ) -> CommandResult<'a> {
        Box::pin(async move {
            let player = sender.as_player().ok_or(CommandError::InvalidRequirement)?;

            let uuid_bits = player.gameprofile.id.as_u128();
            let currently_visible = SIDEBAR_VISIBLE.get(&uuid_bits).map(|v| *v).unwrap_or(false);

            if currently_visible {
                remove_stats_sidebar(&player).await;
                SIDEBAR_VISIBLE.insert(uuid_bits, false);
                player
                    .send_system_message(
                        &TextComponent::text("Stats hidden.").color_named(NamedColor::Gray),
                    )
                    .await;
            } else {
                let data = PLAYER_STATS
                    .get(&uuid_bits)
                    .map(|d| d.clone())
                    .unwrap_or_default();
                send_stats_sidebar(&player, &data).await;
                SIDEBAR_VISIBLE.insert(uuid_bits, true);
                player
                    .send_system_message(
                        &TextComponent::text("Stats displayed! Use /kbve stats to toggle.")
                            .color_named(NamedColor::Green),
                    )
                    .await;
            }

            Ok(1)
        })
    }
}
