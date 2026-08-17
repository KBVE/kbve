//! What grows where.
//!
//! [`crate::region`] decides the shape of the ground and where the water is.
//! This decides what covers it, and it is a separate question: two hillsides of
//! identical slope a hundred kilometres apart are not the same place, and
//! nothing in a height field says which is tundra and which is swamp.
//!
//! Climate here is a pair of low-frequency fields, temperature and moisture,
//! read not at the query but at the nearest few sites of a jittered lattice.
//! That indirection is the whole design. Sampling climate per-point gives a
//! smooth gradient, and a smooth gradient has no regions in it -- every place is
//! slightly its own biome and none of them are anywhere. Sampling per-site and
//! taking the nearest gives cells that are one thing, with an edge, which is
//! what a region is; blending the nearest two keeps that edge from being a seam
//! without dissolving it back into gradient.
//!
//! The seven kinds are not a taxonomy invented here. They are the seven folders
//! under `assets/biomes`, and a biome this module can name but nothing can draw
//! would be worse than one fewer.

use fastnoise_lite::{FastNoiseLite, FractalType, NoiseType};

use crate::region::RegionGen;

/// Cells scanned for the nearest sites. Two rings covers the jitter with room
/// for the blend to reach past the winner.
const RINGS: i32 = 2;

const STREAM_SITE: u32 = 0x27d4_eb2d;
const STREAM_FIRE: u32 = 0x165_667b1;

/// The ground cover of a place.
///
/// One per folder under `assets/biomes`, and in the same order, so that adding a
/// kind here without the art to draw it is a change that reads as wrong.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Biome {
    Coast,
    Desert,
    Forest,
    Grassland,
    Swamp,
    Tundra,
    Volcanic,
}

impl Biome {
    pub const ALL: [Biome; 7] = [
        Biome::Coast,
        Biome::Desert,
        Biome::Forest,
        Biome::Grassland,
        Biome::Swamp,
        Biome::Tundra,
        Biome::Volcanic,
    ];

    /// The folder under `assets/biomes` this biome draws from.
    pub fn folder(self) -> &'static str {
        match self {
            Biome::Coast => "coast",
            Biome::Desert => "desert",
            Biome::Forest => "forest",
            Biome::Grassland => "grassland",
            Biome::Swamp => "swamp",
            Biome::Tundra => "tundra",
            Biome::Volcanic => "volcanic",
        }
    }
}

/// Two biomes and how much of the second there is.
///
/// Never one biome, because a caller handed a single answer has to invent the
/// crossfade itself, and every caller inventing its own is how a grass field and
/// the ground under it end up disagreeing about where the desert starts.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct BiomeSample {
    pub primary: Biome,
    pub secondary: Biome,
    /// Share of `secondary`, 0 to 0.5. Never above a half: past that the two
    /// would have swapped names.
    pub blend: f32,
}

impl BiomeSample {
    /// How much of a given biome covers this point, counting both slots.
    pub fn weight(&self, of: Biome) -> f32 {
        let mut w = 0.0;
        if self.primary == of {
            w += 1.0 - self.blend;
        }
        if self.secondary == of {
            w += self.blend;
        }
        w
    }
}

/// Defaults are in metres and in the units of the climate fields, which run
/// roughly -1 to 1 before the terrain terms are added.
#[derive(Clone, Copy, Debug)]
pub struct BiomeParams {
    pub seed: i32,
    /// Spacing of the biome lattice, metres. This is how big a region is.
    pub cell: f32,
    pub jitter: f32,
    pub warp_amplitude: f32,
    pub warp_frequency: f32,
    pub climate_frequency: f32,
    /// How much colder it gets per metre of height.
    ///
    /// Why anywhere is ever tundra: without a lapse rate the cold places are
    /// wherever the temperature field happens to dip, which is to say nowhere in
    /// particular, and mountains are as warm as the coast below them.
    pub lapse_rate: f32,
    /// How much wetter it is beside open water, and how far that reaches.
    pub coastal_moisture: f32,
    pub moisture_reach: f32,
    /// Height above sea level within which ground is shore whatever the climate
    /// inland says.
    pub shore_band: f32,
    pub tundra_below: f32,
    pub desert_below: f32,
    pub forest_above: f32,
    pub swamp_above: f32,
    /// Height above sea level under which wet flat ground turns to swamp rather
    /// than forest.
    pub swamp_ceiling: f32,
    /// Odds a site is volcanic, before the height it also needs.
    pub volcanic_chance: f32,
    pub volcanic_above: f32,
}

impl Default for BiomeParams {
    fn default() -> Self {
        Self {
            seed: 1337,
            cell: 700.0,
            jitter: 0.42,
            warp_amplitude: 140.0,
            warp_frequency: 0.0007,
            climate_frequency: 0.00035,
            lapse_rate: 0.0055,
            coastal_moisture: 0.55,
            moisture_reach: 260.0,
            shore_band: 6.0,
            tundra_below: -0.42,
            desert_below: -0.30,
            forest_above: 0.16,
            swamp_above: 0.46,
            swamp_ceiling: 26.0,
            volcanic_chance: 0.045,
            volcanic_above: 150.0,
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

fn unit(h: u32) -> f32 {
    (h >> 8) as f32 / 16_777_216.0
}

fn smoothstep(edge0: f32, edge1: f32, x: f32) -> f32 {
    if edge1 <= edge0 {
        return if x < edge0 { 0.0 } else { 1.0 };
    }
    let t = ((x - edge0) / (edge1 - edge0)).clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

/// The climate at one place, after the ground has had its say.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Climate {
    pub temperature: f32,
    pub moisture: f32,
    pub elevation: f32,
}

pub struct BiomeGen {
    params: BiomeParams,
    warp_x: FastNoiseLite,
    warp_z: FastNoiseLite,
    heat: FastNoiseLite,
    damp: FastNoiseLite,
    seed: u32,
}

impl BiomeGen {
    pub fn new(params: &BiomeParams) -> Self {
        Self {
            params: *params,
            warp_x: make_noise(params.seed + 313, params.warp_frequency, 2),
            warp_z: make_noise(params.seed + 727, params.warp_frequency, 2),
            heat: make_noise(params.seed + 1009, params.climate_frequency, 3),
            damp: make_noise(params.seed + 2003, params.climate_frequency, 3),
            seed: params.seed as u32,
        }
    }

    pub fn params(&self) -> &BiomeParams {
        &self.params
    }

    /// Bends the lattice so a biome edge is not a straight line between two grid
    /// cells. Unlike the region layer's warp this one has no descent to cancel,
    /// so it is bounded only by taste.
    fn warp(&self, x: f32, z: f32) -> [f32; 2] {
        [
            x + self.warp_x.get_noise_2d(x, z) * self.params.warp_amplitude,
            z + self.warp_z.get_noise_2d(x, z) * self.params.warp_amplitude,
        ]
    }

    fn site(&self, i: i32, j: i32) -> [f32; 2] {
        let h = cell_hash(self.seed, STREAM_SITE, i, j);
        let jx = (unit(h) - 0.5) * 2.0 * self.params.jitter;
        let jz = (unit(hash32(h)) - 0.5) * 2.0 * self.params.jitter;
        [
            (i as f32 + 0.5 + jx) * self.params.cell,
            (j as f32 + 0.5 + jz) * self.params.cell,
        ]
    }

    /// Climate at a point, with the ground's contribution folded in.
    ///
    /// Height cools and open water dampens, so the same climate field gives
    /// tundra on a ridge and swamp in the hollow below it -- which is the only
    /// reason a two-axis table produces anything that looks like terrain rather
    /// than like stripes.
    pub fn climate(&self, region: &RegionGen, x: f32, z: f32) -> Climate {
        let above = region.height(x, z) - region.params().sea_level;
        let wet = match region.nearest_sink(x, z) {
            Some((_, edge)) => {
                self.params.coastal_moisture
                    * (1.0 - smoothstep(0.0, self.params.moisture_reach, edge.max(0.0)))
            }
            None => 0.0,
        };
        Climate {
            temperature: self.heat.get_noise_2d(x, z) - above * self.params.lapse_rate,
            moisture: self.damp.get_noise_2d(x, z) + wet,
            elevation: above,
        }
    }

    /// The biome a site stands for, from the climate at the site itself.
    fn biome_at_site(&self, region: &RegionGen, i: i32, j: i32) -> Biome {
        let s = self.site(i, j);
        let c = self.climate(region, s[0], s[1]);
        if c.elevation > self.params.volcanic_above
            && unit(cell_hash(self.seed, STREAM_FIRE, i, j)) < self.params.volcanic_chance
        {
            return Biome::Volcanic;
        }
        if c.temperature < self.params.tundra_below {
            return Biome::Tundra;
        }
        if c.moisture < self.params.desert_below {
            return Biome::Desert;
        }
        if c.moisture > self.params.swamp_above && c.elevation < self.params.swamp_ceiling {
            return Biome::Swamp;
        }
        if c.moisture > self.params.forest_above {
            return Biome::Forest;
        }
        Biome::Grassland
    }

    /// The two nearest sites to a point, nearest first, with their distances.
    fn nearest_pair(&self, at: [f32; 2]) -> ([(i32, i32); 2], [f32; 2]) {
        let ci = (at[0] / self.params.cell).floor() as i32;
        let cj = (at[1] / self.params.cell).floor() as i32;
        let mut best = [((0, 0), f32::MAX), ((0, 0), f32::MAX)];
        for dj in -RINGS..=RINGS {
            for di in -RINGS..=RINGS {
                let (i, j) = (ci + di, cj + dj);
                let s = self.site(i, j);
                let dx = at[0] - s[0];
                let dz = at[1] - s[1];
                let d = (dx * dx + dz * dz).sqrt();
                if d < best[0].1 {
                    best[1] = best[0];
                    best[0] = ((i, j), d);
                } else if d < best[1].1 {
                    best[1] = ((i, j), d);
                }
            }
        }
        ([best[0].0, best[1].0], [best[0].1, best[1].1])
    }

    /// What covers the ground at a point.
    ///
    /// Shore is decided here rather than in the table because it is not a
    /// climate: a beach is a beach in the tundra and in the desert, and it is
    /// thin, following the waterline rather than filling a region. It therefore
    /// overrides whatever the lattice says, fading in over
    /// [`BiomeParams::shore_band`] so the change of material is a shoreline and
    /// not a contour line.
    pub fn sample(&self, region: &RegionGen, x: f32, z: f32) -> BiomeSample {
        let at = self.warp(x, z);
        let (cells, dist) = self.nearest_pair(at);
        let inland = self.biome_at_site(region, cells[0].0, cells[0].1);
        let neighbour = self.biome_at_site(region, cells[1].0, cells[1].1);

        // Half the gap between the two sites is the edge; the blend is how far
        // across that midline the point sits, which keeps the crossfade the same
        // width whether the sites are close together or far apart.
        let span = (dist[0] + dist[1]).max(1e-3);
        let across = (0.5 - dist[0] / span).max(0.0) * 2.0;
        let land = BiomeSample {
            primary: inland,
            secondary: neighbour,
            blend: 0.5 * (1.0 - smoothstep(0.0, 1.0, across)),
        };

        let above = region.height(x, z) - region.params().sea_level;
        let shore = 1.0 - smoothstep(0.0, self.params.shore_band, above.max(0.0));
        if shore <= 0.0 {
            return land;
        }
        if shore >= 0.5 {
            return BiomeSample {
                primary: Biome::Coast,
                secondary: land.primary,
                blend: 1.0 - shore,
            };
        }
        BiomeSample {
            primary: land.primary,
            secondary: Biome::Coast,
            blend: shore,
        }
    }

    /// The single best answer, for callers that genuinely cannot blend.
    pub fn biome(&self, region: &RegionGen, x: f32, z: f32) -> Biome {
        self.sample(region, x, z).primary
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::region::RegionParams;
    use std::collections::HashMap;

    fn world() -> (RegionGen, BiomeGen) {
        (
            RegionGen::new(&RegionParams::default()),
            BiomeGen::new(&BiomeParams::default()),
        )
    }

    fn probes(count: i32) -> impl Iterator<Item = (f32, f32)> {
        (0..count).map(move |i| {
            let h = hash32(i as u32 + 1);
            let x = (unit(h) - 0.5) * 90_000.0;
            let z = (unit(hash32(h)) - 0.5) * 90_000.0;
            (x, z)
        })
    }

    #[test]
    fn the_same_seed_grows_the_same_world() {
        let (r, a) = world();
        let (_, b) = world();
        for (x, z) in probes(500) {
            assert_eq!(a.sample(&r, x, z), b.sample(&r, x, z));
        }
    }

    #[test]
    fn a_different_seed_grows_a_different_world() {
        let (r, a) = world();
        let b = BiomeGen::new(&BiomeParams {
            seed: 5150,
            ..BiomeParams::default()
        });
        assert!(
            probes(500).any(|(x, z)| a.sample(&r, x, z).primary != b.sample(&r, x, z).primary),
            "the seed does not reach the biome layer"
        );
    }

    /// Every kind has art behind it, so a kind the world never produces is a
    /// folder of textures nothing will ever draw -- and, more likely, a table
    /// whose thresholds have drifted past each other.
    #[test]
    fn every_biome_appears_somewhere() {
        let (r, b) = world();
        let mut seen: HashMap<Biome, u32> = HashMap::new();
        for (x, z) in probes(20_000) {
            *seen.entry(b.sample(&r, x, z).primary).or_insert(0) += 1;
        }
        for kind in Biome::ALL {
            let count = seen.get(&kind).copied().unwrap_or(0);
            assert!(count > 0, "{kind:?} never occurs anywhere in the world");
        }
    }

    /// None of them may take over either, or the table has collapsed to one
    /// answer and the climate fields are decoration.
    #[test]
    fn no_biome_swallows_the_world() {
        let (r, b) = world();
        let mut seen: HashMap<Biome, u32> = HashMap::new();
        let total = 20_000;
        for (x, z) in probes(total) {
            *seen.entry(b.sample(&r, x, z).primary).or_insert(0) += 1;
        }
        for (kind, count) in &seen {
            let share = *count as f32 / total as f32;
            assert!(
                share < 0.75,
                "{kind:?} covers {:.0}% of the world",
                share * 100.0
            );
        }
    }

    /// A blend outside this range is a caller drawing the wrong biome at full
    /// strength, and past a half the two slots have swapped meaning.
    #[test]
    fn the_blend_stays_a_minority_share() {
        let (r, b) = world();
        for (x, z) in probes(4_000) {
            let s = b.sample(&r, x, z);
            assert!(
                (0.0..=0.5).contains(&s.blend),
                "blend {} at ({x:.0}, {z:.0})",
                s.blend
            );
            let total: f32 = Biome::ALL.iter().map(|k| s.weight(*k)).sum();
            assert!((total - 1.0).abs() < 1e-5, "weights sum to {total}");
        }
    }

    /// The largest change in blend between adjacent samples along a transect.
    fn worst_step(r: &RegionGen, b: &BiomeGen, step: f32, reach: f32) -> f32 {
        let count = (reach / step) as i32;
        let mut worst = 0.0f32;
        for (x0, z0) in probes(60) {
            let mut before: Option<BiomeSample> = None;
            for k in 0..count {
                let s = b.sample(r, x0 + k as f32 * step, z0);
                if let Some(p) = before {
                    // Only comparable where the pair of biomes is the same; the
                    // slots themselves swap names across an edge, and that swap
                    // happens exactly where the blend is at its half and the two
                    // are equal anyway.
                    if p.primary == s.primary && p.secondary == s.secondary {
                        worst = worst.max((p.blend - s.blend).abs());
                    }
                }
                before = Some(s);
            }
        }
        worst
    }

    /// Biomes have to change gradually across their edges, or there is a seam on
    /// the ground where one texture becomes another between two blades of grass.
    ///
    /// Tested by refining the step rather than by bounding the change, because a
    /// bound on the change cannot tell the two cases apart. The shore fades over
    /// six metres of height, and on ground falling at a third that is seventeen
    /// metres of beach -- steep enough that any absolute threshold either fails
    /// on a perfectly smooth coastline or is too loose to catch a real seam.
    /// What separates them is that a continuous field's step shrinks with the
    /// sampling and a discontinuity's does not.
    #[test]
    fn cover_does_not_jump_between_neighbouring_points() {
        let (r, b) = world();
        let coarse = worst_step(&r, &b, 1.0, 300.0);
        let fine = worst_step(&r, &b, 0.25, 300.0);
        assert!(coarse > 0.0, "the transects never crossed an edge");
        assert!(
            fine < coarse * 0.5,
            "refining the step four-fold moved the worst change from {coarse:.4} to {fine:.4}: \
             that is a seam, not a slope"
        );
    }

    /// The waterline is a beach whatever the climate inland is, or a desert runs
    /// into the sea with sand dunes going under the waves.
    #[test]
    fn the_waterline_is_always_shore() {
        let (r, b) = world();
        let mut checked = 0;
        for (x, z) in probes(30_000) {
            let above = r.height(x, z) - r.params().sea_level;
            if !(0.0..1.0).contains(&above) {
                continue;
            }
            checked += 1;
            assert_eq!(
                b.sample(&r, x, z).primary,
                Biome::Coast,
                "ground {above:.2} m above the sea at ({x:.0}, {z:.0}) is not shore"
            );
        }
        assert!(checked > 30, "never landed on a shoreline: {checked}");
    }

    /// The lapse rate has to actually reach the table, or tundra is wherever the
    /// temperature field dipped and mountains are as warm as the coast.
    #[test]
    fn the_cold_places_are_the_high_ones() {
        let (r, b) = world();
        let (mut tundra, mut tundra_h) = (0u32, 0.0f64);
        let (mut other, mut other_h) = (0u32, 0.0f64);
        for (x, z) in probes(20_000) {
            let h = r.height(x, z) as f64;
            if b.sample(&r, x, z).primary == Biome::Tundra {
                tundra += 1;
                tundra_h += h;
            } else {
                other += 1;
                other_h += h;
            }
        }
        assert!(tundra > 50, "not enough tundra to say anything: {tundra}");
        let (hi, lo) = (tundra_h / tundra as f64, other_h / other as f64);
        assert!(
            hi > lo + 20.0,
            "tundra averages {hi:.0} m against {lo:.0} m elsewhere, so height is not cooling anything"
        );
    }

    /// The two climate axes have to be doing the work the table says they are.
    #[test]
    fn deserts_are_dry_and_swamps_are_wet() {
        let (r, b) = world();
        let (mut dry, mut dry_n) = (0.0f64, 0u32);
        let (mut wet, mut wet_n) = (0.0f64, 0u32);
        for (x, z) in probes(20_000) {
            let m = b.climate(&r, x, z).moisture as f64;
            match b.sample(&r, x, z).primary {
                Biome::Desert => {
                    dry += m;
                    dry_n += 1;
                }
                Biome::Swamp => {
                    wet += m;
                    wet_n += 1;
                }
                _ => {}
            }
        }
        assert!(dry_n > 20 && wet_n > 20, "too few: {dry_n} desert, {wet_n} swamp");
        assert!(
            wet / wet_n as f64 > dry / dry_n as f64,
            "swamps average {:.2} moisture against deserts at {:.2}",
            wet / wet_n as f64,
            dry / dry_n as f64
        );
    }

    /// Regions have to be region-sized. Sampling climate per point instead of
    /// per site gives a world that changes biome every few metres, which is the
    /// failure this lattice exists to avoid.
    #[test]
    fn a_region_is_bigger_than_a_footstep() {
        let (r, b) = world();
        let step = 8.0;
        let mut runs = 0u32;
        let mut changes = 0u32;
        for (x0, z0) in probes(40) {
            let mut before: Option<Biome> = None;
            for k in 0..500 {
                let here = b.sample(&r, x0 + k as f32 * step, z0).primary;
                if before.is_some_and(|p| p != here) {
                    changes += 1;
                }
                before = Some(here);
                runs += 1;
            }
        }
        let metres = (runs - changes) as f32 * step / changes.max(1) as f32;
        assert!(
            metres > 120.0,
            "the world changes biome every {metres:.0} m of walking"
        );
    }

    /// Every biome the module can name has somewhere to load art from.
    #[test]
    fn every_biome_names_an_asset_folder() {
        let mut seen = Vec::new();
        for kind in Biome::ALL {
            let folder = kind.folder();
            assert!(!folder.is_empty(), "{kind:?} has no folder");
            assert!(!seen.contains(&folder), "{folder} is claimed twice");
            seen.push(folder);
        }
        assert_eq!(seen.len(), 7);
    }
}
