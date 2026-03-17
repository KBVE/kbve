//! NpcDb-driven creature registry and deterministic placement helpers.
//!
//! Available when the `npcdb` feature is enabled. Provides the shared
//! [`CreatureRegistry`] used by both the isometric game client and the
//! axum-kbve game server for creature spawning, validation, and capture.

use std::collections::HashMap;

use bevy::prelude::*;
// Re-export bevy_npc types so downstream crates don't need a direct dep.
pub use bevy_npc;
pub use bevy_npc::ProtoNpcId;
// Re-export creature module (game-agnostic ECS components).
pub use bevy_npc::creature;

use bevy_npc::{self as npc_types, NpcDb};

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/// How this creature is rendered in the isometric game.
/// Each variant maps to a specific animate system.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum RenderKind {
    /// Emissive sphere + glow pulse + point light + orbital motion (firefly).
    Emissive,
    /// Mesh billboard + wing flap + flutter offset (butterfly).
    Billboard,
    /// Sprite sheet + UV frame animation + hop arcs (frog).
    Sprite,
}

/// When this creature type is visible.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum TimeSchedule {
    /// Visible when `night_factor(hour) > 0` (roughly 19:00–05:30).
    Night,
    /// Visible when `day_factor(hour) > 0` (roughly 07:00–18:00).
    Day,
    /// Always visible regardless of time.
    Always,
}

// ---------------------------------------------------------------------------
// Per-NPC game config
// ---------------------------------------------------------------------------

/// Game-specific spawn and render configuration for an NPC.
/// Bridges the game-agnostic NpcDb to the game's rendering pipeline.
#[derive(Clone, Debug)]
pub struct CreatureConfig {
    /// Which render pipeline to use.
    pub render_kind: RenderKind,
    /// Maximum number of pooled entities for this creature type.
    pub pool_size: usize,
    /// World-space chunk size for deterministic placement.
    pub chunk_size: f32,
    /// Potential spawn slots per chunk.
    pub per_chunk: usize,
    /// Fraction of slots that contain a creature (stochastic thinning).
    pub spawn_chance: f32,
    /// When this creature is active (day/night/always).
    pub schedule: TimeSchedule,
}

// ---------------------------------------------------------------------------
// Creature Registry — NpcDb + game-specific configs
// ---------------------------------------------------------------------------

/// Bevy resource bridging the game-agnostic `NpcDb` to game rendering.
///
/// Populated at startup with creature definitions + game-specific configs.
/// Systems read this to know how to spawn, assign, and animate each creature type.
#[derive(Resource)]
pub struct CreatureRegistry {
    /// The NPC database with proto-defined creature data.
    pub npc_db: NpcDb,
    /// Game-specific config per NPC, keyed by ProtoNpcId.
    pub configs: HashMap<ProtoNpcId, CreatureConfig>,
    /// Ordered list of creature NPC IDs for deterministic iteration.
    pub creature_ids: Vec<ProtoNpcId>,
}

impl Default for CreatureRegistry {
    fn default() -> Self {
        Self {
            npc_db: NpcDb::default(),
            configs: HashMap::new(),
            creature_ids: Vec::new(),
        }
    }
}

impl CreatureRegistry {
    /// Register a creature NPC with its game-specific config.
    pub fn register(&mut self, npc: npc_types::Npc, config: CreatureConfig) {
        let id = ProtoNpcId::from_ref(&npc.r#ref);
        self.configs.insert(id, config);
        self.creature_ids.push(id);
        self.npc_db.insert(npc);
    }

    /// Get the game config for a creature by NPC ref.
    pub fn config_by_ref(&self, npc_ref: &str) -> Option<&CreatureConfig> {
        let id = self.npc_db.id_for_ref(npc_ref)?;
        self.configs.get(&id)
    }

    /// Get the game config for a creature by ID.
    pub fn config(&self, id: ProtoNpcId) -> Option<&CreatureConfig> {
        self.configs.get(&id)
    }

    /// Iterate all registered creatures with their NPC data and config.
    pub fn iter_creatures(
        &self,
    ) -> impl Iterator<Item = (ProtoNpcId, &npc_types::Npc, &CreatureConfig)> {
        self.creature_ids.iter().filter_map(move |&id| {
            let npc = self.npc_db.get(id)?;
            let config = self.configs.get(&id)?;
            Some((id, npc, config))
        })
    }
}

// ---------------------------------------------------------------------------
// Builder — populates the registry with creature definitions
// ---------------------------------------------------------------------------

/// Build the creature registry with all known ambient creature types.
///
/// Each creature gets a proto NPC entry (game-agnostic data: name, family,
/// rarity, stats, spawn rules) plus a game-specific config (render kind,
/// pool size, chunk parameters).
pub fn build_creature_registry() -> CreatureRegistry {
    let mut registry = CreatureRegistry::default();

    // --- Meadow Firefly ---
    registry.register(
        npc_types::Npc {
            r#ref: "meadow-firefly".into(),
            name: "Meadow Firefly".into(),
            family: npc_types::CreatureFamily::Spirit as i32,
            rarity: npc_types::NpcRarity::Common as i32,
            level: 1,
            stats: Some(npc_types::NpcStats {
                hp: 1,
                max_hp: 1,
                speed: 3,
                ..Default::default()
            }),
            spawn_rules: vec![npc_types::SpawnRule {
                zone: Some("grassland".into()),
                spawn_weight: 0.55,
                ..Default::default()
            }],
            spatial: Some(npc_types::SpatialProperties {
                walk_speed: Some(0.7),
                can_fly: Some(true),
                ..Default::default()
            }),
            behavior: Some(npc_types::BehaviorTraits {
                wander_radius: Some(12.0),
                ..Default::default()
            }),
            interaction: Some(npc_types::InteractionFlags {
                is_interactable: Some(true),
                is_targetable: Some(true),
                ..Default::default()
            }),
            phase_rules: vec![npc_types::PhaseRule {
                time_start: Some(1900),
                time_end: Some(530),
                ..Default::default()
            }],
            ..Default::default()
        },
        CreatureConfig {
            render_kind: RenderKind::Emissive,
            pool_size: 80,
            chunk_size: 12.0,
            per_chunk: 3,
            spawn_chance: 0.55,
            schedule: TimeSchedule::Night,
        },
    );

    // --- Woodland Butterfly ---
    registry.register(
        npc_types::Npc {
            r#ref: "woodland-butterfly".into(),
            name: "Woodland Butterfly".into(),
            family: npc_types::CreatureFamily::Beast as i32,
            rarity: npc_types::NpcRarity::Common as i32,
            level: 1,
            stats: Some(npc_types::NpcStats {
                hp: 1,
                max_hp: 1,
                speed: 2,
                ..Default::default()
            }),
            spawn_rules: vec![npc_types::SpawnRule {
                zone: Some("grassland".into()),
                spawn_weight: 1.0,
                ..Default::default()
            }],
            spatial: Some(npc_types::SpatialProperties {
                walk_speed: Some(0.35),
                can_fly: Some(true),
                ..Default::default()
            }),
            behavior: Some(npc_types::BehaviorTraits {
                wander_radius: Some(1.4),
                ..Default::default()
            }),
            interaction: Some(npc_types::InteractionFlags {
                is_interactable: Some(true),
                is_targetable: Some(true),
                ..Default::default()
            }),
            phase_rules: vec![npc_types::PhaseRule {
                time_start: Some(700),
                time_end: Some(1800),
                ..Default::default()
            }],
            ..Default::default()
        },
        CreatureConfig {
            render_kind: RenderKind::Billboard,
            pool_size: 14,
            chunk_size: 16.0,
            per_chunk: 2,
            spawn_chance: 0.45,
            schedule: TimeSchedule::Day,
        },
    );

    // --- Green Toad ---
    registry.register(
        npc_types::Npc {
            r#ref: "green-toad".into(),
            name: "Green Toad".into(),
            family: npc_types::CreatureFamily::Beast as i32,
            rarity: npc_types::NpcRarity::Common as i32,
            level: 1,
            stats: Some(npc_types::NpcStats {
                hp: 3,
                max_hp: 3,
                speed: 1,
                ..Default::default()
            }),
            spawn_rules: vec![npc_types::SpawnRule {
                zone: Some("grassland".into()),
                spawn_weight: 1.0,
                ..Default::default()
            }],
            spatial: Some(npc_types::SpatialProperties {
                walk_speed: Some(2.0),
                ..Default::default()
            }),
            behavior: Some(npc_types::BehaviorTraits {
                wander_radius: Some(2.0),
                ..Default::default()
            }),
            interaction: Some(npc_types::InteractionFlags {
                is_interactable: Some(true),
                is_targetable: Some(true),
                ..Default::default()
            }),
            phase_rules: vec![npc_types::PhaseRule {
                time_start: Some(700),
                time_end: Some(1800),
                ..Default::default()
            }],
            ..Default::default()
        },
        CreatureConfig {
            render_kind: RenderKind::Sprite,
            pool_size: 8,
            chunk_size: 16.0,
            per_chunk: 1,
            spawn_chance: 0.35,
            schedule: TimeSchedule::Day,
        },
    );

    registry
}

// ---------------------------------------------------------------------------
// Slot helpers — shared deterministic placement logic
// ---------------------------------------------------------------------------

/// Simple hash → f32 in [0, 1) for deterministic variety.
pub fn hash_f32(seed: u32) -> f32 {
    let mut x = seed;
    x ^= x >> 16;
    x = x.wrapping_mul(0x45d9f3b);
    x ^= x >> 16;
    (x & 0xFFFF) as f32 / 65535.0
}

/// Combine creature_seed with chunk coordinates and local index into a u32 seed.
pub fn slot_seed(creature_seed: u64, cx: i32, cz: i32, idx: u16) -> u32 {
    let mut h = (creature_seed as u32).wrapping_add(creature_seed.wrapping_shr(32) as u32);
    h = h.wrapping_mul(2654435761).wrapping_add(cx as u32);
    h = h.wrapping_mul(2246822519).wrapping_add(cz as u32);
    h = h.wrapping_mul(3266489917).wrapping_add(idx as u32);
    h ^= h >> 16;
    h
}

/// Compute deterministic world-space anchor for a chunk slot.
pub fn slot_anchor(seed: u32, cx: i32, cz: i32, chunk_size: f32) -> Vec3 {
    let x = cx as f32 * chunk_size + hash_f32(seed) * chunk_size;
    let z = cz as f32 * chunk_size + hash_f32(seed.wrapping_add(1)) * chunk_size;
    let y = 1.5 + hash_f32(seed.wrapping_add(2)) * 2.5;
    Vec3::new(x, y, z)
}

/// Stochastic thinning — not every slot produces a creature.
pub fn slot_active(seed: u32, spawn_chance: f32) -> bool {
    hash_f32(seed.wrapping_add(3)) < spawn_chance
}
