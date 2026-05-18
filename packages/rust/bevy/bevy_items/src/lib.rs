//! # bevy_items
//!
//! Proto-driven item definitions for Bevy games.
//!
//! This crate compiles `itemdb.proto` into typed Rust structs via `prost` and
//! wraps them in a searchable [`ItemDb`] Bevy resource. It is game-agnostic —
//! any game can load the same proto item registry and query it by slug, ULID,
//! type flags, or rarity.
//!
//! ## Loading from Astro JSON
//!
//! ```rust,ignore
//! use bevy::prelude::*;
//! use bevy_items::{BevyItemsPlugin, ItemDb};
//!
//! fn load_items(mut commands: Commands) {
//!     let json = include_str!("path/to/itemdb.json");
//!     let db = ItemDb::from_json(json).expect("Failed to parse item JSON");
//!     commands.insert_resource(db);
//! }
//! ```
//!
//! ## Loading from proto binary
//!
//! ```rust,ignore
//! let bytes = include_bytes!("path/to/items.binpb");
//! let db = ItemDb::from_bytes(bytes).expect("Failed to decode item registry");
//! ```

#[cfg(feature = "inventory")]
pub mod inventory_adapter;
pub mod json;
mod proto;
mod registry;

// Re-export all proto-generated item types
pub use proto::item::*;

// Re-export registry types
pub use registry::{ItemDb, ProtoItemId};

/// Map a proto [`SkillingType`] enum to the matching `bevy_skills` skill ref
/// string (the same slugs used in the SkillRegistry on both client and server).
/// Returns `None` for [`SkillingType::SkillingUnspecified`] so callers can
/// short-circuit gate logic without a fake fallback.
pub fn skilling_type_to_skill_ref(skilling: SkillingType) -> Option<&'static str> {
    match skilling {
        SkillingType::SkillingUnspecified => None,
        SkillingType::SkillingCooking => Some("cooking"),
        SkillingType::SkillingSmithing => Some("smithing"),
        SkillingType::SkillingCrafting => Some("crafting"),
        SkillingType::SkillingAlchemy => Some("alchemy"),
        SkillingType::SkillingWoodcutting => Some("woodcutting"),
        SkillingType::SkillingMining => Some("mining"),
        SkillingType::SkillingFishing => Some("fishing"),
        SkillingType::SkillingFarming => Some("farming"),
        SkillingType::SkillingHerblore => Some("herblore"),
        SkillingType::SkillingFletching => Some("fletching"),
        SkillingType::SkillingHunting => Some("hunting"),
        SkillingType::SkillingForaging => Some("foraging"),
        SkillingType::SkillingEnchanting => Some("enchanting"),
        SkillingType::SkillingTailoring => Some("tailoring"),
        SkillingType::SkillingConstruction => Some("construction"),
    }
}

use bevy::prelude::*;

/// Bevy plugin that registers the [`ItemDb`] resource.
///
/// The resource is initialized empty. Games should populate it during
/// startup by calling [`ItemDb::from_json`], [`ItemDb::from_bytes`],
/// or [`ItemDb::from_proto`] and inserting it via [`Commands::insert_resource`].
pub struct BevyItemsPlugin;

impl Plugin for BevyItemsPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<ItemDb>();
    }
}
