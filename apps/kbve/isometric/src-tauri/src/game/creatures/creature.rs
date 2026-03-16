//! Unified creature types for the NpcDb-driven creature system.
//!
//! All ambient creatures (fireflies, butterflies, frogs, and future types)
//! share a common [`Creature`] component for pool management and chunk-based
//! deterministic placement. Render-specific data lives in companion components
//! ([`EmissiveData`], [`BillboardData`], [`SpriteData`]) selected by [`RenderKind`].
//!
//! The [`CreatureRegistry`] bridges the game-agnostic `NpcDb` proto definitions
//! to isometric-game-specific spawn and render configuration.

use std::collections::HashMap;

use bevy::prelude::*;
use bevy_npc::{self as npc_types, NpcDb, ProtoNpcId};

use super::common::hash_f32;

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

/// Current lifecycle state of a creature entity in the pool.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub enum CreatureState {
    /// In the pool, not assigned to a world slot. Hidden.
    #[default]
    Pooled,
    /// Assigned to a deterministic world slot. Visible (subject to time-of-day).
    Active,
    /// Captured by a player. Slot is blocked across all clients.
    Captured,
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
// Core component — shared by ALL creature types
// ---------------------------------------------------------------------------

/// Unified creature component for NpcDb-driven ambient creatures.
///
/// Contains shared pool/slot data. Render-specific state lives in companion
/// components ([`EmissiveData`], [`BillboardData`], [`SpriteData`]).
#[derive(Component)]
pub struct Creature {
    /// NPC definition ID from NpcDb.
    pub npc_id: ProtoNpcId,
    /// How this creature is rendered (selects which animate system runs).
    pub render_kind: RenderKind,
    /// Current lifecycle state.
    pub state: CreatureState,
    /// Deterministic seed for this entity's current slot assignment.
    pub slot_seed: u32,
    /// Currently assigned chunk slot `(chunk_x, chunk_z, local_idx)`.
    pub assigned_slot: Option<(i32, i32, u16)>,
    /// World-space anchor position derived from the slot seed.
    pub anchor: Vec3,
    /// Phase offset for animation variety (derived from slot_seed).
    pub phase: f32,
    /// Material handle for per-entity visual updates.
    pub mat_handle: Handle<StandardMaterial>,
}

// ---------------------------------------------------------------------------
// Render-specific companion components
// ---------------------------------------------------------------------------

/// Emissive render data (firefly-style: glow sphere + point light).
#[derive(Component)]
pub struct EmissiveData {
    pub light_entity: Entity,
    pub glow_phase: f32,
    pub glow_period: f32,
    pub orbit_radius: f32,
    pub orbit_speed: f32,
}

/// Billboard render data (butterfly-style: mesh billboard + wing flap).
#[derive(Component)]
pub struct BillboardData {
    pub flap_speed: f32,
    pub size_scale: f32,
    pub wander_speed: f32,
    pub wander_radius: f32,
    pub flight_state: BillboardFlightState,
    pub idle_cooldown: f32,
}

/// Billboard creature flight state machine.
#[derive(Clone, Copy, PartialEq, Default)]
pub enum BillboardFlightState {
    #[default]
    Idle,
    Entering {
        origin: Vec3,
        target: Vec3,
        progress: f32,
    },
    Active,
    Exiting {
        start: Vec3,
        direction: Vec3,
        progress: f32,
    },
}

/// Sprite render data (frog-style: sprite sheet UV animation + hop arcs).
#[derive(Component)]
pub struct SpriteData {
    pub frame_timer: f32,
    pub frame_duration: f32,
    pub current_frame: u32,
    pub anim_row: u32,
    pub anim_frames: u32,
    pub facing_left: bool,
    pub hop_state: SpriteHopState,
}

/// Sprite creature hop/idle state machine.
#[derive(Clone, Copy, PartialEq)]
pub enum SpriteHopState {
    Idle {
        timer: f32,
    },
    Emote {
        remaining_frames: u32,
    },
    JumpWindup {
        target: Vec3,
    },
    Airborne {
        start: Vec3,
        target: Vec3,
        progress: f32,
    },
    Landing {
        timer: f32,
    },
}

impl Default for SpriteHopState {
    fn default() -> Self {
        Self::Idle { timer: 3.0 }
    }
}

// ---------------------------------------------------------------------------
// Per-NPC game config (isometric-specific, not in proto)
// ---------------------------------------------------------------------------

/// Isometric-game-specific spawn and render configuration for an NPC.
/// This bridges the game-agnostic NpcDb to the game's rendering pipeline.
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

/// Bevy resource bridging the game-agnostic `NpcDb` to isometric-game rendering.
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
/// rarity, stats, spawn rules) plus an isometric-game config (render kind,
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

/// Apply slot-derived animation parameters to shared creature fields.
pub fn apply_slot_base(creature: &mut Creature, seed: u32, anchor: Vec3, slot: (i32, i32, u16)) {
    creature.slot_seed = seed;
    creature.anchor = anchor;
    creature.phase = hash_f32(seed.wrapping_mul(7).wrapping_add(1));
    creature.assigned_slot = Some(slot);
    creature.state = CreatureState::Active;
}

/// Apply slot-derived params to emissive render data.
pub fn apply_slot_emissive(data: &mut EmissiveData, seed: u32) {
    data.glow_period = 2.0 + hash_f32(seed.wrapping_mul(13).wrapping_add(3)) * 3.0;
    data.orbit_radius = 0.4 + hash_f32(seed.wrapping_mul(19).wrapping_add(5)) * 0.8;
    data.orbit_speed = 0.6 + hash_f32(seed.wrapping_mul(23).wrapping_add(7)) * 0.8;
    data.glow_phase = hash_f32(seed.wrapping_mul(7).wrapping_add(1));
}
