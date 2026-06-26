//! Server biome field — a byte-for-byte mirror of the client's value-noise
//! `biomeAt` (arpg/web src/game/systems/biome.ts). Same hashing, same f64 math,
//! same biome index, over CHUNK coords. Ground movement reads it to slow units
//! in dense terrain; flyers ignore it. Float math is f64 (JS `number`) so the
//! Rust and TS fields agree on every chunk.

use crate::arpg_dungeon::CHUNK_SIZE;

const BIOME_SEED: i32 = 0x1337c0de_u32 as i32;
const REGION_FREQ: f64 = 0.11;

/// Biome order MUST match the client `BIOMES` array (config.ts): index N here is
/// index N there, so `biome_at` and `biomeAt` return the same variant.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Biome {
    Meadow,
    Spring,
    Forest,
    Wetland,
}

const BIOME_COUNT: usize = 4;

fn biome_from_index(i: usize) -> Biome {
    match i {
        0 => Biome::Meadow,
        1 => Biome::Spring,
        2 => Biome::Forest,
        _ => Biome::Wetland,
    }
}

/// 32-bit integer hash → f64 in [0,1). Mirrors the TS `hash2`: `Math.imul`
/// (32-bit wrapping mul), signed `| 0`, unsigned `>>>` shifts, then `>>> 0`
/// divided by 2^32.
fn hash2(ix: i32, iy: i32, seed: i32) -> f64 {
    let mut h: i32 = (ix.wrapping_mul(374761393)) ^ (iy.wrapping_mul(668265263)) ^ seed;
    h = (h ^ ((h as u32 >> 13) as i32)).wrapping_mul(1274126177);
    let u = (h ^ ((h as u32 >> 16) as i32)) as u32;
    u as f64 / 4294967296.0
}

fn smooth(t: f64) -> f64 {
    t * t * (3.0 - 2.0 * t)
}

fn value_noise(x: f64, y: f64, seed: i32) -> f64 {
    let x0 = x.floor();
    let y0 = y.floor();
    let fx = smooth(x - x0);
    let fy = smooth(y - y0);
    let x0i = x0 as i32;
    let y0i = y0 as i32;
    let a = hash2(x0i, y0i, seed);
    let b = hash2(x0i + 1, y0i, seed);
    let c = hash2(x0i, y0i + 1, seed);
    let d = hash2(x0i + 1, y0i + 1, seed);
    (a * (1.0 - fx) + b * fx) * (1.0 - fy) + (c * (1.0 - fx) + d * fx) * fy
}

/// Biome at a CHUNK coordinate. `biome_at(chunk_of(tile))` mirrors the client's
/// per-chunk biome exactly.
pub fn biome_at(chunk_x: i32, chunk_y: i32) -> Biome {
    let n = value_noise(
        chunk_x as f64 * REGION_FREQ,
        chunk_y as f64 * REGION_FREQ,
        BIOME_SEED,
    );
    let i = ((n * BIOME_COUNT as f64).floor() as usize).min(BIOME_COUNT - 1);
    biome_from_index(i)
}

/// Biome at a TILE — maps tile → chunk with the same `CHUNK_SIZE` and floor div
/// the dungeon/client use, then looks up the chunk biome.
pub fn biome_at_tile(tile_x: i32, tile_y: i32) -> Biome {
    biome_at(tile_x.div_euclid(CHUNK_SIZE), tile_y.div_euclid(CHUNK_SIZE))
}

/// Ground-speed multiplier per biome. Flyers ignore this (always full speed).
/// Meadow/Spring open ground = full; Forest/Wetland drag.
pub fn ground_speed_mult(b: Biome) -> f32 {
    match b {
        Biome::Meadow | Biome::Spring => 1.0,
        Biome::Forest => 0.8,
        Biome::Wetland => 0.6,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Pinned (chunk -> biome) vectors. The client mirror (biome.ts `biomeAt`)
    // MUST return the same variant for each — if either side drifts (hashing or
    // float precision) these break and catch the divergence.
    #[test]
    fn biome_field_parity_vectors_frozen() {
        assert_eq!(biome_at(0, 0), Biome::Wetland);
        assert_eq!(biome_at(1, 0), Biome::Wetland);
        assert_eq!(biome_at(0, 1), Biome::Wetland);
        assert_eq!(biome_at(5, 5), Biome::Spring);
        assert_eq!(biome_at(-3, 7), Biome::Forest);
        assert_eq!(biome_at(12, -8), Biome::Forest);
        assert_eq!(biome_at(-1, 0), Biome::Wetland);
    }

    #[test]
    fn biome_at_tile_maps_through_chunk() {
        // Tiles within one chunk share its biome; div_euclid handles negatives.
        assert_eq!(biome_at_tile(0, 0), biome_at(0, 0));
        assert_eq!(biome_at_tile(CHUNK_SIZE - 1, 0), biome_at(0, 0));
        assert_eq!(biome_at_tile(CHUNK_SIZE, 0), biome_at(1, 0));
        assert_eq!(biome_at_tile(-1, 0), biome_at(-1, 0));
    }
}
