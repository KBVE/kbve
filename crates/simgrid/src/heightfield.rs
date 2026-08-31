//! Canonical shared heightmap: height as a pure function of (seed, tile) so the
//! server, web client, and Unreal client derive identical terrain. Mirrors
//! `FKBVEWorldHeightfield` (KBVEWorldCore, C++) and `heightAt` (@kbve/laser, TS)
//! over FastNoiseLite 1.1.1. Domain is tile coordinates; output is height in
//! Unreal uu. Never transmitted on the wire — `EntityDelta.z` stays the floor
//! index. Parity is pinned by the cross-language vectors in the tests below.

use fastnoise_lite::{FastNoiseLite, FractalType, NoiseType};

pub const CONTINENT_FREQ: f32 = 0.01;
pub const CONTINENT_OCTAVES: i32 = 5;
pub const CONTINENT_GAIN: f32 = 0.5;
pub const CONTINENT_LACUNARITY: f32 = 2.05;

pub const DETAIL_FREQ: f32 = 0.08;
pub const DETAIL_OCTAVES: i32 = 3;
pub const DETAIL_GAIN: f32 = 0.45;
pub const DETAIL_LACUNARITY: f32 = 2.10;
pub const DETAIL_SEED_OFFSET: i32 = 1024;

pub const CONTINENT_WEIGHT: f32 = 0.78;
pub const DETAIL_WEIGHT: f32 = 0.22;
pub const AMPLITUDE: f32 = 900.0;

/// Canonical i64 world seed -> i32 noise seed truncation.
pub fn seed_from_world(world_seed: i64) -> i32 {
    (world_seed & 0xFFFF_FFFF) as u32 as i32
}

fn build_fbm(seed: i32, frequency: f32, octaves: i32, gain: f32, lacunarity: f32) -> FastNoiseLite {
    let mut noise = FastNoiseLite::with_seed(seed);
    noise.set_noise_type(Some(NoiseType::OpenSimplex2));
    noise.set_fractal_type(Some(FractalType::FBm));
    noise.set_frequency(Some(frequency));
    noise.set_fractal_octaves(Some(octaves));
    noise.set_fractal_gain(Some(gain));
    noise.set_fractal_lacunarity(Some(lacunarity));
    noise
}

/// Height in Unreal uu for a tile-space position.
pub fn height_at(seed: i32, tile_x: f32, tile_y: f32) -> f32 {
    let continent = build_fbm(
        seed,
        CONTINENT_FREQ,
        CONTINENT_OCTAVES,
        CONTINENT_GAIN,
        CONTINENT_LACUNARITY,
    );
    let detail = build_fbm(
        seed.wrapping_add(DETAIL_SEED_OFFSET),
        DETAIL_FREQ,
        DETAIL_OCTAVES,
        DETAIL_GAIN,
        DETAIL_LACUNARITY,
    );
    let mix = CONTINENT_WEIGHT * continent.get_noise_2d(tile_x, tile_y)
        + DETAIL_WEIGHT * detail.get_noise_2d(tile_x, tile_y);
    mix.clamp(-1.0, 1.0) * AMPLITUDE
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seed_truncation_is_canonical() {
        assert_eq!(seed_from_world(0), 0);
        assert_eq!(seed_from_world(0xC1A5_5E5A), 0xC1A5_5E5Au32 as i32);
        assert_eq!(seed_from_world(-1), -1);
        assert_eq!(seed_from_world(0x1_2345_6789), 0x2345_6789);
    }

    #[test]
    fn height_is_deterministic_and_bounded() {
        for &(seed, x, y) in &[
            (0i32, 0.0f32, 0.0f32),
            (0xC1A5_5E5Au32 as i32, 12.5, -83.25),
            (42, 1000.0, 1000.0),
            (-7, -512.0, 4096.5),
        ] {
            let a = height_at(seed, x, y);
            let b = height_at(seed, x, y);
            assert_eq!(a.to_bits(), b.to_bits());
            assert!(a.abs() <= AMPLITUDE);
        }
    }

    /// Cross-language parity vectors. The same table is asserted bit-exactly in
    /// this crate, near-exactly (f64 port) in @kbve/laser heightAt.spec.ts, and
    /// generated from FKBVEWorldHeightfield. Regenerate with:
    /// `cargo test -p simgrid print_height_vectors -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn print_height_vectors() {
        for &(seed, x, y) in VECTOR_INPUTS {
            let h = height_at(seed, x, y);
            println!("({seed}, {x:?}, {y:?}, {:#010X}), // {h}", h.to_bits());
        }
    }

    const VECTOR_INPUTS: &[(i32, f32, f32)] = &[
        (0, 0.0, 0.0),
        (0, 1.0, 1.0),
        (0, -1.0, 1.0),
        (0, 100.5, -200.25),
        (0xC1A5_5E5Au32 as i32, 0.0, 0.0),
        (0xC1A5_5E5Au32 as i32, 64.0, 64.0),
        (0xC1A5_5E5Au32 as i32, -300.0, 12.0),
        (1, 0.5, 0.5),
        (-1, 1024.0, -1024.0),
        (123_456_789, 3.25, -7.75),
    ];

    #[test]
    fn pinned_cross_language_vectors() {
        for (i, &(seed, x, y)) in VECTOR_INPUTS.iter().enumerate() {
            let h = height_at(seed, x, y);
            assert_eq!(
                h.to_bits(),
                PINNED_BITS[i],
                "vector {i} (seed={seed} x={x} y={y}) drifted: got {h}"
            );
        }
    }

    const PINNED_BITS: &[u32] = &[
        0x00000000, 0x42259454, 0x42E3B9A9, 0xC27037BF, 0x00000000, 0xC1D568A1, 0xC395DAFB,
        0xC15522AF, 0xC2FA7051, 0xC32DF80C,
    ];
}
