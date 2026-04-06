//! Shared types for ambient (non-sprite) creatures: fireflies and butterflies.
//!
//! These run on both client and server. Render-specific data (mesh, material,
//! PointLight) stays client-only.

use bevy::prelude::*;
use std::collections::HashSet;

use super::common::hash_f32;

// ---------------------------------------------------------------------------
// Marker
// ---------------------------------------------------------------------------

/// Marker component for ambient creatures (fireflies, butterflies).
/// Analogous to `SpriteCreatureMarker` for sprite creatures.
#[derive(Component)]
pub struct AmbientCreatureMarker {
    pub type_key: &'static str,
}

// ---------------------------------------------------------------------------
// Firefly simulation state (headless — no light_entity, no mat_handle)
// ---------------------------------------------------------------------------

/// Headless firefly state: orbital motion + glow phase.
/// Client attaches PointLight and StandardMaterial on top.
#[derive(Component)]
pub struct FireflySimState {
    pub glow_phase: f32,
    pub glow_period: f32,
    pub orbit_radius: f32,
    pub orbit_speed: f32,
}

impl FireflySimState {
    /// Derive sim state from a deterministic slot seed.
    pub fn from_seed(seed: u32) -> Self {
        Self {
            glow_phase: hash_f32(seed.wrapping_mul(7).wrapping_add(1)),
            glow_period: 2.0 + hash_f32(seed.wrapping_mul(13).wrapping_add(3)) * 3.0,
            orbit_radius: 0.4 + hash_f32(seed.wrapping_mul(19).wrapping_add(5)) * 0.8,
            orbit_speed: 0.6 + hash_f32(seed.wrapping_mul(23).wrapping_add(7)) * 0.8,
        }
    }
}

// ---------------------------------------------------------------------------
// Butterfly simulation state (headless — no billboard facing, no material)
// ---------------------------------------------------------------------------

/// Headless butterfly state: flight state machine + animation params.
/// Client attaches wing mesh, billboard facing, and material alpha on top.
#[derive(Component)]
pub struct ButterflySimState {
    pub flap_speed: f32,
    pub size_scale: f32,
    pub wander_speed: f32,
    pub wander_radius: f32,
    pub flight_state: ButterflyFlightState,
    pub idle_cooldown: f32,
}

impl ButterflySimState {
    /// Derive sim state from a deterministic seed.
    pub fn from_seed(seed: u32) -> Self {
        Self {
            flap_speed: 6.0 + hash_f32(seed * 37 + 7) * 4.0,
            size_scale: 0.7 + hash_f32(seed * 41 + 9) * 0.6,
            wander_speed: 0.3 + hash_f32(seed * 17 + 3) * 0.4,
            wander_radius: 0.8 + hash_f32(seed * 29 + 5) * 1.2,
            flight_state: ButterflyFlightState::Idle,
            idle_cooldown: hash_f32(seed * 53 + 11) * 3.0,
        }
    }
}

/// Butterfly flight state machine — runs identically on client and server.
#[derive(Clone, Copy, PartialEq)]
pub enum ButterflyFlightState {
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
// Resources
// ---------------------------------------------------------------------------

/// Tracks active firefly slot assignments and the last-seen creature_seed.
#[derive(Resource, Default)]
pub struct FireflySlotState {
    pub active_slots: HashSet<(i32, i32, u16)>,
    pub last_seed: u64,
}

/// Pool tracking for ambient creatures (analogous to SpriteAtlasPool).
#[derive(Resource, Default)]
pub struct AmbientCreaturePool {
    pub fireflies_spawned: bool,
    pub butterflies_spawned: bool,
}
