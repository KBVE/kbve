//! The structure layer above the height function.
//!
//! [`crate::worldgen`] answers "how high is the ground here" from noise alone,
//! which is all a valley needs and is why its river is a noise band rather than
//! a river: nothing in a pointwise function knows where water goes.
//!
//! This module answers the question the other way round. It places *sinks* --
//! the ocean and lake cells water drains into -- and then derives the ground
//! from them, so drainage is a property the terrain is built out of rather than
//! one it is searched for afterwards. A world built this way cannot grow a
//! closed hollow for a river to die in, because the field has no interior
//! minimum to grow one at.
//!
//! Everything here is a pure function of world position and seed. There is no
//! global pass, no cached simulation and no domain boundary, so a client and a
//! server that share a seed share a world without exchanging a byte of it.

use fastnoise_lite::{FastNoiseLite, FractalType, NoiseType};

/// How many nested lattices roll for ocean. Each is [`RegionParams::level_scale`]
/// times coarser than the one below it, so level 0 is a cove, the top is a sea.
///
/// Scales are nested rather than flat because one lattice can only make water
/// bodies of one size, and a coastline made of identically sized bays reads as a
/// grid however hard the sites are jittered.
pub const OCEAN_LEVELS: usize = 3;

/// Cells scanned around a query for the fine lattices.
///
/// Two rings is one more than a nearest-site test needs at this jitter; the
/// extra is for the blend, which reaches past the nearest site and would pop as
/// a second one crossed the search edge.
const FINE_RINGS: i32 = 2;
/// Coarse levels are scanned less hard. Their spacing is already far larger than
/// the blend, so a second ring could not change the result.
const COARSE_RINGS: i32 = 1;

/// Separators that keep the several questions asked of one lattice cell from
/// answering each other: whether it holds water, where inside itself it sits,
/// and which scale is asking.
///
/// Constant on purpose, and not a secret of any kind. The world *is* the hash,
/// so these are as much a part of it as the seed -- deriving them from anything
/// per-run, or hiding them, would mean two machines on one seed no longer agree
/// on where the sea is.
const STREAM_JITTER: u32 = 0x9e37_79b9;
const STREAM_OCEAN: u32 = 0x85eb_ca6b;
const STREAM_LEVEL: u32 = 0xc2b2_ae35;

/// What a body of water at the bottom of a drainage is.
///
/// Both kinds sit at the same surface height, which is not a simplification of
/// convenience: sinks at differing heights put a step in the ground along every
/// watershed between them, because the two cones meeting there disagree about
/// where they start. Endorheic basins on Earth sit at or below sea level anyway
/// -- the Caspian at -28 m, the Dead Sea at -430 m -- so the constraint and the
/// geography happen to want the same thing.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SinkKind {
    /// Rolled from the seed. May not exist anywhere nearby, and that is allowed.
    Ocean,
    /// Placed unconditionally on the coarse guarantee lattice. This is what lets
    /// ocean stay optional: drainage needs *a* sink within reach, not a sea.
    Lake,
}

/// One body of water, and the cone of ground rising out of it.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Sink {
    pub pos: [f32; 2],
    /// Where the shoreline sits before detail roughens it: ground reaches sea
    /// level exactly this far from `pos`.
    pub radius: f32,
    pub kind: SinkKind,
    pub level: u8,
    pub cell: (i32, i32),
}

/// Three of these numbers hold the drainage up between them, and the tests in
/// this module assert the relations rather than the values:
///
/// - `detail_amplitude` against `slope`, so noise cannot out-climb the fall
///   toward a sink ([`RegionGen::detail_gradient`] against
///   [`RegionGen::effective_slope`]);
/// - `warp_amplitude` against `warp_frequency`, so bending the lattice does not
///   cancel that fall ([`RegionGen::warp_gradient`] under 1);
/// - `detail_guard`, which covers the watersheds where the first relation
///   cannot hold whatever the amplitude.
///
/// Change one and the ground may still look right while quietly growing hollows
/// that water cannot leave, which is why they are tested and not just tuned.
#[derive(Clone, Copy, Debug)]
pub struct RegionParams {
    pub seed: i32,
    /// Height of every water surface in the world.
    pub sea_level: f32,
    /// Metres of rise per metre away from a sink.
    ///
    /// This is the load-bearing number. It has to out-climb the steepest slope
    /// detail noise can add, or detail carves a hollow the drainage cannot leave
    /// and the guarantee is gone. Raising it buys safety with relief: the whole
    /// world gets steeper.
    pub slope: f32,
    /// Spacing of the finest ocean lattice, metres.
    pub ocean_cell: f32,
    /// Spacing multiplier between ocean levels.
    pub level_scale: f32,
    /// Odds a cell on any ocean level holds water, 0 to 1.
    pub ocean_chance: f32,
    /// Ocean radius as a fraction of its level's spacing, so a coarse sea is
    /// wide in the same proportion its lattice is.
    pub ocean_radius_frac: f32,
    /// Spacing of the lattice that guarantees a sink, metres. This is the `R`
    /// that bounds both basin size and relief.
    pub lake_cell: f32,
    pub lake_radius: f32,
    /// Site displacement inside a cell, as a fraction of spacing. At 0 the
    /// lattice is visible as a grid; at 0.5 sites from non-adjacent cells can
    /// out-compete the near ones and the ring scan has to widen.
    pub jitter: f32,
    /// Width of the smooth minimum where two sinks meet, metres. Zero leaves a
    /// crease along every watershed.
    pub blend: f32,
    /// How close the two lowest cones have to be, in metres, before detail noise
    /// starts being faded out.
    ///
    /// This is the one place the no-pit argument needs help. Away from a
    /// watershed the base falls toward its sink at `slope` and detail cannot
    /// out-climb it. On a watershed the two cones cancel, and at a saddle
    /// between sinks they cancel completely -- the base gradient is zero there
    /// as a matter of geometry, not of tuning, so no amplitude small enough to
    /// be safe exists. Fading detail out as the cones converge hands those
    /// places back to the base field, where a saddle is a clean pass that water
    /// runs off either side of rather than a rim it can be trapped behind.
    pub detail_guard: f32,
    pub warp_amplitude: f32,
    pub warp_frequency: f32,
    pub detail_amplitude: f32,
    pub detail_frequency: f32,
    pub detail_octaves: i32,
}

impl Default for RegionParams {
    fn default() -> Self {
        Self {
            seed: 1337,
            sea_level: -1.4,
            slope: 0.35,
            ocean_cell: 900.0,
            level_scale: 6.0,
            ocean_chance: 0.22,
            ocean_radius_frac: 0.28,
            lake_cell: 1200.0,
            lake_radius: 70.0,
            jitter: 0.42,
            blend: 26.0,
            detail_guard: 34.0,
            // Amplitude and frequency trade against each other here, and only
            // their product shows up in the Jacobian. A long, fat warp bends the
            // lattice as far as a short one without steepening it, which is the
            // only way to get a coastline off the grid and keep the descent.
            warp_amplitude: 90.0,
            warp_frequency: 0.0006,
            detail_amplitude: 4.0,
            detail_frequency: 0.008,
            detail_octaves: 4,
        }
    }
}

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

/// Quadratic smooth minimum.
///
/// Chosen over the exponential form because it is built from arithmetic alone.
/// The exponential one needs `exp` and `log`, and a transcendental in the ground
/// function is a platform-dependent last bit -- which, on a field two machines
/// have to agree on exactly, is a desync.
///
/// It is not associative, so the fold order over sinks is part of the world.
fn smin(a: f32, b: f32, k: f32) -> f32 {
    if k <= 0.0 {
        return a.min(b);
    }
    let h = ((k - (a - b).abs()) / k).clamp(0.0, 1.0);
    a.min(b) - h * h * k * 0.25
}

fn hash32(mut x: u32) -> u32 {
    x ^= x >> 16;
    x = x.wrapping_mul(0x7feb_352d);
    x ^= x >> 15;
    x = x.wrapping_mul(0x846c_a68b);
    x ^= x >> 16;
    x
}

fn cell_hash(seed: u32, stream: u32, i: i32, j: i32) -> u32 {
    hash32(
        seed.wrapping_add(stream)
            .wrapping_add(hash32(i as u32).wrapping_mul(0x27d4_eb2d))
            .wrapping_add(hash32(j as u32).wrapping_mul(0x9e37_79b1)),
    )
}

/// Hash bits as a float in `[0, 1)`.
fn unit(h: u32) -> f32 {
    (h >> 8) as f32 / 16_777_216.0
}

/// The region field: sinks, and the ground that rises out of them.
pub struct RegionGen {
    params: RegionParams,
    warp_x: FastNoiseLite,
    warp_z: FastNoiseLite,
    detail: FastNoiseLite,
    seed: u32,
    /// `ocean_cell * level_scale^L`, precomputed so a level's spacing cannot
    /// drift with however `powi` happens to round on a given target.
    ocean_spacing: [f32; OCEAN_LEVELS],
}

impl RegionGen {
    pub fn new(params: &RegionParams) -> Self {
        let mut ocean_spacing = [0.0f32; OCEAN_LEVELS];
        let mut spacing = params.ocean_cell.max(1.0);
        for slot in ocean_spacing.iter_mut() {
            *slot = spacing;
            spacing *= params.level_scale.max(1.0);
        }
        Self {
            params: *params,
            warp_x: make_noise(params.seed + 101, params.warp_frequency, 2),
            warp_z: make_noise(params.seed + 211, params.warp_frequency, 2),
            detail: make_noise(params.seed, params.detail_frequency, params.detail_octaves),
            seed: params.seed as u32,
            ocean_spacing,
        }
    }

    pub fn params(&self) -> &RegionParams {
        &self.params
    }

    /// Where a query actually lands after the lattice is bent.
    ///
    /// Without this the sinks sit on a grid and every coastline in the world
    /// runs at one of a few angles. The amplitude is bounded well under a cell
    /// so the warp cannot fold space back on itself, which would let the ground
    /// double back and undo the descent.
    pub fn warp(&self, x: f32, z: f32) -> [f32; 2] {
        [
            x + self.warp_x.get_noise_2d(x, z) * self.params.warp_amplitude,
            z + self.warp_z.get_noise_2d(x, z) * self.params.warp_amplitude,
        ]
    }

    fn site(&self, stream: u32, spacing: f32, i: i32, j: i32) -> [f32; 2] {
        let h = cell_hash(self.seed, stream.wrapping_add(STREAM_JITTER), i, j);
        let jx = (unit(h) - 0.5) * 2.0 * self.params.jitter;
        let jz = (unit(hash32(h)) - 0.5) * 2.0 * self.params.jitter;
        [
            (i as f32 + 0.5 + jx) * spacing,
            (j as f32 + 0.5 + jz) * spacing,
        ]
    }

    /// Every sink that can reach a point, in a fixed order.
    ///
    /// The order is levels outward then row-major within a level, and it is not
    /// an implementation detail: [`smin`] does not commute, so shuffling this
    /// changes the ground.
    fn for_each_sink(&self, at: [f32; 2], mut f: impl FnMut(Sink)) {
        for level in 0..OCEAN_LEVELS {
            let spacing = self.ocean_spacing[level];
            let rings = if level == 0 { FINE_RINGS } else { COARSE_RINGS };
            let radius = spacing * self.params.ocean_radius_frac;
            let stream = STREAM_OCEAN.wrapping_add(STREAM_LEVEL.wrapping_mul(level as u32 + 1));
            let ci = (at[0] / spacing).floor() as i32;
            let cj = (at[1] / spacing).floor() as i32;
            for dj in -rings..=rings {
                for di in -rings..=rings {
                    let (i, j) = (ci + di, cj + dj);
                    let roll = unit(cell_hash(self.seed, stream, i, j));
                    if roll >= self.params.ocean_chance {
                        continue;
                    }
                    f(Sink {
                        pos: self.site(stream, spacing, i, j),
                        radius,
                        kind: SinkKind::Ocean,
                        level: level as u8,
                        cell: (i, j),
                    });
                }
            }
        }

        let spacing = self.params.lake_cell.max(1.0);
        let ci = (at[0] / spacing).floor() as i32;
        let cj = (at[1] / spacing).floor() as i32;
        for dj in -FINE_RINGS..=FINE_RINGS {
            for di in -FINE_RINGS..=FINE_RINGS {
                let (i, j) = (ci + di, cj + dj);
                f(Sink {
                    pos: self.site(STREAM_LEVEL, spacing, i, j),
                    radius: self.params.lake_radius,
                    kind: SinkKind::Lake,
                    level: u8::MAX,
                    cell: (i, j),
                });
            }
        }
    }

    /// Every sink in reach of a point, for callers that want the set itself.
    pub fn sinks_near(&self, x: f32, z: f32) -> Vec<Sink> {
        let mut out = Vec::new();
        self.for_each_sink(self.warp(x, z), |s| out.push(s));
        out
    }

    /// The sink a point drains to, and how far away it is.
    ///
    /// Nearest by shoreline rather than by centre, so a point just outside a
    /// wide sea belongs to the sea and not to the pond behind it.
    pub fn nearest_sink(&self, x: f32, z: f32) -> Option<(Sink, f32)> {
        let at = self.warp(x, z);
        let mut best: Option<(Sink, f32)> = None;
        self.for_each_sink(at, |s| {
            let d = ((at[0] - s.pos[0]).powi(2) + (at[1] - s.pos[1]).powi(2)).sqrt() - s.radius;
            if best.is_none_or(|(_, b)| d < b) {
                best = Some((s, d));
            }
        });
        best
    }

    /// Ground before detail: the lowest of one cone per sink, rounded off
    /// against the runner-up.
    ///
    /// A cone is `sea_level + slope * (distance - radius)`, so it is strictly
    /// increasing away from its sink and has no interior minimum. A minimum of
    /// such cones has none either -- where two meet, the lower one always keeps
    /// descending toward its own sink, which makes the meeting place a ridge.
    /// That ridge is the watershed, and it falls out of the construction rather
    /// than being drawn.
    ///
    /// The blend is applied exactly once, to the two lowest cones, and that
    /// restraint is the guarantee rather than a tidiness. Folding [`smin`]
    /// across every sink in reach compounds its softening some seventy times
    /// over; the ground goes slack, the slope falls under what detail noise can
    /// climb, and the field grows the very hollows the cones were chosen to make
    /// impossible. Two is also all that is meaningful: a watershed is where the
    /// nearest two basins meet, and a third sink that mattered would already be
    /// one of them.
    pub fn base_height(&self, x: f32, z: f32) -> f32 {
        let at = self.warp(x, z);
        let (lo, next) = self.lowest_cones(at);
        smin(lo, next, self.params.blend)
    }

    /// How much detail the ground can afford here, 0 to 1.
    ///
    /// One where a single sink owns the ground outright and the base is falling
    /// at full `slope`; zero where the two lowest cones have converged and there
    /// is no longer a slope for detail to stay under. See
    /// [`RegionParams::detail_guard`].
    pub fn detail_weight(&self, x: f32, z: f32) -> f32 {
        let guard = self.params.detail_guard;
        if guard <= 0.0 {
            return 1.0;
        }
        let (lo, next) = self.lowest_cones(self.warp(x, z));
        let t = ((next - lo) / guard).clamp(0.0, 1.0);
        t * t * (3.0 - 2.0 * t)
    }

    /// The two lowest cone heights over a point, lowest first.
    ///
    /// Selection is by strict `<` over the fixed order [`Self::for_each_sink`]
    /// walks, so ties resolve on that order and never on whatever the optimiser
    /// felt like doing with the comparison.
    fn lowest_cones(&self, at: [f32; 2]) -> (f32, f32) {
        let (mut lo, mut next) = (f32::MAX, f32::MAX);
        self.for_each_sink(at, |s| {
            let dx = at[0] - s.pos[0];
            let dz = at[1] - s.pos[1];
            let d = (dx * dx + dz * dz).sqrt();
            let cone = self.params.sea_level + self.params.slope * (d - s.radius);
            if cone < lo {
                next = lo;
                lo = cone;
            } else if cone < next {
                next = cone;
            }
        });
        (lo, next)
    }

    pub fn detail(&self, x: f32, z: f32) -> f32 {
        self.detail.get_noise_2d(x, z) * self.params.detail_amplitude
    }

    /// The ground, and the only height anything outside this module should ask
    /// for.
    ///
    /// One pass rather than three calls: the cones are what the base, the guard
    /// and the shoreline are all built from, and finding them is the expensive
    /// part.
    pub fn height(&self, x: f32, z: f32) -> f32 {
        let at = self.warp(x, z);
        let (lo, next) = self.lowest_cones(at);
        let base = smin(lo, next, self.params.blend);
        let guard = self.params.detail_guard;
        if guard <= 0.0 {
            return base + self.detail(x, z);
        }
        let t = ((next - lo) / guard).clamp(0.0, 1.0);
        base + self.detail(x, z) * t * t * (3.0 - 2.0 * t)
    }

    pub fn is_water(&self, x: f32, z: f32) -> bool {
        self.height(x, z) < self.params.sea_level
    }

    /// Steepest descent, one step.
    ///
    /// Central differences rather than an analytic gradient because the field is
    /// a fold of clamped smooth minima and the closed form is longer than it is
    /// worth. `None` means the ground is flat here to within the sample width,
    /// which on a field with a strictly positive slope should only ever happen
    /// on a watershed or in the water.
    pub fn downhill(&self, x: f32, z: f32, sample: f32) -> Option<[f32; 2]> {
        let gx = self.height(x + sample, z) - self.height(x - sample, z);
        let gz = self.height(x, z + sample) - self.height(x, z - sample);
        let len = (gx * gx + gz * gz).sqrt();
        if len <= f32::EPSILON {
            return None;
        }
        Some([-gx / len, -gz / len])
    }

    /// The steepest slope detail noise can add anywhere in `area` around the
    /// origin, sampled on a grid of `res` per side.
    ///
    /// This is the number the whole guarantee turns on, and it is measured
    /// rather than derived: the analytic bound for fractal simplex is loose
    /// enough that trusting it would mean either a world far steeper than it
    /// needs to be or a guarantee that quietly does not hold.
    pub fn detail_gradient(&self, area: f32, res: i32) -> f32 {
        let step = area * 2.0 / (res - 1).max(1) as f32;
        let probe = step * 0.5;
        let mut worst = 0.0f32;
        for j in 0..res {
            let z = -area + j as f32 * step;
            for i in 0..res {
                let x = -area + i as f32 * step;
                let gx = (self.detail(x + probe, z) - self.detail(x - probe, z)) / (probe * 2.0);
                let gz = (self.detail(x, z + probe) - self.detail(x, z - probe)) / (probe * 2.0);
                worst = worst.max((gx * gx + gz * gz).sqrt());
            }
        }
        worst
    }

    /// The most the warp bends space, as a fraction of a straight line.
    ///
    /// The warp is applied to the query rather than to the sites, so the ground
    /// a walker feels is `base(warp(p))` and its slope is the drainage slope
    /// multiplied through the warp's Jacobian. Push the warp past 1 and that
    /// Jacobian turns over: space folds, the ground stops descending toward the
    /// sink it belongs to, and the guarantee is gone -- which is exactly how a
    /// field with a strictly positive slope can still strand a descent.
    pub fn warp_gradient(&self, area: f32, res: i32) -> f32 {
        let step = area * 2.0 / (res - 1).max(1) as f32;
        let probe = step * 0.5;
        let amp = self.params.warp_amplitude;
        let mut worst = 0.0f32;
        for j in 0..res {
            let z = -area + j as f32 * step;
            for i in 0..res {
                let x = -area + i as f32 * step;
                let d = probe * 2.0;
                let xx = (self.warp_x.get_noise_2d(x + probe, z)
                    - self.warp_x.get_noise_2d(x - probe, z))
                    / d;
                let xz = (self.warp_x.get_noise_2d(x, z + probe)
                    - self.warp_x.get_noise_2d(x, z - probe))
                    / d;
                let zx = (self.warp_z.get_noise_2d(x + probe, z)
                    - self.warp_z.get_noise_2d(x - probe, z))
                    / d;
                let zz = (self.warp_z.get_noise_2d(x, z + probe)
                    - self.warp_z.get_noise_2d(x, z - probe))
                    / d;
                let norm = ((xx * xx + xz * xz + zx * zx + zz * zz).sqrt() * amp).abs();
                worst = worst.max(norm);
            }
        }
        worst
    }

    /// The drainage slope actually left after the warp has taken its cut. This,
    /// not `slope`, is what detail noise has to stay under.
    pub fn effective_slope(&self, area: f32, res: i32) -> f32 {
        self.params.slope * (1.0 - self.warp_gradient(area, res)).max(0.0)
    }

    /// Farthest any point can be from a sink, which is what bounds both relief
    /// and the size of a drainage basin.
    ///
    /// Half a diagonal of the guarantee lattice, widened by the worst jitter can
    /// do to a site and by the warp, which moves the query rather than the site
    /// and so adds its full amplitude.
    pub fn sink_reach(&self) -> f32 {
        let spacing = self.params.lake_cell.max(1.0);
        spacing * (0.5 + self.params.jitter) * core::f32::consts::SQRT_2 + self.params.warp_amplitude
    }

    /// Highest ground the region layer can produce before detail.
    pub fn max_relief(&self) -> f32 {
        self.params.slope * self.sink_reach()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn field() -> RegionGen {
        RegionGen::new(&RegionParams::default())
    }

    /// Spread sample points over ground far wider than any lattice in the field,
    /// so no test below can pass by sitting inside one lucky cell.
    fn probes(count: i32) -> impl Iterator<Item = (f32, f32)> {
        (0..count).map(move |i| {
            let h = hash32(i as u32 + 1);
            let x = (unit(h) - 0.5) * 40_000.0;
            let z = (unit(hash32(h)) - 0.5) * 40_000.0;
            (x, z)
        })
    }

    #[test]
    fn the_same_seed_builds_the_same_ground() {
        let (a, b) = (field(), field());
        for (x, z) in probes(400) {
            assert_eq!(a.height(x, z).to_bits(), b.height(x, z).to_bits());
        }
    }

    #[test]
    fn a_different_seed_builds_different_ground() {
        let a = field();
        let b = RegionGen::new(&RegionParams {
            seed: 90210,
            ..RegionParams::default()
        });
        assert!(
            probes(400).any(|(x, z)| a.height(x, z) != b.height(x, z)),
            "the seed does not reach the region layer"
        );
    }

    /// Where a monotone walk downhill from a point ends up.
    ///
    /// The stride shrinks whenever a step would climb, which is what makes this
    /// a statement about the ground rather than about the walker. A fixed stride
    /// ping-pongs across any groove narrower than itself -- and the blend cuts
    /// exactly such a groove along every watershed -- so it reports a pit
    /// wherever the going gets tight. Halving instead follows the groove down,
    /// and gives up only where *no* step at *any* scale descends, which is the
    /// definition of a local minimum and the only thing worth failing on.
    fn descend(g: &RegionGen, from: (f32, f32)) -> Descent {
        const FIRST_STEP: f32 = 8.0;
        const FINEST_STEP: f32 = 0.05;
        let (mut px, mut pz) = from;
        let mut here = g.height(px, pz);
        let mut step = FIRST_STEP;
        let mut steps = 0;
        while steps < 20_000 {
            let Some(dir) = g.downhill(px, pz, 1.0) else {
                break;
            };
            let (nx, nz) = (px + dir[0] * step, pz + dir[1] * step);
            let next = g.height(nx, nz);
            if next >= here {
                step *= 0.5;
                if step < FINEST_STEP {
                    break;
                }
                continue;
            }
            px = nx;
            pz = nz;
            here = next;
            steps += 1;
            if g.is_water(px, pz) {
                return Descent { at: (px, pz), height: here, wet: true, steps };
            }
        }
        Descent { at: (px, pz), height: here, wet: g.is_water(px, pz), steps }
    }

    struct Descent {
        at: (f32, f32),
        height: f32,
        wet: bool,
        steps: i32,
    }

    /// The reason this layer exists. Every point of land has to be able to walk
    /// downhill into water, or somewhere out there is a hollow a river runs into
    /// and never leaves.
    #[test]
    fn every_descent_reaches_water() {
        let g = field();
        let mut walked = 0;
        for (x, z) in probes(2_000) {
            if g.is_water(x, z) {
                continue;
            }
            walked += 1;
            let end = descend(&g, (x, z));
            assert!(
                end.wet,
                "stranded: from ({x:.1}, {z:.1}) descent stopped at ({:.1}, {:.1}) \
                 at height {:.2} after {} steps, with sea at {:.2}",
                end.at.0,
                end.at.1,
                end.height,
                end.steps,
                g.params.sea_level
            );
        }
        assert!(walked > 500, "almost every probe started wet: {walked}");
    }

    /// The walk above only proves it arrived. This proves it never went up on
    /// the way, which is what rules out a descent that escapes a basin by
    /// climbing out of it on a numerical accident rather than draining.
    #[test]
    fn no_descent_climbs() {
        let g = field();
        for (x, z) in probes(400) {
            if g.is_water(x, z) {
                continue;
            }
            let (mut px, mut pz) = (x, z);
            let mut last = g.height(px, pz);
            let mut step = 8.0f32;
            for _ in 0..4_000 {
                let Some(dir) = g.downhill(px, pz, 1.0) else {
                    break;
                };
                let (nx, nz) = (px + dir[0] * step, pz + dir[1] * step);
                let now = g.height(nx, nz);
                if now >= last {
                    step *= 0.5;
                    if step < 0.05 {
                        break;
                    }
                    continue;
                }
                px = nx;
                pz = nz;
                assert!(
                    now <= last,
                    "descent climbed from {last:.4} to {now:.4} at ({px:.1}, {pz:.1})"
                );
                last = now;
                if g.is_water(px, pz) {
                    break;
                }
            }
        }
    }

    /// The warp is applied to the query, so it multiplies the drainage slope by
    /// its own Jacobian. Past 1 that Jacobian turns over and the ground stops
    /// descending toward its sink -- which is a stranded descent that no amount
    /// of `slope` can buy back, because the slope is what got cancelled.
    #[test]
    fn the_warp_does_not_fold_space() {
        let g = field();
        let bend = g.warp_gradient(3_000.0, 320);
        assert!(
            bend < 1.0,
            "the warp bends space by {bend:.4}, so somewhere it turns the ground inside out"
        );
    }

    /// The inequality the whole guarantee rests on, stated as a test so that
    /// tuning detail up, slope down or the warp wider fails here rather than
    /// silently out in the world where only a stuck river would show it.
    #[test]
    fn the_drainage_slope_out_climbs_detail_noise() {
        let g = field();
        let detail = g.detail_gradient(3_000.0, 320);
        let slope = g.effective_slope(3_000.0, 320);
        assert!(
            detail < slope,
            "detail noise reaches a slope of {detail:.4} against a drainage slope of {slope:.4} \
             (raw {:.4}, warp takes {:.4}): detail can dig a hollow the drainage cannot leave",
            g.params.slope,
            g.warp_gradient(3_000.0, 320)
        );
    }

    /// Ocean is rolled, not placed, so there is no promise of sea anywhere in
    /// particular -- but there is a promise of *a* sink, and it is the lake
    /// lattice that keeps it.
    #[test]
    fn a_sink_is_always_within_reach() {
        let g = field();
        let reach = g.sink_reach();
        for (x, z) in probes(1_000) {
            let (_, d) = g.nearest_sink(x, z).expect("no sink at all");
            assert!(d <= reach, "nearest sink is {d:.1} away, reach is {reach:.1}");
        }
    }

    /// Ocean has to stay optional or the lattice shows through as regularly
    /// spaced coast, and it has to actually appear or the world is all pond.
    #[test]
    fn ocean_is_common_but_not_guaranteed() {
        let g = field();
        let mut sea = 0;
        let mut pond = 0;
        for (x, z) in probes(1_000) {
            match g.nearest_sink(x, z).expect("no sink").0.kind {
                SinkKind::Ocean => sea += 1,
                SinkKind::Lake => pond += 1,
            }
        }
        assert!(sea > 50, "no ocean reached anywhere: {sea}");
        assert!(pond > 50, "every basin found sea, so lakes are dead code: {pond}");
    }

    /// Relief is bounded because the lake lattice bounds how far a sink can be.
    /// Unbounded here would mean mountains that grow forever inland, which is
    /// the failure mode of drainage built on distance to ocean alone.
    #[test]
    fn relief_is_bounded() {
        let g = field();
        let ceiling = g.max_relief() + g.params.detail_amplitude + g.params.sea_level;
        for (x, z) in probes(2_000) {
            let h = g.height(x, z);
            assert!(h <= ceiling, "ground reached {h:.1} against a ceiling of {ceiling:.1}");
        }
    }

    #[test]
    fn water_covers_a_believable_share_of_the_world() {
        let g = field();
        let wet = probes(2_000).filter(|(x, z)| g.is_water(*x, *z)).count();
        let share = wet as f32 / 2_000.0;
        assert!(
            (0.02..0.6).contains(&share),
            "water covers {:.1}% of the world",
            share * 100.0
        );
    }

    /// The smooth minimum is what keeps a watershed from being a crease, so it
    /// has to actually round the corner rather than pass min through.
    #[test]
    fn the_blend_rounds_where_two_sinks_meet() {
        assert_eq!(smin(3.0, 5.0, 0.0), 3.0);
        assert!(smin(3.0, 3.0, 4.0) < 3.0, "equal heights are not blended");
        assert_eq!(smin(3.0, 500.0, 4.0), 3.0, "a distant sink still pulls");
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

    /// A client and a server disagreeing on this field by one bit is a player
    /// standing on ground their own server thinks is river.
    #[test]
    fn the_region_field_is_bit_stable_across_platforms() {
        let g = field();
        let mut samples = Vec::with_capacity(64 * 64);
        for j in 0..64 {
            for i in 0..64 {
                samples.push(g.height(i as f32 * 37.0 - 1184.0, j as f32 * 37.0 - 1184.0));
            }
        }
        assert_eq!(
            fnv1a(&samples),
            0x7e0d_c1aa_6f3d_19dd,
            "region field diverged"
        );
    }
}

#[cfg(test)]
mod sweep {
    use super::*;

    /// Far more ground than the committed test walks, kept out of CI because it
    /// is seconds rather than milliseconds. Run it after touching any of the
    /// tuning: `cargo test -p q --lib --features rapier3d-client sweep -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn a_great_deal_of_ground_all_drains() {
        let g = RegionGen::new(&RegionParams::default());
        let (mut land, mut stranded, mut worst) = (0u32, 0u32, 0.0f32);
        for i in 0..60_000u32 {
            let h = hash32(i.wrapping_add(0x5eed));
            let x = (unit(h) - 0.5) * 400_000.0;
            let z = (unit(hash32(h)) - 0.5) * 400_000.0;
            if g.is_water(x, z) {
                continue;
            }
            land += 1;
            let (mut px, mut pz) = (x, z);
            let mut here = g.height(px, pz);
            let mut step = 8.0f32;
            let mut wet = false;
            for _ in 0..20_000 {
                let Some(d) = g.downhill(px, pz, 1.0) else { break };
                let (nx, nz) = (px + d[0] * step, pz + d[1] * step);
                let next = g.height(nx, nz);
                if next >= here {
                    step *= 0.5;
                    if step < 0.05 {
                        break;
                    }
                    continue;
                }
                px = nx;
                pz = nz;
                here = next;
                if g.is_water(px, pz) {
                    wet = true;
                    break;
                }
            }
            if !wet {
                stranded += 1;
                worst = worst.max(here);
                if stranded <= 5 {
                    println!("stranded at ({px:.1}, {pz:.1}) height {here:.2}");
                }
            }
        }
        println!("land {land}, stranded {stranded}, worst height {worst:.2}");
        assert_eq!(stranded, 0, "{stranded} of {land} descents never reached water");
    }
}
