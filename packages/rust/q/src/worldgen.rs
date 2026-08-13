//! Engine-agnostic terrain height generation.

use fastnoise_lite::{FastNoiseLite, FractalType, NoiseType};

fn make_noise(seed: i32, frequency: f32, octaves: i32) -> FastNoiseLite {
    let mut n = FastNoiseLite::with_seed(seed);
    n.set_noise_type(Some(NoiseType::OpenSimplex2S));
    n.set_frequency(Some(frequency));
    n.set_fractal_type(Some(FractalType::FBm));
    n.set_fractal_octaves(Some(octaves));
    n.set_fractal_lacunarity(Some(2.0));
    n.set_fractal_gain(Some(0.5));
    n
}

/// Defaults must match `QTerrain`'s exported defaults.
#[derive(Clone, Copy, Debug)]
pub struct HeightParams {
    pub seed: i32,
    pub hill_amplitude: f32,
    pub hill_base: f32,
    pub hill_frequency: f32,
    pub river_wander: f32,
    pub river_wander_frequency: f32,
    pub river_width: f32,
    pub water_level: f32,
    pub riverbed_depth: f32,
}

impl Default for HeightParams {
    fn default() -> Self {
        Self {
            seed: 1337,
            hill_amplitude: 4.0,
            hill_base: 3.5,
            hill_frequency: 0.008,
            river_wander: 60.0,
            river_wander_frequency: 0.004,
            river_width: 7.0,
            water_level: -1.4,
            riverbed_depth: 1.2,
        }
    }
}

pub struct HeightGen {
    hills: FastNoiseLite,
    river: FastNoiseLite,
    hill_amplitude: f32,
    hill_base: f32,
    river_wander: f32,
    river_width: f32,
    water_level: f32,
    riverbed_depth: f32,
}

impl HeightGen {
    pub fn new(p: &HeightParams) -> Self {
        Self {
            hills: make_noise(p.seed, p.hill_frequency, 4),
            river: make_noise(p.seed + 7, p.river_wander_frequency, 5),
            hill_amplitude: p.hill_amplitude,
            hill_base: p.hill_base,
            river_wander: p.river_wander,
            river_width: p.river_width,
            water_level: p.water_level,
            riverbed_depth: p.riverbed_depth,
        }
    }

    pub fn height(&self, x: f32, z: f32) -> f32 {
        let h = self.hills.get_noise_2d(x, z) * self.hill_amplitude + self.hill_base;
        let river_x = self.river.get_noise_2d(z, 0.0) * self.river_wander;
        let d = (x - river_x).abs();
        let t = (-(d * d) / (2.0 * self.river_width * self.river_width)).exp();
        let m = (t * 1.15).clamp(0.0, 1.0);
        h + (self.water_level - self.riverbed_depth - h) * m
    }

    pub fn river_x(&self, z: f32) -> f32 {
        self.river.get_noise_2d(z, 0.0) * self.river_wander
    }

    /// Low-frequency drift used to keep the trunk road from being a ruler line.
    pub fn wander(&self, x: f32) -> f32 {
        self.river.get_noise_2d(x * 0.35, 500.0)
    }

    /// Row-major `res * res` heights over `[-extent, extent]` on both axes.
    pub fn bake(&self, extent: f32, res: i32) -> Vec<f32> {
        let step = extent * 2.0 / (res - 1) as f32;
        let mut heights = vec![0.0f32; (res * res) as usize];
        for iy in 0..res {
            let z = -extent + iy as f32 * step;
            for ix in 0..res {
                let x = -extent + ix as f32 * step;
                heights[(iy * res + ix) as usize] = self.height(x, z);
            }
        }
        heights
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_same_seed_bakes_the_same_grid() {
        let p = HeightParams::default();
        assert_eq!(
            HeightGen::new(&p).bake(64.0, 33),
            HeightGen::new(&p).bake(64.0, 33),
            "client and server must agree on ground"
        );
    }

    #[test]
    fn a_different_seed_bakes_a_different_grid() {
        let a = HeightParams::default();
        let b = HeightParams { seed: 4242, ..a };
        assert_ne!(
            HeightGen::new(&a).bake(64.0, 33),
            HeightGen::new(&b).bake(64.0, 33)
        );
    }

    #[test]
    fn bake_matches_pointwise_height() {
        let p = HeightParams::default();
        let hgen = HeightGen::new(&p);
        let (extent, res) = (64.0f32, 33);
        let grid = hgen.bake(extent, res);
        let step = extent * 2.0 / (res - 1) as f32;
        for iy in [0, 7, res - 1] {
            for ix in [0, 13, res - 1] {
                let (x, z) = (-extent + ix as f32 * step, -extent + iy as f32 * step);
                assert_eq!(grid[(iy * res + ix) as usize], hgen.height(x, z));
            }
        }
    }
}
