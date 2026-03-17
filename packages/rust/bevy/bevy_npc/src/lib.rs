//! # bevy_npc
//!
//! Proto-driven NPC definitions for Bevy games.
//!
//! This crate compiles `npcdb.proto` into typed Rust structs via `prost` and
//! wraps them in a searchable [`NpcDb`] Bevy resource. It is game-agnostic —
//! any game can load the same proto NPC registry and query it by slug, ULID,
//! type flags, rarity, or creature family.
//!
//! ## Loading from JSON
//!
//! ```rust,ignore
//! use bevy::prelude::*;
//! use bevy_npc::{BevyNpcPlugin, NpcDb};
//!
//! fn load_npcs(mut commands: Commands) {
//!     let json = include_str!("path/to/npcdb.json");
//!     let db = NpcDb::from_json(json).expect("Failed to parse NPC JSON");
//!     commands.insert_resource(db);
//! }
//! ```
//!
//! ## Loading from proto binary
//!
//! ```rust,ignore
//! let bytes = include_bytes!("path/to/npcs.binpb");
//! let db = NpcDb::from_bytes(bytes).expect("Failed to decode NPC registry");
//! ```

mod proto;
mod registry;

#[cfg(feature = "creature")]
pub mod creature;

// Re-export all proto-generated NPC types
pub use proto::npc::*;

// Re-export registry types
pub use registry::{NpcDb, ProtoNpcId};

use bevy::prelude::*;

/// Bevy plugin that registers the [`NpcDb`] resource.
///
/// The resource is initialized empty. Games should populate it during
/// startup by calling [`NpcDb::from_json`], [`NpcDb::from_bytes`],
/// or [`NpcDb::from_proto`] and inserting it via [`Commands::insert_resource`].
pub struct BevyNpcPlugin;

impl Plugin for BevyNpcPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<NpcDb>();
    }
}
