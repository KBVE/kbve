use bevy::prelude::*;
use std::collections::HashMap;

use super::player::Player;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

pub const CHUNK_SIZE: i32 = 16;

#[cfg(not(target_arch = "wasm32"))]
pub const LOAD_RADIUS: i32 = 3;

#[cfg(target_arch = "wasm32")]
pub const LOAD_RADIUS: i32 = 2;
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
// SIMD-batched terrain height (4 tiles at once)
// ---------------------------------------------------------------------------

/// Compute terrain heights for 4 tiles simultaneously.
/// Returns [h0, h1, h2, h3] for the given (x,z) pairs.
/// On WASM with simd128, uses i32x4/f32x4 intrinsics.
/// On other targets, falls back to scalar loop.
#[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]
pub fn terrain_height_x4(
    coords: [(i32, i32); 4],
    seed: u32,
    max_height: f32,
    scale: f32,
) -> [f32; 4] {
    use core::arch::wasm32::*;

    let seed_f = seed as f32;
    let inv_scale = 1.0 / scale;
    let offset_x = seed_f * 0.7321;
    let offset_z = seed_f * 0.3179;

    // Batch-compute both octaves for all 4 tiles.
    let mut results = [0.0f32; 4];
    for i in 0..4 {
        let (x, z) = coords[i];
        let fx = (x as f32 + offset_x) * inv_scale;
        let fz = (z as f32 + offset_z) * inv_scale;

        let n1 = value_noise(fx, fz);
        let n2 = value_noise(fx * 2.0, fz * 2.0);
        results[i] = n1 * 0.7 + n2 * 0.3;
    }

    // SIMD multiply by max_height and round.
    let raw = f32x4(results[0], results[1], results[2], results[3]);
    let mh = f32x4_splat(max_height);
    let scaled = f32x4_mul(raw, mh);
    let rounded = f32x4_nearest(scaled);

    let mut out = [0.0f32; 4];
    f32x4_store(&rounded, &mut out);
    out
}

#[cfg(not(all(target_arch = "wasm32", target_feature = "simd128")))]
pub fn terrain_height_x4(
    coords: [(i32, i32); 4],
    seed: u32,
    max_height: f32,
    scale: f32,
) -> [f32; 4] {
    [
        terrain_height(coords[0].0, coords[0].1, seed, max_height, scale),
        terrain_height(coords[1].0, coords[1].1, seed, max_height, scale),
        terrain_height(coords[2].0, coords[2].1, seed, max_height, scale),
        terrain_height(coords[3].0, coords[3].1, seed, max_height, scale),
    ]
}

/// Helper: store f32x4 SIMD value into a [f32; 4] array.
#[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]
#[inline(always)]
fn f32x4_store(v: &core::arch::wasm32::v128, out: &mut [f32; 4]) {
    use core::arch::wasm32::*;
    out[0] = f32x4_extract_lane::<0>(*v);
    out[1] = f32x4_extract_lane::<1>(*v);
    out[2] = f32x4_extract_lane::<2>(*v);
    out[3] = f32x4_extract_lane::<3>(*v);
}

// ---------------------------------------------------------------------------
// Chunk data
// ---------------------------------------------------------------------------

pub struct ChunkData {
    pub heights: HashMap<(i32, i32), f32>,
    pub tile_entities: Vec<Entity>,
}

impl ChunkData {
    fn generate(chunk_x: i32, chunk_z: i32, seed: u32) -> Self {
        let mut heights = HashMap::new();
        let base_x = chunk_x * CHUNK_SIZE;
        let base_z = chunk_z * CHUNK_SIZE;

        // Process tiles in batches of 4 for SIMD acceleration.
        for dx in 0..CHUNK_SIZE {
            let tx = base_x + dx;
            let mut dz = 0;
            while dz + 3 < CHUNK_SIZE {
                let coords = [
                    (tx, base_z + dz),
                    (tx, base_z + dz + 1),
                    (tx, base_z + dz + 2),
                    (tx, base_z + dz + 3),
                ];
                let h4 = terrain_height_x4(coords, seed, MAX_HEIGHT, NOISE_SCALE);
                for i in 0..4 {
                    heights.insert(coords[i], h4[i]);
                }
                dz += 4;
            }
            // Handle remainder (CHUNK_SIZE=16 is divisible by 4, but be safe).
            while dz < CHUNK_SIZE {
                let tz = base_z + dz;
                let h = terrain_height(tx, tz, seed, MAX_HEIGHT, NOISE_SCALE);
                heights.insert((tx, tz), h);
                dz += 1;
            }
        }

        ChunkData {
            heights,
            tile_entities: Vec::new(),
        }
    }
}

// ---------------------------------------------------------------------------
// TerrainMap resource
// ---------------------------------------------------------------------------

#[derive(Resource)]
pub struct TerrainMap {
    pub seed: u32,
    chunks: HashMap<(i32, i32), ChunkData>,
    /// Chunks that need tile entities spawned
    pub chunks_to_spawn: Vec<(i32, i32)>,
    /// Chunks that need tile entities despawned
    pub chunks_to_despawn: Vec<(i32, i32, Vec<Entity>)>,
}

impl TerrainMap {
    pub fn new(seed: u32) -> Self {
        Self {
            seed,
            chunks: HashMap::new(),
            chunks_to_spawn: Vec::new(),
            chunks_to_despawn: Vec::new(),
        }
    }

    /// Get the height at a tile coordinate. Generates chunk on-the-fly if needed.
    pub fn height_at(&mut self, x: i32, z: i32) -> f32 {
        let (cx, cz) = Self::tile_to_chunk(x, z);
        let chunk = self
            .chunks
            .entry((cx, cz))
            .or_insert_with(|| ChunkData::generate(cx, cz, self.seed));
        chunk.heights.get(&(x, z)).copied().unwrap_or(0.0)
    }

    /// Get height at a world position (rounds to nearest tile).
    pub fn height_at_world(&mut self, wx: f32, wz: f32) -> f32 {
        let tx = wx.round() as i32;
        let tz = wz.round() as i32;
        self.height_at(tx, tz)
    }

    /// Get the maximum terrain height across all tiles covered by a footprint.
    /// Prevents the player from sinking into low tiles when their body overlaps
    /// adjacent higher tiles.
    pub fn max_height_in_footprint(&mut self, wx: f32, wz: f32, half_x: f32, half_z: f32) -> f32 {
        // Each tile covers ±0.5 around its integer centre, so the tile a point
        // falls on is round(point). Use round() on the footprint edges to get
        // exactly the tiles the player overlaps — no more, no fewer.
        let min_tx = (wx - half_x).round() as i32;
        let max_tx = (wx + half_x).round() as i32;
        let min_tz = (wz - half_z).round() as i32;
        let max_tz = (wz + half_z).round() as i32;

        let mut max_h: f32 = 0.0;
        for tx in min_tx..=max_tx {
            for tz in min_tz..=max_tz {
                max_h = max_h.max(self.height_at(tx, tz));
            }
        }
        max_h
    }

    /// Read-only height lookup (returns 0 if chunk not loaded).
    pub fn height_at_loaded(&self, x: i32, z: i32) -> f32 {
        let (cx, cz) = Self::tile_to_chunk(x, z);
        self.chunks
            .get(&(cx, cz))
            .and_then(|c| c.heights.get(&(x, z)).copied())
            .unwrap_or(0.0)
    }

    /// Store tile entities for a chunk so they can be despawned later.
    pub fn link_chunk_entities(&mut self, chunk_x: i32, chunk_z: i32, entities: Vec<Entity>) {
        if let Some(chunk) = self.chunks.get_mut(&(chunk_x, chunk_z)) {
            chunk.tile_entities = entities;
        }
    }

    /// Check if a chunk is loaded (has data).
    pub fn is_chunk_loaded(&self, cx: i32, cz: i32) -> bool {
        self.chunks.contains_key(&(cx, cz))
    }

    /// Check if a chunk has spawned tile entities.
    pub fn is_chunk_spawned(&self, cx: i32, cz: i32) -> bool {
        self.chunks
            .get(&(cx, cz))
            .is_some_and(|c| !c.tile_entities.is_empty())
    }

    /// Convert tile coordinate to chunk coordinate.
    pub fn tile_to_chunk(tx: i32, tz: i32) -> (i32, i32) {
        (tx.div_euclid(CHUNK_SIZE), tz.div_euclid(CHUNK_SIZE))
    }

    /// Update loaded chunks based on player position.
    /// Returns lists of chunks to spawn and despawn.
    pub fn update_around_player(&mut self, player_x: f32, player_z: f32) {
        let (pcx, pcz) = Self::tile_to_chunk(player_x.round() as i32, player_z.round() as i32);

        // Rebuild spawn queue fresh each frame (avoids duplicates when
        // rate-limited spawning leaves chunks un-spawned across frames).
        self.chunks_to_spawn.clear();

        // Determine which chunks should be loaded
        let mut desired: Vec<(i32, i32)> = Vec::new();
        for dx in -LOAD_RADIUS..=LOAD_RADIUS {
            for dz in -LOAD_RADIUS..=LOAD_RADIUS {
                desired.push((pcx + dx, pcz + dz));
            }
        }

        // Load new chunks
        for &(cx, cz) in &desired {
            if !self.is_chunk_loaded(cx, cz) {
                let chunk = ChunkData::generate(cx, cz, self.seed);
                self.chunks.insert((cx, cz), chunk);
                self.chunks_to_spawn.push((cx, cz));
            } else if !self.is_chunk_spawned(cx, cz) {
                self.chunks_to_spawn.push((cx, cz));
            }
        }

        // Unload chunks outside radius
        let to_remove: Vec<(i32, i32)> = self
            .chunks
            .keys()
            .copied()
            .filter(|&(cx, cz)| !desired.contains(&(cx, cz)))
            .collect();

        for (cx, cz) in to_remove {
            if let Some(chunk) = self.chunks.remove(&(cx, cz)) {
                if !chunk.tile_entities.is_empty() {
                    self.chunks_to_despawn.push((cx, cz, chunk.tile_entities));
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

pub struct TerrainPlugin;

impl Plugin for TerrainPlugin {
    fn build(&self, app: &mut App) {
        let mut terrain = TerrainMap::new(TERRAIN_SEED);
        // Pre-generate chunks around spawn point (2, 2)
        terrain.update_around_player(2.0, 2.0);
        app.insert_resource(terrain);
        app.add_systems(Update, update_terrain_chunks);
    }
}

fn update_terrain_chunks(
    mut terrain: ResMut<TerrainMap>,
    player_query: Query<&Transform, With<Player>>,
) {
    let Ok(player_tf) = player_query.single() else {
        return;
    };
    terrain.update_around_player(player_tf.translation.x, player_tf.translation.z);
}
