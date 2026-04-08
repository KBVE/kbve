//! Skill system integration — registers skills and grants XP on actions.
//!
//! Uses `bevy_skills` for XP tracking, leveling, and skill checks.
//! Skills are granted XP when players collect resources (trees, rocks, etc.).

use bevy::prelude::*;
use bevy_skills::{BevySkillsPlugin, GrantXpMsg, LevelUpMsg, SkillId, SkillRegistry};

use super::player::Player;
use super::toast::Toast;

// ---------------------------------------------------------------------------
// Skill IDs (stable hashes of ref strings)
// ---------------------------------------------------------------------------

/// Woodcutting — XP from chopping trees.
pub fn skill_woodcutting() -> SkillId {
    SkillId::from_ref("woodcutting")
}
/// Mining — XP from mining rocks and ores.
pub fn skill_mining() -> SkillId {
    SkillId::from_ref("mining")
}
/// Foraging — XP from collecting flowers and mushrooms.
pub fn skill_foraging() -> SkillId {
    SkillId::from_ref("foraging")
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

pub struct SkillsPlugin;

impl Plugin for SkillsPlugin {
    fn build(&self, app: &mut App) {
        app.add_plugins(BevySkillsPlugin);
        app.add_systems(Startup, register_skills);
        app.add_systems(Update, notify_level_ups);
    }
}

// ---------------------------------------------------------------------------
// Startup: register skill definitions
// ---------------------------------------------------------------------------

fn register_skills(mut registry: ResMut<SkillRegistry>) {
    use bevy_skills::SkillDef;

    registry.register(SkillDef {
        r#ref: "woodcutting".into(),
        name: "Woodcutting".into(),
        category: "gathering".into(),
        icon: None,
        xp_curve: None, // uses registry default (base=50, scaling=25, max=99)
    });

    registry.register(SkillDef {
        r#ref: "mining".into(),
        name: "Mining".into(),
        category: "gathering".into(),
        icon: None,
        xp_curve: None,
    });

    registry.register(SkillDef {
        r#ref: "foraging".into(),
        name: "Foraging".into(),
        category: "gathering".into(),
        icon: None,
        xp_curve: None,
    });

    info!("[skills] registered {} skills", registry.len());
}

// ---------------------------------------------------------------------------
// XP grant helper (called from net.rs when ObjectRemoved is received)
// ---------------------------------------------------------------------------

/// Grant gathering XP to the local player based on what they collected.
pub fn grant_collection_xp(
    writer: &mut MessageWriter<GrantXpMsg>,
    player_entity: Entity,
    kind: &bevy_kbve_net::WorldObjectKind,
) {
    use bevy_kbve_net::WorldObjectKind;

    let (skill, xp) = match kind {
        WorldObjectKind::Tree => (skill_woodcutting(), 25),
        WorldObjectKind::Rock => (skill_mining(), 30),
        WorldObjectKind::Flower => (skill_foraging(), 10),
        WorldObjectKind::Mushroom => (skill_foraging(), 15),
    };

    writer.write(GrantXpMsg {
        entity: player_entity,
        skill,
        amount: xp,
    });
}

// ---------------------------------------------------------------------------
// Level-up notification
// ---------------------------------------------------------------------------

fn notify_level_ups(
    mut commands: Commands,
    mut level_ups: MessageReader<LevelUpMsg>,
    registry: Res<SkillRegistry>,
    player_q: Query<Entity, With<Player>>,
) {
    for event in level_ups.read() {
        // Only show toast for the local player
        if !player_q.contains(event.entity) {
            continue;
        }

        let skill_name = registry
            .get(event.skill)
            .map(|d| d.name.as_str())
            .unwrap_or("???");

        info!(
            "[skills] LEVEL UP! {} -> level {}",
            skill_name, event.new_level
        );

        commands.trigger(Toast::success(format!(
            "{} leveled up to {}!",
            skill_name, event.new_level
        )));
    }
}
