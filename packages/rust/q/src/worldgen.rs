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
    seed: u32,
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
            seed: p.seed as u32,
            hill_amplitude: p.hill_amplitude,
            hill_base: p.hill_base,
            river_wander: p.river_wander,
            river_width: p.river_width,
            water_level: p.water_level,
            riverbed_depth: p.riverbed_depth,
        }
    }

    /// The ground before anything was built on it.
    ///
    /// Landmarks level the ground they stand on, and they work out what to level it
    /// to by sampling it. That has to be this rather than [`Self::height`], or the
    /// question of how high a capital's floor is answers itself with itself.
    pub fn base_height(&self, x: f32, z: f32) -> f32 {
        let h = self.hills.get_noise_2d(x, z) * self.hill_amplitude + self.hill_base;
        let river_x = self.river.get_noise_2d(z, 0.0) * self.river_wander;
        let d = (x - river_x).abs();
        let t = libm::expf(-(d * d) / (2.0 * self.river_width * self.river_width));
        let m = (t * 1.15).clamp(0.0, 1.0);
        h + (self.water_level - self.riverbed_depth - h) * m
    }

    /// The ground as it stands, levelled where something was built on it.
    ///
    /// Every consumer of the world reads this one function -- the client's mesh, the
    /// server's heightfield, the scatter, the water, the flow field -- so putting the
    /// levelling here is the only way a capital's courtyard is flat in all of them
    /// without any of them being told a capital is there.
    pub fn height(&self, x: f32, z: f32) -> f32 {
        let h = self.base_height(x, z);
        match crate::landmark::pad_at(self.seed, self, x, z) {
            Some((pad_y, w)) => h + (pad_y - h) * w,
            None => h,
        }
    }

    pub fn seed(&self) -> u32 {
        self.seed
    }

    /// How far the channel ever strays from `x = 0`.
    pub fn river_wander(&self) -> f32 {
        self.river_wander
    }

    /// Height every water surface in this field sits at.
    pub fn water_level(&self) -> f32 {
        self.water_level
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
        self.bake_at([0.0, 0.0], extent, res)
    }

    /// The same grid, centred anywhere.
    ///
    /// The height function is unbounded and stateless, so a window is only ever
    /// a view: two windows overlapping the same ground agree on it exactly, and
    /// that is what lets the world be baked around the player rather than once.
    pub fn bake_at(&self, origin: [f32; 2], extent: f32, res: i32) -> Vec<f32> {
        let step = extent * 2.0 / (res - 1).max(1) as f32;
        let mut heights = vec![0.0f32; (res.max(1) * res.max(1)) as usize];
        for iy in 0..res {
            let z = origin[1] - extent + iy as f32 * step;
            for ix in 0..res {
                let x = origin[0] - extent + ix as f32 * step;
                heights[(iy * res + ix) as usize] = self.height(x, z);
            }
        }
        heights
    }
}

/// The square of world currently baked, and when to bake the next one.
///
/// The ground function has no edges, so "more world" is not more data -- it is
/// moving this window and re-baking. The two numbers that matter are `stride`,
/// which quantises where a window may sit so the same ground bakes identically
/// however you approach it, and `shift_at`, which is what stops a player
/// standing on a boundary re-baking the world every step.
#[derive(Clone, Copy, Debug)]
pub struct Window {
    pub origin: [f32; 2],
    pub extent: f32,
    pub stride: f32,
    /// How far from the origin the player gets before the window follows.
    pub shift_at: f32,
}

impl Window {
    pub fn new(extent: f32, stride: f32) -> Self {
        Self {
            origin: [0.0, 0.0],
            extent,
            // A stride bigger than the window would leave gaps between bakes.
            stride: stride.clamp(1.0, extent),
            shift_at: extent * 0.35,
        }
    }

    /// A window whose stride is a whole number of samples of the grid it bakes.
    ///
    /// [`snap`](Self::snap) quantises origins so the same ground bakes the same
    /// way however it is approached, but that only holds if the quantum is a
    /// multiple of the sample spacing. Off by a fraction of a sample, the new
    /// grid interleaves with the old one and every shift steps the ground under
    /// anyone standing on it.
    ///
    /// The stride is rounded to the nearest whole number of samples rather than
    /// rejected, so a caller may ask in metres without knowing the resolution.
    pub fn aligned(extent: f32, stride: f32, res: i32) -> Self {
        let step = extent * 2.0 / (res - 1).max(1) as f32;
        let wanted = stride.clamp(step, extent);
        let samples = (wanted / step).round().max(1.0);
        let mut w = Self::new(extent, samples * step);
        w.stride = (samples * step).min(extent);
        w
    }

    /// Nearest origin a window is allowed to sit on.
    pub fn snap(&self, at: [f32; 2]) -> [f32; 2] {
        [
            (at[0] / self.stride).round() * self.stride,
            (at[1] / self.stride).round() * self.stride,
        ]
    }

    /// True while the point is inside the baked square.
    pub fn covers(&self, at: [f32; 2]) -> bool {
        (at[0] - self.origin[0]).abs() <= self.extent
            && (at[1] - self.origin[1]).abs() <= self.extent
    }

    /// Where the window should move to, or `None` to stay put.
    ///
    /// Two guards, and both are needed. Distance from the current origin gives
    /// the hysteresis: without it a player walking the boundary re-bakes on
    /// every step. Comparing against the snapped target catches the case where
    /// they are far out but the nearest legal origin is the one already in use.
    pub fn next_origin(&self, player: [f32; 2]) -> Option<[f32; 2]> {
        let off = [player[0] - self.origin[0], player[1] - self.origin[1]];
        if off[0].abs().max(off[1].abs()) < self.shift_at {
            return None;
        }
        let target = self.snap(player);
        if target == self.origin {
            return None;
        }
        Some(target)
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

    /// A stride that is not a whole number of samples lands the new grid between
    /// the old one's rows, so the same ground bakes to different heights either
    /// side of a shift and the seam is a step. `Window::new` is the only place
    /// that can catch it, because by the time a bake happens the stride is long
    /// since chosen.
    #[test]
    fn a_window_stride_is_a_whole_number_of_samples() {
        for (extent, res, asked) in [
            (256.0f32, 513, 128.0f32),
            (256.0, 512, 128.0),
            (256.0, 513, 100.0),
            (128.0, 257, 48.0),
            (200.0, 401, 33.0),
        ] {
            let w = Window::aligned(extent, asked, res);
            let step = extent * 2.0 / (res - 1).max(1) as f32;
            let samples = w.stride / step;
            assert!(
                (samples - samples.round()).abs() < 1e-4,
                "extent {extent} res {res} asked {asked} gave stride {} = {samples} samples",
                w.stride
            );
            assert!(w.stride >= step, "stride collapsed to nothing");
            assert!(
                w.stride <= extent,
                "stride wider than the window leaves gaps"
            );
        }
    }

    /// Whole-sample alignment is necessary but not sufficient. The two windows
    /// reach a shared sample by different arithmetic -- one adds the shift into
    /// the origin, the other walks further along the row -- and those agree to
    /// the bit only when the sample step and the stride are exactly
    /// representable. They are at the shipped shape, where `extent * 2 / (res-1)`
    /// is 1.0 and the stride is 128, both exact.
    ///
    /// This is what pins that shape down. A resolution that makes the step a
    /// repeating fraction still draws a sound world -- the disagreement is a
    /// couple of ULPs, far under a millimetre -- but it is no longer bit-exact,
    /// and bit-exactness is what lets the client and the server bake the ground
    /// separately and trust each other's.
    #[test]
    fn an_aligned_shift_lands_on_the_old_samples_to_the_bit() {
        let g = HeightGen::new(&HeightParams::default());
        let (extent, res) = (256.0f32, 513);
        let step = extent * 2.0 / (res - 1) as f32;
        assert_eq!(step, 1.0, "the shipped grid must have an exact sample step");

        let w = Window::aligned(extent, 128.0, res);
        assert_eq!(w.stride, 128.0);
        let shifted = w.snap([300.0, 0.0]);
        let cols = (shifted[0] / step).round() as i32;
        assert!(cols > 0 && cols < res);

        let a = g.bake_at([0.0, 0.0], extent, res);
        let b = g.bake_at(shifted, extent, res);
        let mut checked = 0;
        for iy in 0..res {
            for ix in 0..(res - cols) {
                assert_eq!(
                    a[(iy * res + ix + cols) as usize].to_bits(),
                    b[(iy * res + ix) as usize].to_bits(),
                    "seam at ({ix}, {iy}) after a {}m shift",
                    shifted[0]
                );
                checked += 1;
            }
        }
        assert!(checked > 10_000);
    }

    /// Off the exact shape the seam must still be far below anything a body can
    /// stand on, or a resolution change is a trap rather than a tuning knob.
    #[test]
    fn an_aligned_shift_is_sound_at_any_resolution() {
        let g = HeightGen::new(&HeightParams::default());
        for res in [256, 512, 401, 333] {
            let extent = 256.0f32;
            let step = extent * 2.0 / (res - 1) as f32;
            let w = Window::aligned(extent, 100.0, res);
            let shifted = w.snap([300.0, 0.0]);
            let cols = (shifted[0] / step).round() as i32;
            let a = g.bake_at([0.0, 0.0], extent, res);
            let b = g.bake_at(shifted, extent, res);
            let mut worst = 0.0f32;
            for iy in 0..res {
                for ix in 0..(res - cols) {
                    let d =
                        (a[(iy * res + ix + cols) as usize] - b[(iy * res + ix) as usize]).abs();
                    worst = worst.max(d);
                }
            }
            assert!(worst < 1e-3, "res {res} seams by {worst}m");
        }
    }

    /// The property the whole sliding world rests on: two windows that overlap
    /// must agree on the ground they share, exactly, or the seam is a cliff.
    #[test]
    fn overlapping_windows_agree_on_shared_ground() {
        let g = HeightGen::new(&HeightParams::default());
        let (extent, res) = (64.0f32, 65);
        let step = extent * 2.0 / (res - 1) as f32;
        let a = g.bake_at([0.0, 0.0], extent, res);
        // Shifted by a whole number of samples, so the grids line up.
        let shift = step * 16.0;
        let b = g.bake_at([shift, 0.0], extent, res);
        let mut shared = 0;
        for iy in 0..res {
            for ix in 16..res {
                let from_a = a[(iy * res + ix) as usize];
                let from_b = b[(iy * res + ix - 16) as usize];
                assert_eq!(
                    from_a.to_bits(),
                    from_b.to_bits(),
                    "seam at {ix},{iy}: {from_a} vs {from_b}"
                );
                shared += 1;
            }
        }
        assert!(shared > 2000, "compared almost nothing: {shared}");
    }

    #[test]
    fn baking_somewhere_else_is_not_baking_the_same_place() {
        let g = HeightGen::new(&HeightParams::default());
        assert_ne!(
            g.bake_at([0.0, 0.0], 64.0, 33),
            g.bake_at([900.0, 900.0], 64.0, 33)
        );
    }

    #[test]
    fn bake_at_the_origin_is_the_old_bake() {
        let g = HeightGen::new(&HeightParams::default());
        assert_eq!(g.bake(64.0, 33), g.bake_at([0.0, 0.0], 64.0, 33));
    }

    #[test]
    fn a_window_follows_a_player_who_walks_away() {
        let w = Window::new(256.0, 128.0);
        assert_eq!(w.next_origin([0.0, 0.0]), None);
        assert_eq!(w.next_origin([10.0, 0.0]), None, "moved for a few steps");
        let next = w.next_origin([300.0, 0.0]).expect("never followed");
        assert_eq!(next, [256.0, 0.0]);
    }

    /// Without hysteresis a player standing on a boundary re-bakes the world on
    /// every step, which is the whole cost of the system paid continuously.
    #[test]
    fn a_window_does_not_thrash_on_the_boundary() {
        let mut w = Window::new(256.0, 128.0);
        w.origin = [128.0, 0.0];
        // Right on the line between two legal origins, jittering across it.
        let mut shifts = 0;
        for i in 0..200 {
            let jitter = if i % 2 == 0 { 0.4 } else { -0.4 };
            if let Some(next) = w.next_origin([192.0 + jitter, 0.0]) {
                w.origin = next;
                shifts += 1;
            }
        }
        assert!(shifts <= 1, "re-baked {shifts} times standing still");
    }

    /// Walking a long way must leave the player inside the window at every step,
    /// or there is ground with no collider under them.
    #[test]
    fn a_walk_is_always_on_baked_ground() {
        let mut w = Window::new(256.0, 128.0);
        let mut at = [0.0f32, 0.0];
        for step in 0..4000 {
            at[0] += 1.3;
            at[1] += (step as f32 * 0.01).sin() * 1.1;
            if let Some(next) = w.next_origin(at) {
                w.origin = next;
            }
            assert!(
                w.covers(at),
                "walked off the world at {at:?} on step {step}"
            );
        }
    }

    /// The same ground must bake identically however the player got there, or
    /// walking back somewhere shows a different world.
    #[test]
    fn arriving_from_either_side_gives_the_same_window() {
        let mut east = Window::new(256.0, 128.0);
        let mut west = Window::new(256.0, 128.0);
        let mut at = [0.0f32, 0.0];
        while at[0] < 512.0 {
            at[0] += 4.0;
            if let Some(n) = east.next_origin(at) {
                east.origin = n;
            }
        }
        let mut at = [1200.0f32, 0.0];
        west.origin = west.snap(at);
        while at[0] > 512.0 {
            at[0] -= 4.0;
            if let Some(n) = west.next_origin(at) {
                west.origin = n;
            }
        }
        assert_eq!(east.origin, west.origin, "history changed the world");
    }

    #[test]
    fn a_stride_wider_than_the_window_is_refused() {
        // It would leave ground between two bakes that neither covers.
        let w = Window::new(100.0, 4000.0);
        assert!(w.stride <= w.extent);
    }

    fn fnv1a(values: &[f32]) -> u64 {
        let mut h = 0xcbf2_9ce4_8422_2325_u64;
        for v in values {
            for byte in v.to_bits().to_le_bytes() {
                h ^= byte as u64;
                h = h.wrapping_mul(0x0000_0100_0000_01b3);
            }
        }
        h
    }

    #[test]
    fn raw_noise_is_bit_stable_across_platforms() {
        let p = HeightParams::default();
        let hills = make_noise(p.seed, p.hill_frequency, 4);
        let river = make_noise(p.seed + 7, p.river_wander_frequency, 5);
        let mut samples = Vec::with_capacity(2 * 33 * 33);
        for iy in 0..33 {
            for ix in 0..33 {
                let (x, z) = (-64.0 + ix as f32 * 4.0, -64.0 + iy as f32 * 4.0);
                samples.push(hills.get_noise_2d(x, z));
                samples.push(river.get_noise_2d(z, 0.0));
            }
        }
        assert_eq!(fnv1a(&samples), 0xbbff_9590_3d45_c884, "raw noise diverged");
    }

    #[test]
    fn baked_heights_are_bit_stable_across_platforms() {
        let p = HeightParams::default();
        let grid = HeightGen::new(&p).bake(64.0, 33);
        assert_eq!(
            fnv1a(&grid),
            0x7709_c812_0bc2_a47c,
            "baked heights diverged"
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

/// A box of built structure, in world space.
///
/// Everything the world puts on top of the ground -- a bridge deck, a city wall, a
/// quay -- is a list of these on both sides of the wire: the client draws timber and
/// stone over them, the server gives them to the solver as cuboids. Both read the
/// same numbers from the plan that produced them, which is the only way they can
/// agree on where the structure is -- and a disagreement there is a player walking
/// on planks their own server thinks are river.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Slab {
    pub centre: [f32; 3],
    pub half_extents: [f32; 3],
    /// Rotation about the vertical-plane axis, xyzw. The deck is flat, but the
    /// approaches run downhill, and a stair of axis-aligned boxes under a sloped
    /// timber surface is a stair the client cannot see.
    pub rot: [f32; 4],
}

impl Slab {
    pub fn flat(centre: [f32; 3], half_extents: [f32; 3]) -> Self {
        Self {
            centre,
            half_extents,
            rot: [0.0, 0.0, 0.0, 1.0],
        }
    }
}

pub const ROAD_SEGMENT_STEP: f32 = 4.0;
const ROAD_STRAIGHT_APPROACH: f32 = 30.0;

/// Distance from a point to a segment, which is the road's whole shape.
pub fn seg_distance(p: [f32; 2], a: [f32; 2], b: [f32; 2]) -> f32 {
    let ab = [b[0] - a[0], b[1] - a[1]];
    let denom = (ab[0] * ab[0] + ab[1] * ab[1]).max(1e-6);
    let t = (((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / denom).clamp(0.0, 1.0);
    let d = [p[0] - (a[0] + ab[0] * t), p[1] - (a[1] + ab[1] * t)];
    (d[0] * d[0] + d[1] * d[1]).sqrt()
}

/// The trunk road across the valley, and how much of the ground it claims.
#[derive(Clone, Debug)]
pub struct RoadPlan {
    segments: Vec<([f32; 2], [f32; 2])>,
    pub width: f32,
    pub crossing: [f32; 2],
    pub half_span: f32,
    bridge_reach: f32,
}

impl RoadPlan {
    pub fn new(
        hgen: &HeightGen,
        origin: [f32; 2],
        extent: f32,
        water_level: f32,
        width: f32,
    ) -> Self {
        let crossing_z = 0.0;
        let river_x = hgen.river_x(crossing_z);

        let mut half_span = 4.0;
        while half_span < extent * 0.25 {
            let left = hgen.height(river_x - half_span, crossing_z);
            let right = hgen.height(river_x + half_span, crossing_z);
            if left > water_level + 0.75 && right > water_level + 0.75 {
                break;
            }
            half_span += 0.5;
        }
        half_span += 2.5;

        let limit = extent - 6.0;
        let mut points: Vec<[f32; 2]> = Vec::new();
        let from = ((origin[0] - limit) / ROAD_SEGMENT_STEP).floor() * ROAD_SEGMENT_STEP;
        let to = origin[0] + limit + ROAD_SEGMENT_STEP;
        let mut x = from;
        while x <= to {
            let hold = half_span + ROAD_STRAIGHT_APPROACH;
            let away = (((x - river_x).abs() - hold) / 18.0).clamp(0.0, 1.0);
            let bend = away * away * (3.0 - 2.0 * away);
            points.push([x, crossing_z + hgen.wander(x) * 26.0 * bend]);
            x += ROAD_SEGMENT_STEP;
        }

        let mut segments: Vec<([f32; 2], [f32; 2])> =
            points.windows(2).map(|w| (w[0], w[1])).collect();
        segments.extend(landmark_roads(hgen, origin, extent));
        Self {
            segments,
            width,
            crossing: [river_x, crossing_z],
            half_span,
            bridge_reach: half_span + 1.0,
        }
    }

    pub fn set_bridge_reach(&mut self, reach: f32) {
        self.bridge_reach = reach;
    }

    pub fn segments(&self) -> &[([f32; 2], [f32; 2])] {
        &self.segments
    }

    pub fn distance(&self, p: [f32; 2]) -> f32 {
        self.segments
            .iter()
            .map(|(a, b)| seg_distance(p, *a, *b))
            .fold(f32::MAX, f32::min)
    }

    pub fn on_bridge(&self, p: [f32; 2]) -> bool {
        (p[0] - self.crossing[0]).abs() < self.bridge_reach
            && (p[1] - self.crossing[1]).abs() < self.width * 2.2
    }

    pub fn paint_reach(&self) -> f32 {
        self.width * 1.9
    }

    /// How much of the carriageway covers a point, 0 to 1.
    pub fn paint(&self, hgen: &HeightGen, water_level: f32, p: [f32; 2]) -> f32 {
        if self.on_bridge(p) {
            return 0.0;
        }
        let reach = self.paint_reach();
        let d = self.distance(p);
        if d > reach || hgen.height(p[0], p[1]) < water_level + 0.35 {
            return 0.0;
        }
        let t = 1.0 - (d / reach).clamp(0.0, 1.0);
        t * t * (3.0 - 2.0 * t)
    }
}

/// The roads that exist because somebody built something at both ends.
///
/// The trunk is one line across the valley with one crossing on it, which is a road
/// that goes nowhere the moment you walk away from `z = 0`. These are the ones that
/// answer for the rest of the world: every capital is joined to the nearest harbour
/// standing on its own bank, so a road always runs between a place that makes things
/// and the water they leave by.
///
/// Same bank deliberately. There is one crossing in the whole world and it is not
/// where these are, so a road to the far side would be a road into the river.
///
/// Which capitals are considered is a fixed radius rather than the window: a road is
/// long, and a capital whose gateway is well outside a window still lays carriageway
/// across the middle of it. Segments are then kept by how near they come to the ground
/// being baked, which is a question about the segment and the ground and not about
/// which window asked -- so two windows overlapping the same stretch of road paint it
/// in the same place.
const SPUR_SCAN_CELLS: i32 = 5;

/// How far a road may bow off the straight line between its two ends.
const SPUR_BOW: f32 = 40.0;

fn landmark_roads(hgen: &HeightGen, origin: [f32; 2], extent: f32) -> Vec<([f32; 2], [f32; 2])> {
    let scan = crate::landmark::CELL * SPUR_SCAN_CELLS as f32;
    let near = extent + ROAD_SEGMENT_STEP * 2.0;
    let mut out = Vec::new();

    for mark in crate::landmark::in_window(hgen.seed(), hgen, origin, scan) {
        if mark.kind != crate::landmark::LandmarkKind::Capital {
            continue;
        }
        let from = mark.gate_mouth();
        let side = if mark.centre[0] < 0.0 { -1.0 } else { 1.0 };
        let to =
            crate::landmark::nearest_harbour_on_side(hgen.seed(), hgen, mark.centre, side).centre;

        let run = ((to[0] - from[0]).powi(2) + (to[1] - from[1]).powi(2)).sqrt();
        if run < ROAD_SEGMENT_STEP {
            continue;
        }
        // Most roads in the scan radius pass nowhere near this window, and stepping
        // one is a noise sample every four metres over kilometres. The road bows off
        // its straight line by at most SPUR_BOW, so a straight line that clears the
        // window by more than that plus the window's own corner cannot reach it.
        if seg_distance(origin, from, to) > near * std::f32::consts::SQRT_2 + SPUR_BOW {
            continue;
        }
        let steps = (run / ROAD_SEGMENT_STEP).ceil() as i32;
        let mut prev = from;
        for i in 1..=steps {
            let t = i as f32 / steps as f32;
            // Bowed rather than ruled, and pinned straight at both ends so it meets
            // the gateway and the quay square on rather than at an angle.
            let bow = (t * std::f32::consts::PI).sin() * hgen.wander(from[0] + run * t) * SPUR_BOW;
            let nx = from[0] + (to[0] - from[0]) * t - (to[1] - from[1]) / run * bow;
            let nz = from[1] + (to[1] - from[1]) * t + (to[0] - from[0]) / run * bow;
            let next = [nx, nz];
            let touches =
                |p: [f32; 2]| (p[0] - origin[0]).abs() <= near && (p[1] - origin[1]).abs() <= near;
            if touches(prev) || touches(next) {
                out.push((prev, next));
            }
            prev = next;
        }
    }
    out
}

pub fn hash32(mut x: u32) -> u32 {
    x ^= x >> 16;
    x = x.wrapping_mul(0x7feb352d);
    x ^= x >> 15;
    x = x.wrapping_mul(0x846ca68b);
    x ^= x >> 16;
    x
}

pub fn randf(state: &mut u32) -> f32 {
    *state = hash32(*state);
    (*state >> 8) as f32 / 16_777_216.0
}

/// A scatter cell addressed by where it sits in the world rather than by its
/// place in the current window.
#[derive(Clone, Copy, Debug)]
pub struct ScatterGrid {
    pub size: f32,
    pub origin: [f32; 2],
    pub extent: f32,
}

impl ScatterGrid {
    pub fn new(size: f32, origin: [f32; 2], extent: f32) -> Self {
        Self {
            size: size.max(0.01),
            origin,
            extent,
        }
    }

    pub fn cells(&self) -> i32 {
        ((self.extent * 2.0) / self.size).ceil() as i32 + 1
    }

    fn base(&self) -> (i32, i32) {
        (
            ((self.origin[0] - self.extent) / self.size).floor() as i32,
            ((self.origin[1] - self.extent) / self.size).floor() as i32,
        )
    }

    pub fn global(&self, ix: i32, iz: i32) -> (i32, i32) {
        let (bx, bz) = self.base();
        (bx + ix, bz + iz)
    }

    pub fn seed(&self, base: u32, ix: i32, iz: i32) -> u32 {
        let (gx, gz) = self.global(ix, iz);
        hash32(
            base.wrapping_add(hash32(gx as u32).wrapping_mul(31))
                .wrapping_add(hash32(gz as u32).wrapping_mul(2_654_435_761)),
        )
    }

    pub fn centre(&self, ix: i32, iz: i32) -> (f32, f32) {
        let (gx, gz) = self.global(ix, iz);
        ((gx as f32 + 0.5) * self.size, (gz as f32 + 0.5) * self.size)
    }

    pub fn inside(&self, x: f32, z: f32, margin: f32) -> bool {
        (x - self.origin[0]).abs() <= self.extent - margin
            && (z - self.origin[1]).abs() <= self.extent - margin
    }
}

/// One stone the world put somewhere, before anything decides how to draw it.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct StonePlacement {
    pub pos: [f32; 2],
    pub scale: f32,
    pub yaw: f32,
    pub variant: u8,
    /// Footprint used for spacing, and close enough to the drawn hull for a
    /// flow field to route around.
    pub radius: f32,
    pub cell: (i32, i32),
    pub companion: u32,
}

/// Defaults must match `QStoneField`'s exported defaults.
#[derive(Clone, Copy, Debug)]
pub struct StoneScatter {
    pub seed: i32,
    pub variants: usize,
    pub grid_size: f32,
    pub patch_threshold: f32,
    pub patch_frequency: f32,
    pub scale_min: f32,
    pub scale_max: f32,
}

impl Default for StoneScatter {
    fn default() -> Self {
        Self {
            seed: 24601,
            variants: 12,
            grid_size: 22.0,
            patch_threshold: 0.3,
            patch_frequency: 0.025,
            scale_min: 1.6,
            scale_max: 3.2,
        }
    }
}

impl StoneScatter {
    /// Every stone standing in a window, in the order the field inserts them.
    ///
    /// The draw order inside a cell is load bearing: every companion takes its
    /// numbers from the stream before any rejection test, so a companion refused
    /// for being outside this window cannot shift the ones after it.
    pub fn place(
        &self,
        hgen: &HeightGen,
        road: Option<&RoadPlan>,
        origin: [f32; 2],
        extent: f32,
        water_level: f32,
    ) -> Vec<StonePlacement> {
        let mut noise = FastNoiseLite::with_seed(self.seed + 3);
        noise.set_noise_type(Some(NoiseType::OpenSimplex2S));
        noise.set_frequency(Some(self.patch_frequency));

        let grid = ScatterGrid::new(self.grid_size, origin, extent);
        let cells = grid.cells();
        let variants = self.variants.max(1);
        let mut out: Vec<StonePlacement> = Vec::new();
        let mut placed: Vec<(f32, f32, f32)> = Vec::new();

        let on_road = |x: f32, z: f32| -> bool {
            road.is_some_and(|r| r.paint(hgen, water_level, [x, z]) > 0.12)
        };
        let overlaps = |placed: &Vec<(f32, f32, f32)>, x: f32, z: f32, r: f32| -> bool {
            placed.iter().any(|(px, pz, pr)| {
                let dx = px - x;
                let dz = pz - z;
                dx * dx + dz * dz < ((pr + r) * 0.92).powi(2)
            })
        };

        for iz in 0..cells {
            for ix in 0..cells {
                let mut state = grid.seed(self.seed as u32, ix, iz);
                let jx = (randf(&mut state) - 0.5) * (self.grid_size - 5.0);
                let jz = (randf(&mut state) - 0.5) * (self.grid_size - 5.0);
                let (cx, cz) = grid.centre(ix, iz);
                let (x, z) = (cx + jx, cz + jz);
                if !grid.inside(x, z, 5.0) {
                    continue;
                }
                let slope = (hgen.height(x + 1.0, z) - hgen.height(x - 1.0, z))
                    .abs()
                    .max((hgen.height(x, z + 1.0) - hgen.height(x, z - 1.0)).abs())
                    * 0.5;
                if noise.get_noise_2d(x, z) < self.patch_threshold && slope < 0.32 {
                    continue;
                }
                if on_road(x, z) {
                    continue;
                }
                if hgen.height(x, z) < water_level + 0.4 {
                    continue;
                }
                let scale = self.scale_min + randf(&mut state) * (self.scale_max - self.scale_min);
                let radius = scale * 0.85;
                if overlaps(&placed, x, z, radius) {
                    continue;
                }
                placed.push((x, z, radius));
                let yaw = randf(&mut state) * std::f32::consts::TAU;
                let variant = ((randf(&mut state) * variants as f32) as usize).min(variants - 1);
                let cell = grid.global(ix, iz);
                out.push(StonePlacement {
                    pos: [x, z],
                    scale,
                    yaw,
                    variant: variant as u8,
                    radius,
                    cell,
                    companion: 0,
                });

                let companions = (randf(&mut state) * 3.0) as usize;
                for companion in 0..companions {
                    let cscale = scale * (0.28 + randf(&mut state) * 0.27);
                    let az = randf(&mut state) * std::f32::consts::TAU;
                    let spread = randf(&mut state);
                    let cyaw = randf(&mut state) * std::f32::consts::TAU;
                    let cvariant =
                        ((randf(&mut state) * variants as f32) as usize).min(variants - 1);

                    let cradius = cscale * 0.85;
                    let dist = (radius + cradius) * (1.15 + spread * 0.5);
                    let ccx = x + libm::cosf(az) * dist;
                    let ccz = z + libm::sinf(az) * dist;
                    if !grid.inside(ccx, ccz, 5.0) {
                        continue;
                    }
                    if on_road(ccx, ccz) {
                        continue;
                    }
                    if hgen.height(ccx, ccz) < water_level + 0.4 {
                        continue;
                    }
                    if overlaps(&placed, ccx, ccz, cradius) {
                        continue;
                    }
                    placed.push((ccx, ccz, cradius));
                    out.push(StonePlacement {
                        pos: [ccx, ccz],
                        scale: cscale,
                        yaw: cyaw,
                        variant: cvariant as u8,
                        radius: cradius,
                        cell,
                        companion: companion as u32 + 1,
                    });
                }
            }
        }
        out
    }

    /// Flat `x, z, radius` triples, the shape a flow field stamps.
    pub fn discs(placements: &[StonePlacement]) -> Vec<f32> {
        let mut out = Vec::with_capacity(placements.len() * 3);
        for p in placements {
            out.push(p.pos[0]);
            out.push(p.pos[1]);
            out.push(p.radius);
        }
        out
    }
}

/// Grade the approach is laid down to before it stops descending.
const RAMP_GRADE: f32 = 0.15;

/// Half-thickness of the deck and of the approach timbers under it.
const DECK_HALF_T: f32 = 0.11;

/// Thickness of the timber the approach is decked with.
const PLANK_T: f32 = 0.18;

/// How far a kerb rail sits above the middle of the timber it guards.
const RAIL_UP: f32 = 0.62;

/// Where the one river crossing is and how big its deck is.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct BridgePlan {
    pub crossing: [f32; 2],
    pub half_span: f32,
    pub deck_y: f32,
    pub deck_half: f32,
    pub half_width: f32,
}

/// The crossing measured for a flow field: what to close, what to reopen, and how
/// high the deck a body may be standing under sits.
///
/// Derived rather than authored, so the field and the timber cannot drift apart.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct BridgeFootprint {
    /// Ends of the whole structure, reaching past the abutments onto dry land.
    pub from: [f32; 2],
    pub to: [f32; 2],
    /// The line that may be walked.
    pub walk_half_width: f32,
    /// The outside of the structure. The kerbs sit just inside the deck's half
    /// width and the abutment flares a little wider.
    pub solid_half_width: f32,
    /// The raised span alone, which is the part a body can be underneath.
    pub deck_from: [f32; 2],
    pub deck_to: [f32; 2],
    pub deck_y: f32,
}

impl BridgePlan {
    /// Reproduces the road's own span search, so the deck cannot drift from the
    /// carriageway that runs onto it.
    ///
    /// `extent` bounds the search, so it must be the same on both sides. That is
    /// what the terrain shape in the join handshake is for.
    pub fn new(hgen: &HeightGen, extent: f32, water_level: f32, road_width: f32) -> Self {
        let crossing_z = 0.0;
        let river_x = hgen.river_x(crossing_z);

        let mut half_span = 4.0;
        while half_span < extent * 0.25 {
            let left = hgen.height(river_x - half_span, crossing_z);
            let right = hgen.height(river_x + half_span, crossing_z);
            if left > water_level + 0.75 && right > water_level + 0.75 {
                break;
            }
            half_span += 0.5;
        }
        half_span += 2.5;

        let mut crest = hgen
            .height(river_x - half_span, crossing_z)
            .max(hgen.height(river_x + half_span, crossing_z));
        let corridor = half_span + 7.0;
        let mut s = -corridor;
        while s <= corridor {
            crest = crest.max(hgen.height(river_x + s, crossing_z));
            s += 1.5;
        }

        Self {
            crossing: [river_x, crossing_z],
            half_span,
            deck_y: crest.max(water_level + 1.9) + 0.35,
            deck_half: half_span + 1.8,
            half_width: road_width * 0.55,
        }
    }

    /// The solid parts, for anything that has to stop a body: the deck itself and
    /// a kerb down each side so nobody walks off into the river.
    pub fn slabs(&self) -> [Slab; 3] {
        let [cx, cz] = self.crossing;
        let rail = self.half_width - 0.08;
        [
            Slab::flat(
                [cx, self.deck_y, cz],
                [self.deck_half, DECK_HALF_T, self.half_width],
            ),
            Slab::flat(
                [cx, self.deck_y + RAIL_UP, cz - rail],
                [self.deck_half, 0.07, 0.07],
            ),
            Slab::flat(
                [cx, self.deck_y + RAIL_UP, cz + rail],
                [self.deck_half, 0.07, 0.07],
            ),
        ]
    }

    /// How far the timber reaches from the crossing on one side, deck and approach
    /// together.
    ///
    /// `deck_half` is only the raised span. The approach carries on well past it as a
    /// railed causeway with a skirt down to the ground, so anything treating the deck
    /// as the whole structure -- a flow field, say -- routes bodies into the side of a
    /// ramp and leaves them grinding there.
    pub fn reach(&self, hgen: &HeightGen, side: f32) -> f32 {
        self.ramp_path(hgen, side)
            .last()
            .map(|p| (p[0] - self.crossing[0]).abs())
            .unwrap_or(self.deck_half)
    }

    /// The crossing as a thing with sides, which is what a flow field needs.
    ///
    /// A field told only about the line to walk routes bodies through the side of a
    /// ramp, because the approaches are railed causeways with a skirt down to the
    /// ground and most of what the bridge puts in the way is solid.
    pub fn footprint(&self, hgen: &HeightGen) -> BridgeFootprint {
        let [cx, cz] = self.crossing;
        BridgeFootprint {
            from: [cx - self.reach(hgen, -1.0), cz],
            to: [cx + self.reach(hgen, 1.0), cz],
            walk_half_width: self.half_width,
            solid_half_width: self.half_width + 0.25,
            deck_from: [cx - self.deck_half, cz],
            deck_to: [cx + self.deck_half, cz],
            deck_y: self.deck_y,
        }
    }

    /// The centreline of one approach, from the deck edge down to the ground, as the
    /// timber surface a player actually walks on.
    ///
    /// `side` is -1 or 1. The first point is the deck edge; the last is driven into the
    /// ground, where the heightfield takes over. Shared rather than derived twice: the
    /// client lays its planks along these points and the server puts its collision under
    /// them, so the ramp cannot be solid in one sim and empty in the other.
    pub fn ramp_path(&self, hgen: &HeightGen, side: f32) -> Vec<[f32; 3]> {
        let [cx, cz] = self.crossing;
        let half_w = self.half_width;
        let ground_hi = |x: f32| -> f32 {
            let mut hi = f32::MIN;
            for k in [-1.0f32, -0.5, 0.0, 0.5, 1.0] {
                hi = hi.max(hgen.height(x, cz + half_w * k));
            }
            hi
        };

        let x_start = self.deck_half * side;
        let y_start = self.deck_y + DECK_HALF_T;

        let mut ramp_run = 3.0f32;
        for k in 0..16 {
            let r = 3.0 + k as f32 * 1.6;
            ramp_run = r;
            if (y_start - hgen.height(cx + x_start + side * r, cz)).max(0.0) / r <= RAMP_GRADE {
                break;
            }
        }
        let steps = ((ramp_run / 1.1).ceil() as i32).clamp(4, 26);

        let mut path = Vec::with_capacity(steps as usize + 1);
        path.push([cx + x_start, y_start, cz]);
        for i in 1..=steps {
            let t = i as f32 / steps as f32;
            let last = i == steps;
            let x = x_start + side * (t * ramp_run + if last { 0.7 } else { 0.0 });
            let px = cx + x;
            let ground = hgen.height(px, cz);
            let y = if last {
                ground - 0.08
            } else {
                let lip = 0.06 * (1.0 - t);
                (y_start + (ground + lip - y_start) * (t * t * (3.0 - 2.0 * t)))
                    .min(y_start - 0.01)
                    .max(ground_hi(px) + 0.09)
            };
            path.push([px, y, cz]);
        }
        path
    }

    /// Collision for both approaches: one box per segment of [`ramp_path`], tilted onto
    /// the segment so its top face is the surface the client drew.
    ///
    /// Without these the deck ends in mid-air as far as the solver is concerned. The
    /// ground under an approach is a good half metre below the timber it carries, so a
    /// player who walked off the deck would be held up by the client and dropped to the
    /// heightfield by the host — the correction yank the shared deck exists to prevent,
    /// moved to the ramp.
    pub fn ramp_slabs(&self, hgen: &HeightGen) -> Vec<Slab> {
        let mut slabs = Vec::new();
        for side in [-1.0f32, 1.0] {
            let path = self.ramp_path(hgen, side);
            for pair in path.windows(2) {
                // Always taken left to right. A box is symmetric, so the orientation is
                // the same either way, but the half-thickness is stepped off along the
                // box's own down axis -- and on the far approach, whose segments run in
                // -x, that axis is up unless the segment is turned around first.
                let (a, b) = if pair[1][0] >= pair[0][0] {
                    (pair[0], pair[1])
                } else {
                    (pair[1], pair[0])
                };
                let (dx, dy) = (b[0] - a[0], b[1] - a[1]);
                let len = (dx * dx + dy * dy).sqrt();
                if len <= f32::EPSILON {
                    continue;
                }
                let angle = libm::atan2f(dy, dx);
                let (s, c) = (libm::sinf(angle), libm::cosf(angle));
                slabs.push(Slab {
                    centre: [
                        (a[0] + b[0]) * 0.5 + s * DECK_HALF_T,
                        (a[1] + b[1]) * 0.5 - c * DECK_HALF_T,
                        a[2],
                    ],
                    half_extents: [len * 0.5, DECK_HALF_T, self.half_width],
                    rot: [0.0, 0.0, libm::sinf(angle * 0.5), libm::cosf(angle * 0.5)],
                });
            }
        }
        slabs
    }

    /// Fills the causeway under each approach, from its timber down into the bank.
    ///
    /// [`ramp_slabs`](Self::ramp_slabs) is only the walking surface, a plank's thickness
    /// of it. The client draws the approach as a solid-sided embankment buried in the
    /// ground, so with the surface alone the whole interior is a room a body can walk
    /// into from the side and stand inside the drawn timber.
    pub fn ramp_skirt_slabs(&self, hgen: &HeightGen) -> Vec<Slab> {
        let [_, cz] = self.crossing;
        let mut slabs = Vec::new();
        for side in [-1.0f32, 1.0] {
            let path = self.ramp_path(hgen, side);
            for pair in path.windows(2) {
                let (a, b) = (pair[0], pair[1]);
                let hx = (b[0] - a[0]).abs() * 0.5;
                if hx <= f32::EPSILON {
                    continue;
                }
                let top = a[1].min(b[1]) - DECK_HALF_T;
                let floor = self.skirt_floor(hgen, a).min(self.skirt_floor(hgen, b));
                if top <= floor {
                    continue;
                }
                slabs.push(Slab::flat(
                    [(a[0] + b[0]) * 0.5, (top + floor) * 0.5, cz],
                    [hx, (top - floor) * 0.5, self.half_width],
                ));
            }
        }
        slabs
    }

    /// How far below a point on the approach the drawn embankment reaches.
    fn skirt_floor(&self, hgen: &HeightGen, at: [f32; 3]) -> f32 {
        let mut lo = f32::MAX;
        for k in [-1.0f32, -0.5, 0.0, 0.5, 1.0] {
            lo = lo.min(hgen.height(at[0], at[2] + (self.half_width + 0.2) * k));
        }
        (at[1] - PLANK_T).min(lo - 0.2)
    }

    /// Kerb rails down both sides of both approaches, matching the deck's own.
    ///
    /// The raised span is railed by [`slabs`](Self::slabs) but the causeways leading
    /// onto it never were, so a body could walk off the side of an approach the client
    /// had drawn a railing along.
    pub fn ramp_rail_slabs(&self, hgen: &HeightGen) -> Vec<Slab> {
        let rail = self.half_width - 0.08;
        let mut slabs = Vec::new();
        for deck in self.ramp_slabs(hgen) {
            for side in [-1.0f32, 1.0] {
                slabs.push(Slab {
                    centre: [
                        deck.centre[0],
                        deck.centre[1] + RAIL_UP,
                        deck.centre[2] + rail * side,
                    ],
                    half_extents: [deck.half_extents[0], 0.07, 0.07],
                    rot: deck.rot,
                });
            }
        }
        slabs
    }

    /// The stone abutment each approach lands on, as one box per bank.
    pub fn abutment_slabs(&self, hgen: &HeightGen) -> [Slab; 2] {
        let [cx, cz] = self.crossing;
        let hx = (self.deck_half - self.half_span) * 0.5;
        let mut out = [Slab::flat([0.0; 3], [0.0; 3]); 2];
        for (i, side) in [-1.0f32, 1.0].into_iter().enumerate() {
            let x = cx + (self.half_span + hx) * side;
            let top = self.deck_y - 0.1;
            let h = ((top - (hgen.height(x, cz) - 1.4)) * 0.5).max(0.3);
            out[i] = Slab::flat([x, top - h, cz], [hx, h, self.half_width + 0.22]);
        }
        out
    }

    /// True when the crossing is close enough to a window to belong to it.
    pub fn in_window(&self, origin: [f32; 2], extent: f32) -> bool {
        let reach = self.half_span + 40.0;
        (self.crossing[0] - origin[0]).abs() <= extent + reach
            && (self.crossing[1] - origin[1]).abs() <= extent + reach
    }
}

#[cfg(test)]
mod scatter_tests {
    use super::*;

    fn hgen() -> HeightGen {
        HeightGen::new(&HeightParams::default())
    }

    #[test]
    fn the_same_seed_places_the_same_stones() {
        let g = hgen();
        let s = StoneScatter::default();
        assert_eq!(
            s.place(&g, None, [0.0, 0.0], 128.0, -1.4),
            s.place(&g, None, [0.0, 0.0], 128.0, -1.4),
            "client and server must agree on where the rocks are"
        );
    }

    /// The property a sliding world rests on: walking away and back must not
    /// rearrange the ground, so a cell keeps its stone whichever window sees it.
    #[test]
    fn overlapping_windows_agree_on_shared_stones() {
        let g = hgen();
        let s = StoneScatter::default();
        let a = s.place(&g, None, [0.0, 0.0], 128.0, -1.4);
        let b = s.place(&g, None, [64.0, 0.0], 128.0, -1.4);

        let mut shared = 0;
        for from_a in &a {
            let Some(from_b) = b
                .iter()
                .find(|p| p.cell == from_a.cell && p.companion == from_a.companion)
            else {
                continue;
            };
            assert_eq!(
                from_a.pos[0].to_bits(),
                from_b.pos[0].to_bits(),
                "cell {:?} moved between windows",
                from_a.cell
            );
            assert_eq!(from_a.scale.to_bits(), from_b.scale.to_bits());
            assert_eq!(from_a.variant, from_b.variant);
            shared += 1;
        }
        assert!(shared > 20, "windows barely overlapped, compared {shared}");
    }

    #[test]
    fn a_different_seed_places_different_stones() {
        let g = hgen();
        let a = StoneScatter::default();
        let b = StoneScatter {
            seed: 4242,
            ..StoneScatter::default()
        };
        assert_ne!(
            a.place(&g, None, [0.0, 0.0], 128.0, -1.4),
            b.place(&g, None, [0.0, 0.0], 128.0, -1.4)
        );
    }

    #[test]
    fn stones_keep_off_the_carriageway() {
        let g = hgen();
        let road = RoadPlan::new(&g, [0.0, 0.0], 128.0, -1.4, 3.2);
        let s = StoneScatter::default();
        for p in s.place(&g, Some(&road), [0.0, 0.0], 128.0, -1.4) {
            assert!(
                road.paint(&g, -1.4, p.pos) <= 0.12,
                "stone at {:?} is standing in the road",
                p.pos
            );
        }
    }

    #[test]
    fn stones_stay_out_of_the_river() {
        let g = hgen();
        let s = StoneScatter::default();
        for p in s.place(&g, None, [0.0, 0.0], 128.0, -1.4) {
            assert!(g.height(p.pos[0], p.pos[1]) >= -1.4 + 0.4);
        }
    }

    #[test]
    fn placed_stones_do_not_sit_inside_each_other() {
        let g = hgen();
        let s = StoneScatter::default();
        let placed = s.place(&g, None, [0.0, 0.0], 128.0, -1.4);
        for (i, a) in placed.iter().enumerate() {
            for b in &placed[i + 1..] {
                let dx = a.pos[0] - b.pos[0];
                let dz = a.pos[1] - b.pos[1];
                let gap = (dx * dx + dz * dz).sqrt();
                assert!(
                    gap >= (a.radius + b.radius) * 0.92 - 1e-3,
                    "stones overlap: {gap} against {} and {}",
                    a.radius,
                    b.radius
                );
            }
        }
    }
}
