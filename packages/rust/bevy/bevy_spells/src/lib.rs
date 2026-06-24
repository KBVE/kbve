//! # bevy_spells
//!
//! Proto-driven spell definitions for Bevy games.
//!
//! Compiles `spelldb.proto` into typed Rust structs via `prost` and wraps them
//! in a searchable [`SpellDb`] Bevy resource. Game-agnostic — any game loads the
//! same proto spell registry and queries it by ref, ULID, school, or rarity.
//!
//! ## Loading from proto binary
//!
//! ```rust,ignore
//! let bytes = include_bytes!("path/to/spelldb-data.binpb");
//! let db = SpellDb::from_bytes(bytes).expect("Failed to decode spell registry");
//! ```

mod proto;
mod registry;

// Re-export all proto-generated spell types
pub use proto::spell::*;

// Re-export registry types
pub use registry::{ProtoSpellId, SpellDb};

use bevy::prelude::*;

/// Bevy plugin that registers the [`SpellDb`] resource.
///
/// The resource is initialized empty. Games populate it during startup via
/// [`SpellDb::from_bytes`] or [`SpellDb::from_proto`] and insert it with
/// [`Commands::insert_resource`].
pub struct BevySpellsPlugin;

impl Plugin for BevySpellsPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<SpellDb>();
    }
}
