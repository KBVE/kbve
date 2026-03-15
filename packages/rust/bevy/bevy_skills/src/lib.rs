//! # bevy_skills
//!
//! Skill progression system for Bevy games.
//!
//! Tracks per-entity skill XP and levels, fires messages on level-up, and
//! provides skill checks for gating interactions (mining, woodcutting,
//! cooking, smithing, alchemy, combat, etc.).
//!
//! ## Quick start
//!
//! ```rust,ignore
//! use bevy::prelude::*;
//! use bevy_skills::{BevySkillsPlugin, SkillProfile, SkillId, GrantXpMsg};
//!
//! fn setup(mut commands: Commands) {
//!     // Spawn a player with a skill profile
//!     commands.spawn(SkillProfile::default());
//! }
//!
//! fn grant_mining_xp(mut writer: MessageWriter<GrantXpMsg>) {
//!     writer.write(GrantXpMsg {
//!         entity: player_entity,
//!         skill: SkillId::from_slug("mining"),
//!         amount: 25,
//!     });
//! }
//! ```

mod events;
mod profile;
mod registry;
mod systems;
mod xp;

pub use events::{GrantXpMsg, LevelUpMsg, SkillCheckMsg, SkillCheckResultMsg};
pub use profile::{SkillEntry, SkillProfile};
pub use registry::{SkillDef, SkillId, SkillRegistry};
pub use xp::XpCurve;

use bevy::prelude::*;

/// Bevy plugin that registers the skill system.
///
/// Adds the [`SkillRegistry`] resource, registers skill messages, and
/// installs the XP processing and level-up systems.
pub struct BevySkillsPlugin;

impl Plugin for BevySkillsPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<SkillRegistry>()
            .add_message::<GrantXpMsg>()
            .add_message::<LevelUpMsg>()
            .add_message::<SkillCheckMsg>()
            .add_message::<SkillCheckResultMsg>()
            .add_systems(
                Update,
                (systems::process_xp_grants, systems::process_skill_checks),
            );
    }
}
