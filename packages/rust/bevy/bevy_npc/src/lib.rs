//! # bevy_npc
//!
//! Agnostic Bevy NPC plugin — data-driven NPC definitions, registry, and ECS
//! components based on the `npcdb.proto` schema.
//!
//! ## Quick start
//!
//! ```rust,ignore
//! use bevy::prelude::*;
//! use bevy_npc::{NpcPlugin, NpcRegistry, NpcDef, NpcSlug};
//!
//! fn main() {
//!     App::new()
//!         .add_plugins(NpcPlugin)
//!         .add_systems(Startup, load_npcs)
//!         .run();
//! }
//!
//! fn load_npcs(mut registry: ResMut<NpcRegistry>) {
//!     // Load from JSON, database, or proto — then insert:
//!     // registry.insert(npc_def);
//! }
//! ```

pub mod component;
pub mod plugin;
pub mod registry;
pub mod types;

pub use component::{
    NpcBundle, NpcCombatRank, NpcCombatStats, NpcId, NpcLevel, NpcName, NpcSlug, NpcTypeFlags,
};
pub use plugin::NpcPlugin;
pub use registry::NpcRegistry;
pub use types::*;
