//! Unified creature types for the NpcDb-driven creature system.
//!
//! Shared types (registry, config, slot helpers) live in `bevy_kbve_net::npcdb`
//! so both client and server use the same definitions. This module re-exports
//! those and adds client-only ECS components for rendering.

use bevy::prelude::*;

// Re-export shared types from bevy_kbve_net::npcdb so existing imports work.
pub use bevy_kbve_net::npcdb::{
    self, CreatureConfig, CreatureRegistry, ProtoNpcId, RenderKind, TimeSchedule,
    build_creature_registry, hash_f32, slot_active, slot_anchor, slot_seed,
};

// Re-export game-agnostic creature types from bevy_npc::creature.
pub use bevy_kbve_net::npcdb::creature::{CapturedCreatures, CreatureCaptureEvent};

// Re-export shared creature types from bevy_kbve_net::creatures
// (used by generic sprite system).
pub use bevy_kbve_net::creatures::types::CreaturePoolIndex;
pub use bevy_kbve_net::creatures::types::CreatureState;

// ---------------------------------------------------------------------------
// Client-only creature component (butterfly/firefly legacy systems)
// ---------------------------------------------------------------------------

/// Client-only creature component for non-sprite creature types (firefly, butterfly).
/// Generic sprite creatures use `bevy_kbve_net::creatures::types::Creature` instead.
#[derive(Component)]
pub struct ClientCreature {
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
// Render-specific companion components (client-only)
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

// ---------------------------------------------------------------------------
// Client-only slot helpers (depend on ECS components)
// ---------------------------------------------------------------------------

/// Apply slot-derived animation parameters to shared creature fields.
pub fn apply_slot_base(
    creature: &mut ClientCreature,
    seed: u32,
    anchor: Vec3,
    slot: (i32, i32, u16),
) {
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
