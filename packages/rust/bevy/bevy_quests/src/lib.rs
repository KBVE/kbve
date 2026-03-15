//! # bevy_quests
//!
//! Proto-driven quest definitions for Bevy games.
//!
//! This crate compiles `questdb.proto` into typed Rust structs via `prost` and
//! wraps them in a searchable [`QuestDb`] Bevy resource. It is game-agnostic —
//! any game can load the same proto quest registry and query it by slug, ULID,
//! category, or tags.
//!
//! ## Loading from Astro JSON
//!
//! ```rust,ignore
//! use bevy::prelude::*;
//! use bevy_quests::{BevyQuestsPlugin, QuestDb};
//!
//! fn load_quests(mut commands: Commands) {
//!     let json = include_str!("path/to/questdb.json");
//!     let db = QuestDb::from_json(json).expect("Failed to parse quest JSON");
//!     commands.insert_resource(db);
//! }
//! ```
//!
//! ## Loading from proto binary
//!
//! ```rust,ignore
//! let bytes = include_bytes!("path/to/quests.binpb");
//! let db = QuestDb::from_bytes(bytes).expect("Failed to decode quest registry");
//! ```

pub mod json;
mod proto;
mod registry;

// Re-export all proto-generated quest types
pub use proto::quest::*;

// Re-export registry types
pub use registry::{ProtoQuestId, QuestDb};

use bevy::prelude::*;

/// Bevy plugin that registers the [`QuestDb`] resource.
///
/// The resource is initialized empty. Games should populate it during
/// startup by calling [`QuestDb::from_json`], [`QuestDb::from_bytes`],
/// or [`QuestDb::from_proto`] and inserting it via [`Commands::insert_resource`].
pub struct BevyQuestsPlugin;

impl Plugin for BevyQuestsPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<QuestDb>();
    }
}
