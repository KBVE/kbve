use bevy::prelude::*;

use crate::types::{NpcRank, NpcStats};

/// Marker component linking an entity to an NPC definition by its ULID.
/// Use `NpcRegistry::get_by_id` to resolve the full definition.
#[derive(Component, Debug, Clone, Reflect)]
pub struct NpcId(pub String);

/// Marker component linking an entity to an NPC definition by slug.
/// Resolved against `NpcRegistry::get_by_slug` at spawn time.
#[derive(Component, Debug, Clone, Reflect)]
pub struct NpcSlug(pub String);

/// Runtime combat stats for an NPC entity instance.
/// Copied from `NpcDef.stats` at spawn and mutated during gameplay.
#[derive(Component, Debug, Clone, Reflect)]
pub struct NpcCombatStats(pub NpcStats);

/// The NPC's display name, copied from `NpcDef.name` at spawn.
#[derive(Component, Debug, Clone, Reflect)]
pub struct NpcName(pub String);

/// The NPC's level, copied from `NpcDef.level` at spawn.
#[derive(Component, Debug, Clone, Reflect)]
pub struct NpcLevel(pub i32);

/// The NPC's combat rank.
#[derive(Component, Debug, Clone, Reflect)]
pub struct NpcCombatRank(pub NpcRank);

/// Bitmask of `NpcTypeFlag` values for quick archetype checks.
#[derive(Component, Debug, Clone, Reflect)]
pub struct NpcTypeFlags(pub i32);

/// Bundle for spawning a minimal NPC entity with core components.
#[derive(Bundle)]
pub struct NpcBundle {
    pub id: NpcId,
    pub name: NpcName,
    pub level: NpcLevel,
    pub type_flags: NpcTypeFlags,
    pub rank: NpcCombatRank,
    pub stats: NpcCombatStats,
}
