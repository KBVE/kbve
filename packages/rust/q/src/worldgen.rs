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

/// The windows a world needs baked right now, one per cluster of players.
///
/// A single window follows one player, which is exactly the wrong shape for a
/// server: two players a kilometre apart cannot both be inside it, so one of
/// them is standing on nothing. Rendering does not have this problem -- a client
/// only ever draws around its own camera -- but ground truth does.
///
/// Regions snap to the same grid a [`Window`] does, so players near each other
/// share one and the cost is per crowd rather than per player.
#[derive(Clone, Debug, Default)]
pub struct Regions {
    live: Vec<[f32; 2]>,
}

impl Regions {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn origins(&self) -> &[[f32; 2]] {
        &self.live
    }

    /// Recomputes the set for where the players are now, and reports what
    /// changed so a caller can bake and drop only the difference.
    ///
    /// A region is kept while anyone is inside it at all, not merely nearest to
    /// it: dropping one out from under a player who has not yet reached the next
    /// is how a body falls through the world.
    pub fn update(&mut self, players: &[[f32; 2]], window: &Window) -> RegionChange {
        let mut wanted: Vec<[f32; 2]> = Vec::new();
        for p in players {
            // Somewhere already baked that covers this player is good enough,
            // and preferring it is what stops a walking player churning regions.
            let covered = self.live.iter().chain(wanted.iter()).any(|o| {
                (p[0] - o[0]).abs() < window.shift_at && (p[1] - o[1]).abs() < window.shift_at
            });
            if covered {
                continue;
            }
            let at = window.snap(*p);
            if !wanted.contains(&at) {
                wanted.push(at);
            }
        }
        // Anything still under somebody stays, whether or not it was chosen above.
        let mut keep: Vec<[f32; 2]> = self
            .live
            .iter()
            .copied()
            .filter(|o| {
                players.iter().any(|p| {
                    (p[0] - o[0]).abs() <= window.extent && (p[1] - o[1]).abs() <= window.extent
                })
            })
            .collect();
        let dropped: Vec<[f32; 2]> = self
            .live
            .iter()
            .copied()
            .filter(|o| !keep.contains(o))
            .collect();
        let added: Vec<[f32; 2]> = wanted.into_iter().filter(|o| !keep.contains(o)).collect();
        keep.extend(added.iter().copied());
        // Sorted, so two machines walking the same players agree on the order.
        keep.sort_by(|a, b| a[0].total_cmp(&b[0]).then(a[1].total_cmp(&b[1])));
        self.live = keep;
        RegionChange { added, dropped }
    }

    /// True when every player has ground under them.
    pub fn covers_all(&self, players: &[[f32; 2]], window: &Window) -> bool {
        players.iter().all(|p| {
            self.live.iter().any(|o| {
                (p[0] - o[0]).abs() <= window.extent && (p[1] - o[1]).abs() <= window.extent
            })
        })
    }
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct RegionChange {
    pub added: Vec<[f32; 2]>,
    pub dropped: Vec<[f32; 2]>,
}

impl RegionChange {
    pub fn is_empty(&self) -> bool {
        self.added.is_empty() && self.dropped.is_empty()
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

    /// The reason regions exist: one window cannot hold two players who are
    /// apart, and the one it drops is standing on nothing.
    #[test]
    fn two_players_far_apart_both_get_ground() {
        let w = Window::new(256.0, 128.0);
        let mut r = Regions::new();
        let players = [[0.0, 0.0], [4000.0, -2500.0]];
        let change = r.update(&players, &w);
        assert_eq!(change.added.len(), 2, "one window tried to cover both");
        assert!(r.covers_all(&players, &w));
    }

    /// A crowd is one region, or a full server pays per player for ground they
    /// are all standing on together.
    #[test]
    fn players_standing_together_share_one_region() {
        let w = Window::new(256.0, 128.0);
        let mut r = Regions::new();
        let players: Vec<[f32; 2]> = (0..16)
            .map(|i| [i as f32 * 3.0, (i % 4) as f32 * 3.0])
            .collect();
        r.update(&players, &w);
        assert_eq!(r.origins().len(), 1, "{:?}", r.origins());
        assert!(r.covers_all(&players, &w));
    }

    #[test]
    fn a_region_nobody_is_near_is_dropped() {
        let w = Window::new(256.0, 128.0);
        let mut r = Regions::new();
        r.update(&[[0.0, 0.0], [4000.0, 0.0]], &w);
        assert_eq!(r.origins().len(), 2);
        let change = r.update(&[[0.0, 0.0]], &w);
        assert_eq!(change.dropped.len(), 1, "kept ground nobody was on");
        assert_eq!(r.origins().len(), 1);
    }

    /// Ground must never be pulled out from under a player who has not yet
    /// reached the next region, whatever the snapping says is nearest.
    #[test]
    fn a_long_walk_never_leaves_anyone_in_the_air() {
        let w = Window::new(256.0, 128.0);
        let mut r = Regions::new();
        let mut a = [0.0f32, 0.0];
        let mut b = [1500.0f32, 900.0];
        for step in 0..3000 {
            a[0] += 1.7;
            b[1] -= 1.3;
            b[0] += (step as f32 * 0.02).sin() * 1.5;
            let players = [a, b];
            r.update(&players, &w);
            assert!(
                r.covers_all(&players, &w),
                "step {step}: {players:?} not covered by {:?}",
                r.origins()
            );
        }
    }

    /// Two servers given the same players must bake the same ground in the same
    /// order, or a rejoin sees a different world.
    #[test]
    fn regions_do_not_depend_on_player_order() {
        let w = Window::new(256.0, 128.0);
        let players = [[0.0, 0.0], [3000.0, 200.0], [-1800.0, 640.0]];
        let mut forward = Regions::new();
        forward.update(&players, &w);
        let mut backward = Regions::new();
        let mut flipped = players;
        flipped.reverse();
        backward.update(&flipped, &w);
        assert_eq!(forward.origins(), backward.origins());
    }

    /// A player pacing a boundary must not churn regions, which on a server is
    /// a re-bake and a collider swap every step.
    #[test]
    fn regions_do_not_churn_under_a_pacing_player() {
        let w = Window::new(256.0, 128.0);
        let mut r = Regions::new();
        r.update(&[[0.0, 0.0]], &w);
        let mut churn = 0;
        for i in 0..400 {
            let jitter = if i % 2 == 0 { 0.5 } else { -0.5 };
            let change = r.update(&[[64.0 + jitter, 0.0]], &w);
            if !change.is_empty() {
                churn += 1;
            }
        }
        assert_eq!(churn, 0, "re-baked {churn} times standing still");
    }

    #[test]
    fn no_players_means_no_ground() {
        let w = Window::new(256.0, 128.0);
        let mut r = Regions::new();
        r.update(&[[0.0, 0.0]], &w);
        let change = r.update(&[], &w);
        assert_eq!(change.dropped.len(), 1);
        assert!(r.origins().is_empty());
    }

    #[test]
    fn a_stride_wider_than_the_window_is_refused() {
        // It would leave ground between two bakes that neither covers.
        let w = Window::new(100.0, 4000.0);
        assert!(w.stride <= w.extent);
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
