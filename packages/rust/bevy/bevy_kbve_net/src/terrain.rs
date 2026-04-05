//! Shared terrain height functions — deterministic, zero-dependency, WASM-safe.
//!
//! Both client and server use these to compute terrain heights for creature
//! simulation, spawn placement, and physics snapping.

use bevy::prelude::*;
use std::collections::HashMap;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

pub const MAX_HEIGHT: f32 = 6.0;
pub const NOISE_SCALE: f32 = 6.0;
pub const TERRAIN_SEED: u32 = 42;

// ---------------------------------------------------------------------------
// Noise functions (zero deps, WASM-safe, deterministic)
// ---------------------------------------------------------------------------

/// Deterministic hash of two integers to a float in [0.0, 1.0).
#[inline(always)]
pub fn hash2d(x: i32, z: i32) -> f32 {
    let mut h = (x.wrapping_mul(374761393)) ^ (z.wrapping_mul(668265263));
    h = (h ^ (h >> 13)).wrapping_mul(1274126177);
    h = h ^ (h >> 16);
    (h as u32 as f32) / (u32::MAX as f32)
}

/// Bilinear interpolation of hashed corner values with smoothstep.
#[inline(always)]
fn value_noise(x: f32, z: f32) -> f32 {
    let ix = x.floor() as i32;
    let iz = z.floor() as i32;
    let fx = x - x.floor();
    let fz = z - z.floor();

    // Smoothstep
    let sx = fx * fx * (3.0 - 2.0 * fx);
    let sz = fz * fz * (3.0 - 2.0 * fz);

    let v00 = hash2d(ix, iz);
    let v10 = hash2d(ix + 1, iz);
    let v01 = hash2d(ix, iz + 1);
    let v11 = hash2d(ix + 1, iz + 1);

    let a = v00 + sx * (v10 - v00);
    let b = v01 + sx * (v11 - v01);
    a + sz * (b - a)
}

/// Two-octave layered noise producing heights in [0, max_height], quantized to integers.
#[inline(always)]
pub fn terrain_height(x: i32, z: i32, seed: u32, max_height: f32, scale: f32) -> f32 {
    let fx = (x as f32 + seed as f32 * 0.7321) / scale;
    let fz = (z as f32 + seed as f32 * 0.3179) / scale;

    let n1 = value_noise(fx, fz);
    let n2 = value_noise(fx * 2.0, fz * 2.0);

    let raw = n1 * 0.7 + n2 * 0.3;
    (raw * max_height).round()
}

// ---------------------------------------------------------------------------
// TerrainMap resource — lightweight height cache for simulation
// ---------------------------------------------------------------------------

/// Shared terrain height cache used by creature simulation on both client
/// and server. Computes heights on-demand and caches them.
///
/// This is intentionally simpler than the client's full `TerrainMap` which
/// also tracks chunk entities, spawn queues, and despawn lists.
#[derive(Resource)]
pub struct TerrainMap {
    pub seed: u32,
    pub max_height: f32,
    pub scale: f32,
    cache: HashMap<(i32, i32), f32>,
}

impl TerrainMap {
    pub fn new(seed: u32) -> Self {
        Self {
            seed,
            max_height: MAX_HEIGHT,
            scale: NOISE_SCALE,
            cache: HashMap::new(),
        }
    }

    /// Get the height at a tile coordinate. Computes and caches on first access.
    pub fn height_at(&mut self, x: i32, z: i32) -> f32 {
        *self
            .cache
            .entry((x, z))
            .or_insert_with(|| terrain_height(x, z, self.seed, self.max_height, self.scale))
    }

    /// Get height at a world position (rounds to nearest tile).
    pub fn height_at_world(&mut self, wx: f32, wz: f32) -> f32 {
        let tx = wx.round() as i32;
        let tz = wz.round() as i32;
        self.height_at(tx, tz)
    }

    /// Read-only height lookup (returns 0 if not yet cached).
    pub fn height_at_loaded(&self, x: i32, z: i32) -> f32 {
        self.cache.get(&(x, z)).copied().unwrap_or(0.0)
    }
}

impl Default for TerrainMap {
    fn default() -> Self {
        Self::new(TERRAIN_SEED)
    }
}
