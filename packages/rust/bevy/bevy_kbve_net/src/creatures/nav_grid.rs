//! Layer 1: NavGrid — per-tile walkability and traversal cost.
//!
//! Uses `DashMap` for lock-free concurrent read/write — background tasks insert
//! new chunks directly without cloning or merging. Both client and server produce
//! identical results from the same seed.

use std::sync::Arc;

use bevy::prelude::*;
use dashmap::DashMap;

use crate::terrain::{MAX_HEIGHT, NOISE_SCALE, TERRAIN_SEED, hash2d, terrain_height};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Tiles with height below this are water (impassable).
pub const WATER_LEVEL: f32 = 1.0;

/// Maximum height difference a creature can step between adjacent tiles.
pub const MAX_STEP_HEIGHT: f32 = 1.0;

/// Tiles per chunk side (matches terrain chunk size).
pub const NAV_CHUNK: i32 = 16;

// ---------------------------------------------------------------------------
// Terrain band classification
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum TerrainBand {
    Water,
    Grass,
    Dirt,
    Stone,
    Snow,
}

impl TerrainBand {
    /// Base traversal cost for entering a tile of this band.
    pub fn base_cost(self) -> f32 {
        match self {
            Self::Water => f32::MAX,
            Self::Grass => 1.0,
            Self::Dirt => 1.2,
            Self::Stone => 1.5,
            Self::Snow => 2.0,
        }
    }
}

/// Classify a terrain height into a band.
pub fn classify_band(h: f32) -> TerrainBand {
    if h < WATER_LEVEL {
        TerrainBand::Water
    } else if h <= 1.0 {
        TerrainBand::Grass
    } else if h <= 3.0 {
        TerrainBand::Dirt
    } else if h <= 5.0 {
        TerrainBand::Stone
    } else {
        TerrainBand::Snow
    }
}

// ---------------------------------------------------------------------------
// Per-tile navigation data
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug)]
pub struct TileNav {
    pub height: f32,
    pub band: TerrainBand,
    pub cost: f32,
    pub walkable: bool,
    pub has_tree: bool,
}

// ---------------------------------------------------------------------------
// Per-chunk navigation data (16×16 = 256 tiles)
// ---------------------------------------------------------------------------

#[derive(Clone)]
pub struct ChunkNav {
    pub tiles: [TileNav; 256],
}

impl ChunkNav {
    /// Generate nav data for a chunk. Pure function of seed + chunk coords.
    pub fn generate(cx: i32, cz: i32) -> Self {
        let mut tiles = [TileNav {
            height: 0.0,
            band: TerrainBand::Water,
            cost: f32::MAX,
            walkable: false,
            has_tree: false,
        }; 256];

        for lz in 0..NAV_CHUNK {
            for lx in 0..NAV_CHUNK {
                let tx = cx * NAV_CHUNK + lx;
                let tz = cz * NAV_CHUNK + lz;
                let h = terrain_height(tx, tz, TERRAIN_SEED, MAX_HEIGHT, NOISE_SCALE);
                let band = classify_band(h);
                let walkable = band != TerrainBand::Water;

                // Trees only spawn on grass band (matches tilemap.rs logic)
                let has_tree = band == TerrainBand::Grass && hash2d(tx + 11317, tz + 5471) < 0.055;

                let cost = if walkable {
                    band.base_cost() + if has_tree { 0.5 } else { 0.0 }
                } else {
                    f32::MAX
                };

                let idx = (lz * NAV_CHUNK + lx) as usize;
                tiles[idx] = TileNav {
                    height: h,
                    band,
                    cost,
                    walkable,
                    has_tree,
                };
            }
        }

        Self { tiles }
    }

    /// Look up tile by local coords (0..15, 0..15).
    #[inline]
    pub fn get(&self, lx: i32, lz: i32) -> &TileNav {
        &self.tiles[(lz * NAV_CHUNK + lx) as usize]
    }
}

// ---------------------------------------------------------------------------
// NavGrid resource — DashMap for lock-free concurrent access
// ---------------------------------------------------------------------------

/// Lazily-computed navigation grid backed by `DashMap` for concurrent
/// reads from the game thread and writes from background tasks.
#[derive(Resource, Clone)]
pub struct NavGrid {
    chunks: Arc<DashMap<(i32, i32), ChunkNav>>,
}

impl Default for NavGrid {
    fn default() -> Self {
        Self {
            chunks: Arc::new(DashMap::new()),
        }
    }
}

impl NavGrid {
    /// Get a shared handle for background tasks. Cheap (Arc clone).
    pub fn shared(&self) -> Arc<DashMap<(i32, i32), ChunkNav>> {
        Arc::clone(&self.chunks)
    }

    /// Ensure chunk nav data is computed and cached.
    pub fn ensure_chunk(&self, cx: i32, cz: i32) {
        if !self.chunks.contains_key(&(cx, cz)) {
            self.chunks.insert((cx, cz), ChunkNav::generate(cx, cz));
        }
    }

    /// Get tile navigation data at world tile coords.
    pub fn tile_nav(&self, tx: i32, tz: i32) -> TileNav {
        let cx = tx.div_euclid(NAV_CHUNK);
        let cz = tz.div_euclid(NAV_CHUNK);
        self.ensure_chunk(cx, cz);
        let lx = tx.rem_euclid(NAV_CHUNK);
        let lz = tz.rem_euclid(NAV_CHUNK);
        *self.chunks.get(&(cx, cz)).unwrap().get(lx, lz)
    }

    /// Is the tile walkable?
    pub fn is_walkable(&self, tx: i32, tz: i32) -> bool {
        self.tile_nav(tx, tz).walkable
    }

    /// Traversal cost for entering the tile.
    pub fn cost(&self, tx: i32, tz: i32) -> f32 {
        self.tile_nav(tx, tz).cost
    }

    /// Return walkable 8-connected neighbors where height delta <= MAX_STEP_HEIGHT.
    pub fn walkable_neighbors(&self, tx: i32, tz: i32) -> Vec<(i32, i32)> {
        let center = self.tile_nav(tx, tz);
        if !center.walkable {
            return Vec::new();
        }
        let ch = center.height;

        static OFFSETS: [(i32, i32); 8] = [
            (-1, -1),
            (0, -1),
            (1, -1),
            (-1, 0),
            (1, 0),
            (-1, 1),
            (0, 1),
            (1, 1),
        ];

        let mut result = Vec::with_capacity(8);
        for &(dx, dz) in &OFFSETS {
            let nx = tx + dx;
            let nz = tz + dz;
            let n = self.tile_nav(nx, nz);
            if n.walkable && (n.height - ch).abs() <= MAX_STEP_HEIGHT {
                result.push((nx, nz));
            }
        }
        result
    }

    /// Check if a chunk is already loaded.
    pub fn has_chunk(&self, cx: i32, cz: i32) -> bool {
        self.chunks.contains_key(&(cx, cz))
    }

    /// Evict chunks farther than `keep_radius` from center chunk.
    pub fn evict_far(&self, center_cx: i32, center_cz: i32, keep_radius: i32) {
        self.chunks.retain(|&(cx, cz), _| {
            (cx - center_cx).abs() <= keep_radius && (cz - center_cz).abs() <= keep_radius
        });
    }
}
