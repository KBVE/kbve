//! # bevy_spells
//!
//! Proto-driven spell definitions for Bevy games.
//!
//! Wraps the generated spell types in a searchable [`SpellDb`] Bevy resource.
//! Game-agnostic — any game loads the same registry and queries it by ref,
//! ULID, school, or rarity. The types come from `packages/proto` via
//! `kbve-proto`; this crate no longer generates any.
//!
//! ## Loading from proto binary
//!
//! ```rust,ignore
//! let bytes = include_bytes!("path/to/spelldb-data.binpb");
//! let db = SpellDb::from_bytes(bytes).expect("Failed to decode spell registry");
//! ```

mod proto;
mod registry;

// Re-export the spell types, and the shared enums a spell is described with.
pub use proto::spell::*;
pub use proto::{Element, Rarity};

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
