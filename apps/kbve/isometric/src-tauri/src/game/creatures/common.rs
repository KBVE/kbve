use bevy::prelude::*;

// ---------------------------------------------------------------------------
// Shared resource — tracks which creature types have been spawned.
// Add a new `bool` field here when adding a new creature type.
// ---------------------------------------------------------------------------

#[derive(Resource, Default)]
pub struct CreaturePool {
    pub fireflies_spawned: bool,
    pub butterflies_spawned: bool,
    pub frogs_spawned: bool,
}

// ---------------------------------------------------------------------------
// Game time — unified clock that defers to server when connected.
// Creature modules read this instead of DayCycle directly.
// ---------------------------------------------------------------------------

/// Canonical game time shared across all creature modules.
/// Updated each frame by the `sync_game_time` system in weather.rs.
#[derive(Resource)]
pub struct GameTime {
    /// Current game hour (0.0–24.0).
    pub hour: f32,
    /// Global creature seed — deterministic across all connected clients.
    pub creature_seed: u64,
}

impl Default for GameTime {
    fn default() -> Self {
        Self {
            hour: 10.0,
            creature_seed: 0,
        }
    }
}

// ---------------------------------------------------------------------------
// Deterministic pseudo-random (no deps, WASM-safe)
// ---------------------------------------------------------------------------

/// Simple hash → f32 in [0, 1) for deterministic variety per creature index.
pub fn hash_f32(seed: u32) -> f32 {
    let mut x = seed;
    x ^= x >> 16;
    x = x.wrapping_mul(0x45d9f3b);
    x ^= x >> 16;
    (x & 0xFFFF) as f32 / 65535.0
}

// ---------------------------------------------------------------------------
// Time-of-day visibility factors
// ---------------------------------------------------------------------------

/// Butterflies active during 7:00–18:00 with 1.5h fade.
const DAY_START: f32 = 7.0;
const DAY_END: f32 = 18.0;
const DAY_BAND: f32 = 1.5;

/// Fireflies appear when hour >= 19:00 or hour < 5:30.
const NIGHT_START: f32 = 19.0;
const NIGHT_END: f32 = 5.5;
const NIGHT_BAND: f32 = 1.5;

/// Daytime visibility factor: 0.0 at night, 1.0 during full day.
pub fn day_factor(hour: f32) -> f32 {
    if hour >= DAY_START && hour <= DAY_END {
        let fade_in = ((hour - DAY_START) / DAY_BAND).clamp(0.0, 1.0);
        let fade_out = ((DAY_END - hour) / DAY_BAND).clamp(0.0, 1.0);
        fade_in.min(fade_out)
    } else {
        0.0
    }
}

/// Nighttime visibility factor: 0.0 during day, 1.0 at full night.
pub fn night_factor(hour: f32) -> f32 {
    if hour >= NIGHT_START {
        ((hour - NIGHT_START) / NIGHT_BAND).clamp(0.0, 1.0)
    } else if hour < NIGHT_END {
        ((NIGHT_END - hour) / NIGHT_BAND).clamp(0.0, 1.0)
    } else {
        0.0
    }
}

// ---------------------------------------------------------------------------
// Shared animation helpers
// ---------------------------------------------------------------------------

/// Reusable flutter offset — overlapping sine waves for erratic insect motion.
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

/// Compute scene center from camera position (isometric offset convention).
pub fn scene_center(cam_pos: Vec3) -> Vec3 {
    Vec3::new(cam_pos.x - 15.0, 0.0, cam_pos.z - 15.0)
}
