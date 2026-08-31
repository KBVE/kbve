//! # bevy_skills
//!
//! Skill progression system for Bevy games.
//!
//! Tracks per-entity skill XP and levels, fires events on level-up,
//! and provides skill checks for gating interactions (mining,
//! woodcutting, cooking, smithing, alchemy, combat, etc.).
//!
//! ## Quick start
//!
//! ```rust,ignore
//! use bevy::prelude::*;
//! use bevy_skills::{
//!     BevySkillsPlugin, SkillProfile, SkillId, SkillRegistry, SkillDef,
//!     GrantXpMsg, LevelUpMsg,
//! };
//!
//! fn build_app() {
//!     App::new()
//!         .add_plugins(BevySkillsPlugin)
//!         .add_systems(Startup, register_skills)
//!         .add_systems(Update, on_level_up);
//! }
//!
//! fn register_skills(mut registry: ResMut<SkillRegistry>) {
//!     registry.register(SkillDef {
//!         r#ref: "mining".into(),
//!         name: "Mining".into(),
//!         xp_curve: None,
//!         category: "gathering".into(),
//!         icon: None,
//!     });
//! }
//!
//! fn on_level_up(mut reader: MessageReader<LevelUpMsg>) {
//!     for msg in reader.read() {
//!         println!("entity {:?} reached {}", msg.entity, msg.new_level);
//!     }
//! }
//!
//! fn grant_xp(mut writer: MessageWriter<GrantXpMsg>) {
//!     writer.write(GrantXpMsg {
//!         entity: /* player */ Entity::PLACEHOLDER,
//!         skill: SkillId::from_ref("mining"),
//!         amount: 25,
//!     });
//! }
//! ```
//!
//! ## Surface
//!
//! - [`BevySkillsPlugin`] — registers resources, messages, systems.
//! - [`SkillRegistry`] / [`SkillDef`] / [`SkillId`] — skill catalogue.
//! - [`SkillProfile`] / [`SkillEntry`] — per-entity skill state.
//! - [`XpCurve`] — quadratic XP curve, configurable per skill.
//! - [`GrantXpMsg`] / [`LevelUpMsg`] / [`SkillCheckMsg`] /
//!   [`SkillCheckResultMsg`] — Bevy messages for the publish/subscribe
//!   pipeline.

mod profile;
mod registry;
mod xp;

// Bevy-only modules — gated behind the `bevy` feature so non-bevy consumers
// (uniti FFI, headless tools) compile without pulling bevy_app +
// android-activity.
#[cfg(feature = "bevy")]
mod events;
#[cfg(feature = "bevy")]
mod systems;

#[cfg(feature = "bevy")]
pub use events::{GrantXpMsg, LevelUpMsg, SkillCheckMsg, SkillCheckResultMsg};
pub use profile::{SkillEntry, SkillProfile};
pub use registry::{SkillDef, SkillId, SkillRegistry};
#[cfg(feature = "bevy")]
pub use systems::{process_skill_checks, process_xp_grants};
pub use xp::XpCurve;

#[cfg(feature = "bevy")]
mod plugin {
    use bevy::prelude::*;

    use crate::events::{GrantXpMsg, LevelUpMsg, SkillCheckMsg, SkillCheckResultMsg};
    use crate::registry::SkillRegistry;
    use crate::systems;

    /// Bevy plugin that registers the skill system.
    ///
    /// Adds the [`SkillRegistry`] resource, registers all four skill
    /// messages, and installs the XP processing + skill-check systems on
    /// [`Update`].
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
}

#[cfg(feature = "bevy")]
pub use plugin::BevySkillsPlugin;
