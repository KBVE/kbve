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
pub use bevy_kbve_net::npcdb::creature::{
    CapturedCreatures, CreatureCaptureEvent, CreaturePoolIndex, CreatureState,
};

// Re-export shared ambient simulation types from bevy_kbve_net.
pub use bevy_kbve_net::creatures::ambient_types::{
    AmbientCreatureMarker, ButterflyFlightState, ButterflySimState, FireflySimState,
    FireflySlotState,
};

// ---------------------------------------------------------------------------
// Core component — shared by ALL creature types (client-side ECS)
// ---------------------------------------------------------------------------

/// Unified creature component for NpcDb-driven ambient creatures.
///
/// Contains shared pool/slot data. Render-specific state lives in companion
/// components ([`AmbientRenderData`], [`FireflySimState`], [`ButterflySimState`], [`SpriteData`]).
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

/// Render-only data for ambient creatures (fireflies, butterflies).
/// Holds GPU resource handles that the shared simulation components don't carry.
#[derive(Component)]
pub struct AmbientRenderData {
    /// Material handle for per-entity visual updates (emissive glow, alpha blend).
    pub mat_handle: Handle<StandardMaterial>,
    /// PointLight entity for fireflies (None for butterflies).
    pub light_entity: Option<Entity>,
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
// Client-only slot helpers (depend on ECS components)
// ---------------------------------------------------------------------------

/// Apply slot-derived animation parameters to shared creature fields.
pub fn apply_slot_base(creature: &mut Creature, seed: u32, anchor: Vec3, slot: (i32, i32, u16)) {
    creature.slot_seed = seed;
    creature.anchor = anchor;
    creature.phase = hash_f32(seed.wrapping_mul(7).wrapping_add(1));
    creature.assigned_slot = Some(slot);
    creature.state = CreatureState::Active;
}
