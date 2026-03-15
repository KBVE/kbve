//! # bevy_mapdb
//!
//! Proto-driven map definitions for Bevy games.
//!
//! This crate compiles `mapdb.proto` into typed Rust structs via `prost` and
//! wraps them in a searchable [`MapDb`] Bevy resource. It is game-agnostic —
//! any game can load the same proto map registry and query zones, regions,
//! and world object definitions by slug, ULID, biome, or type.
//!
//! ## Loading from JSON
//!
//! ```rust,ignore
//! use bevy::prelude::*;
//! use bevy_mapdb::{BevyMapDbPlugin, MapDb};
//!
//! fn load_maps(mut commands: Commands) {
//!     let json = include_str!("path/to/mapdb.json");
//!     let db = MapDb::from_json(json).expect("Failed to parse map JSON");
//!     commands.insert_resource(db);
//! }
//! ```
//!
//! ## Loading from proto binary
//!
//! ```rust,ignore
//! let bytes = include_bytes!("path/to/maps.binpb");
//! let db = MapDb::from_bytes(bytes).expect("Failed to decode map registry");
//! ```

mod proto;
mod registry;

// Re-export all proto-generated map types
pub use proto::map::*;

// Re-export registry types
pub use registry::{MapDb, ProtoMapId};

use bevy::prelude::*;

/// Bevy plugin that registers the [`MapDb`] resource.
///
/// The resource is initialized empty. Games should populate it during
/// startup by calling [`MapDb::from_json`], [`MapDb::from_bytes`],
/// or [`MapDb::from_proto`] and inserting it via [`Commands::insert_resource`].
pub struct BevyMapDbPlugin;

impl Plugin for BevyMapDbPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<MapDb>();
    }
}
