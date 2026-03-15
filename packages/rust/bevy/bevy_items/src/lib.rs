//! # bevy_items
//!
//! Proto-driven item definitions for Bevy games.
//!
//! This crate compiles `itemdb.proto` into typed Rust structs via `prost` and
//! wraps them in a searchable [`ItemDb`] Bevy resource. It is game-agnostic —
//! any game can load the same proto item registry and query it by slug, ULID,
//! type flags, or rarity.
//!
//! ## Usage
//!
//! ```rust,ignore
//! use bevy::prelude::*;
//! use bevy_items::{BevyItemsPlugin, ItemDb, ItemRegistry};
//!
//! fn main() {
//!     App::new()
//!         .add_plugins(BevyItemsPlugin)
//!         .add_systems(Startup, load_items)
//!         .run();
//! }
//!
//! fn load_items(mut commands: Commands) {
//!     let bytes = include_bytes!("path/to/items.binpb");
//!     let db = ItemDb::from_bytes(bytes).expect("Failed to decode item registry");
//!     commands.insert_resource(db);
//! }
//! ```

mod proto;
mod registry;

// Re-export all proto-generated item types
pub use proto::item::*;

// Re-export registry types
pub use registry::{ItemDb, ProtoItemId};

use bevy::prelude::*;

/// Bevy plugin that registers the [`ItemDb`] resource.
///
/// The resource is initialized empty. Games should populate it during
/// startup by calling [`ItemDb::from_bytes`] or [`ItemDb::from_proto`]
/// and inserting it via [`Commands::insert_resource`].
pub struct BevyItemsPlugin;

impl Plugin for BevyItemsPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<ItemDb>();
    }
}
