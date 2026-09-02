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

/// River network.
///
/// The carve lives inside `height_at` rather than beside it: a riverbed that
/// only the renderer knows about is ground the server still calls solid, so the
/// two disagree about where a pawn stands.
pub const RIVER_FREQ: f32 = 0.001;
pub const RIVER_OCTAVES: i32 = 2;
pub const RIVER_GAIN: f32 = 0.5;
pub const RIVER_LACUNARITY: f32 = 2.0;
pub const RIVER_SEED_OFFSET: i32 = 7717;

/// Warp breaks the noise contour off its grid so the channel meanders instead
/// of running in soft diagonals.
pub const RIVER_WARP_FREQ: f32 = 0.006;
pub const RIVER_WARP_OCTAVES: i32 = 2;
pub const RIVER_WARP_AMP: f32 = 45.0;
pub const RIVER_WARP_SEED_OFFSET: i32 = 91_237;
pub const RIVER_WARP_LOBE: f32 = 137.0;

/// Half-width of the channel in TILES.
///
/// Measured in tiles and not in noise units, which is the difference between a
/// river and a chain of ponds: a band of constant noise value is wide where the
/// field is flat and pinched where it is steep, so its width on the ground
/// varies by an order of magnitude along a single channel. Dividing by the
/// gradient converts the value back into a distance.
pub const RIVER_WIDTH_TILES: f32 = 7.0;

/// Step used to measure the noise gradient, in tiles.
///
/// Wide on purpose. The gradient is a difference of two nearly equal noise
/// values, so a short step is dominated by cancellation -- and since the channel
/// width is that gradient divided into the noise value, the error lands directly
/// on how wide the river is. A step this size also averages the estimate over
/// ground the field barely varies across, which is what keeps the banks from
/// rippling.
pub const RIVER_GRADIENT_STEP: f32 = 2.0;

/// Surface every body of standing water sits at.
pub const WATER_Z: f32 = -140.0;

/// How far the channel floor lies below the water surface.
pub const RIVERBED_DEPTH: f32 = 160.0;

/// How high above the water rivers still run.
///
/// The water surface is one flat plane, so a channel carved across a hilltop is
/// a dry trench rather than a river. Fading the carve out with elevation is what
/// keeps every channel that does exist full: rivers belong to the lowlands here,
/// and the uplands they would drain are simply left alone.
pub const RIVER_MAX_ELEVATION: f32 = 260.0;

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

fn smoothstep(edge0: f32, edge1: f32, x: f32) -> f32 {
    let t = ((x - edge0) / (edge1 - edge0)).clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

/// The four noise fields the world is made of, built once.
///
/// Every sample needs all four now that the river gates on elevation, and
/// constructing them per sample is what made the naive form of this the
/// dominant cost of generating a patch.
pub struct HeightSampler {
    continent: FastNoiseLite,
    detail: FastNoiseLite,
    warp: FastNoiseLite,
    channel: FastNoiseLite,
}

impl HeightSampler {
    pub fn new(seed: i32) -> Self {
        Self {
            continent: build_fbm(
                seed,
                CONTINENT_FREQ,
                CONTINENT_OCTAVES,
                CONTINENT_GAIN,
                CONTINENT_LACUNARITY,
            ),
            detail: build_fbm(
                seed.wrapping_add(DETAIL_SEED_OFFSET),
                DETAIL_FREQ,
                DETAIL_OCTAVES,
                DETAIL_GAIN,
                DETAIL_LACUNARITY,
            ),
            warp: build_fbm(
                seed.wrapping_add(RIVER_WARP_SEED_OFFSET),
                RIVER_WARP_FREQ,
                RIVER_WARP_OCTAVES,
                RIVER_GAIN,
                RIVER_LACUNARITY,
            ),
            channel: build_fbm(
                seed.wrapping_add(RIVER_SEED_OFFSET),
                RIVER_FREQ,
                RIVER_OCTAVES,
                RIVER_GAIN,
                RIVER_LACUNARITY,
            ),
        }
    }

    /// The ground before the river was cut into it.
    pub fn base_height(&self, tile_x: f32, tile_y: f32) -> f32 {
        let mix = CONTINENT_WEIGHT * self.continent.get_noise_2d(tile_x, tile_y)
            + DETAIL_WEIGHT * self.detail.get_noise_2d(tile_x, tile_y);
        mix.clamp(-1.0, 1.0) * AMPLITUDE
    }

    fn channel_at(&self, tile_x: f32, tile_y: f32) -> f32 {
        let wx = tile_x + RIVER_WARP_AMP * self.warp.get_noise_2d(tile_x, tile_y);
        let wy = tile_y
            + RIVER_WARP_AMP
                * self
                    .warp
                    .get_noise_2d(tile_x + RIVER_WARP_LOBE, tile_y - RIVER_WARP_LOBE);
        self.channel.get_noise_2d(wx, wy)
    }

    /// Strength of the channel at a tile: 0 on dry ground, 1 across the basin.
    ///
    /// Saturating a gaussian rather than using it raw is what gives the profile
    /// a flat floor with banks either side. A plain falloff makes a V, which
    /// reads as a ditch someone dug, not as water that has been running there.
    pub fn river_mask(&self, tile_x: f32, tile_y: f32) -> f32 {
        let n = self.channel_at(tile_x, tile_y);
        let step = RIVER_GRADIENT_STEP;
        let gx = (self.channel_at(tile_x + step, tile_y) - n) / step;
        let gy = (self.channel_at(tile_x, tile_y + step) - n) / step;
        let gradient = (gx * gx + gy * gy).sqrt().max(1.0e-6);

        let distance = n.abs() / gradient;
        let width = RIVER_WIDTH_TILES;
        let falloff = (-(distance * distance) / (2.0 * width * width)).exp();

        let above = self.base_height(tile_x, tile_y) - WATER_Z;
        let gate = 1.0 - smoothstep(RIVER_MAX_ELEVATION * 0.6, RIVER_MAX_ELEVATION, above);

        (falloff * 1.15).clamp(0.0, 1.0) * gate
    }

    /// The ground as it stands, with the channel cut.
    ///
    /// Lerps toward an absolute bed rather than subtracting a depth. Subtracting
    /// carries the terrain's own detail down with it, so the floor of the river
    /// keeps the bumps of the hillside it cut through and the channel reads as a
    /// string of holes rather than as one continuous bed.
    pub fn height(&self, tile_x: f32, tile_y: f32) -> f32 {
        let h = self.base_height(tile_x, tile_y);
        let bed = WATER_Z - RIVERBED_DEPTH;
        h + (bed - h) * self.river_mask(tile_x, tile_y)
    }
}

/// Height in Unreal uu for a tile-space position.
pub fn height_at(seed: i32, tile_x: f32, tile_y: f32) -> f32 {
    HeightSampler::new(seed).height(tile_x, tile_y)
}

/// Strength of the river channel at a tile. Roads cost against this and bridges
/// span the run where a road crosses it anyway, so both read the field the
/// ground was carved with rather than guessing at it a second time.
pub fn river_mask(seed: i32, tile_x: f32, tile_y: f32) -> f32 {
    HeightSampler::new(seed).river_mask(tile_x, tile_y)
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
            assert!(a.abs() <= AMPLITUDE + RIVERBED_DEPTH + WATER_Z.abs());
        }
    }

    /// Cross-language parity vectors. The same table is asserted bit-exactly in
    /// this crate, near-exactly (f64 port) in @kbve/laser heightAt.spec.ts, and
    /// generated from FKBVEWorldHeightfield. Regenerate with:
    /// `cargo test -p simgrid print_height_vectors -- --ignored --nocapture`
    /// A river network is a thin thing. This is the guard on the width knob:
    /// widen the band far enough and every tile is riverbed, which reads as a
    /// flooded world rather than a carved one, and roads stop having anywhere
    /// dry to route.
    #[test]
    fn river_coverage_is_a_network_not_a_flood() {
        let field = HeightSampler::new(1337);
        let mut basin = 0usize;
        let mut total = 0usize;
        for gy in 0..200 {
            for gx in 0..200 {
                let x = gx as f32 * 3.0 - 300.0;
                let y = gy as f32 * 3.0 - 300.0;
                if field.river_mask(x, y) > 0.98 {
                    basin += 1;
                }
                total += 1;
            }
        }
        let frac = basin as f32 / total as f32;
        assert!(
            (0.005..0.05).contains(&frac),
            "river basin {frac} outside the network band"
        );
    }

    /// The profile has to be a basin with banks, not a V. Walking out from the
    /// centre line the floor stays flat for a while, then climbs -- a channel
    /// that starts climbing immediately is a ditch, and it is what subtracting a
    /// depth from local terrain gives you instead of what carving to a bed does.
    #[test]
    fn the_channel_has_a_flat_floor_and_banks() {
        let field = HeightSampler::new(1337);
        let bed = WATER_Z - RIVERBED_DEPTH;

        let mut found = None;
        for gy in 0..400 {
            for gx in 0..400 {
                let x = gx as f32 * 1.5 - 300.0;
                let y = gy as f32 * 1.5 - 300.0;
                if field.river_mask(x, y) > 0.999 {
                    found = Some((x, y));
                    break;
                }
            }
            if found.is_some() {
                break;
            }
        }
        let (cx, cy) = found.expect("no channel centre anywhere in the sample area");

        assert!(
            (field.height(cx, cy) - bed).abs() < 1.0,
            "the floor is not at the bed"
        );

        // Somewhere out on the bank the ground has to have climbed clear of the
        // water, or the carve never stopped and there are no banks at all.
        let mut climbed = false;
        for step in 1..60 {
            let d = step as f32;
            if field.height(cx + d, cy) > WATER_Z {
                climbed = true;
                break;
            }
        }
        assert!(climbed, "the channel never rises back above the water line");
    }

    #[test]
    #[ignore]
    fn print_river_profile() {
        let f = HeightSampler::new(1337);
        let mut wide = 0usize;
        let mut wet = 0usize;
        let mut gated = 0usize;
        let mut grad_sum = 0.0f32;
        let mut dist_sum = 0.0f32;
        let mut n = 0usize;
        for gy in 0..200 {
            for gx in 0..200 {
                let x = gx as f32 * 3.0 - 300.0;
                let y = gy as f32 * 3.0 - 300.0;
                let c = f.channel_at(x, y);
                let step = RIVER_GRADIENT_STEP;
                let dx = (f.channel_at(x + step, y) - c) / step;
                let dy = (f.channel_at(x, y + step) - c) / step;
                let g = (dx * dx + dy * dy).sqrt().max(1.0e-6);
                grad_sum += g;
                dist_sum += c.abs() / g;
                let m = f.river_mask(x, y);
                if m > 0.98 {
                    wide += 1;
                }
                if m > 0.02 {
                    wet += 1;
                }
                let above = f.base_height(x, y) - WATER_Z;
                if above < RIVER_MAX_ELEVATION {
                    gated += 1;
                }
                n += 1;
            }
        }
        println!(
            "mean|grad| {:.5} mean dist {:.2} tiles | basin {:.3} any {:.3} lowland {:.3}",
            grad_sum / n as f32,
            dist_sum / n as f32,
            wide as f32 / n as f32,
            wet as f32 / n as f32,
            gated as f32 / n as f32
        );
    }

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
        0xC392E1EF, 0xC378DFD7, 0x42DC6DBD, 0xC27037BF, 0xC35C3C83, 0xC241D19A, 0xC395DAFB,
        0xC3960000, 0xC32810B8, 0xC32E173F,
    ];
}
