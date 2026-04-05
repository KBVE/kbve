use bevy::prelude::*;

// Re-export shared helpers from bevy_kbve_net
pub use bevy_kbve_net::creatures::common::{
    GameTime, build_billboard_quad, day_factor, hash_f32, night_factor, patrol_seed, scene_center,
};

// ---------------------------------------------------------------------------
// Client-only resources
// ---------------------------------------------------------------------------

#[derive(Resource, Default)]
pub struct CreaturePool {
    pub fireflies_spawned: bool,
    pub butterflies_spawned: bool,
}

/// Pre-built mesh handles created once at Startup to avoid allocating
/// mesh assets during spawn systems.
#[derive(Resource)]
pub struct CreatureMeshes {
    pub firefly_sphere: Handle<Mesh>,
    pub butterfly_wings: Handle<Mesh>,
}

// ---------------------------------------------------------------------------
// Shared animation helpers (client-only)
// ---------------------------------------------------------------------------

/// Reusable flutter offset -- overlapping sine waves for erratic insect motion.
/// `amp` scales the overall amplitude (1.0 = full wander, 0.3 = subtle entry flutter).
pub fn flutter_offset(t: f32, phase: f32, speed: f32, radius: f32, amp: f32) -> Vec3 {
    let p = phase;
    let spd = speed;
    let r = radius * amp;
    let ox = (t * spd * 0.6 + p * 6.28).sin() * r
        + (t * spd * 1.7 + p * 2.1).sin() * r * 0.3
        + (t * spd * 3.1 + p * 4.5).cos() * r * 0.1;
    let oy = ((t * spd * 0.8 + p * 3.14).sin() * 0.25
        + (t * spd * 2.3 + p * 1.57).cos() * 0.12
        + (t * spd * 4.0 + p * 5.0).sin() * 0.06)
        * amp;
    let oz = (t * spd * 0.5 + p * 4.71).cos() * r
        + (t * spd * 1.9 + p * 3.3).cos() * r * 0.25
        + (t * spd * 2.8 + p * 0.7).sin() * r * 0.08;
    Vec3::new(ox, oy, oz)
}
