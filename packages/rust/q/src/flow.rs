//! Where the water actually goes, and how much of it there is.
//!
//! [`crate::region`] guarantees that every point of land can walk downhill into
//! water. That is enough to know a river will not get stuck; it is not enough to
//! draw one, because it says nothing about *how much* water arrives anywhere. A
//! stream at the top of a hill and the river it becomes at the coast are the
//! same slope and the same rock -- what separates them is how much ground drains
//! through each, and that is a count, not a field.
//!
//! Counting it needs a bounded domain, which is the one thing an infinite world
//! does not hand you. The region layer pays for it in advance: because a sink is
//! always within [`crate::region::RegionGen::sink_reach`], the set of ground
//! draining to any one sink is finite. That set is a basin, and a basin is small
//! enough to enumerate, accumulate exactly, and keep. No approximation, no
//! bounded-upstream guess, no global pass -- the domain the arithmetic needs is
//! the one the world already had.

use std::collections::HashMap;

use crate::region::{RegionGen, Sink};

/// A cell of the flow lattice, addressed by where it sits in the world rather
/// than by its place in any basin.
pub type Cell = (i32, i32);

/// The water cell a basin empties into -- its mouth.
///
/// A basin is keyed on where it comes out rather than on which sink it reaches,
/// and the difference is not bookkeeping. Keyed on the sink, every stream
/// touching one sea is a single basin: the coarsest ocean here is nine
/// kilometres across, so its catchment is a ring around fifty-odd kilometres of
/// shoreline and runs to hundreds of thousands of cells. Keyed on the mouth, it
/// is what it should have been all along -- one river's catchment, bounded by
/// [`crate::region::RegionGen::sink_reach`] the way the region layer promised,
/// and separate from the next river along the same coast, which is also what
/// hydrology says they are.
pub type BasinKey = Cell;

/// The eight neighbours, in a fixed order.
///
/// Fixed because it decides ties. Two neighbours at exactly the same height are
/// common on a lattice sampled from a smooth field, and whichever is tested
/// first wins the water -- so this array is part of the world, not a detail of
/// how the loop was written.
const NEIGHBOURS: [(i32, i32); 8] = [
    (1, 0),
    (1, 1),
    (0, 1),
    (-1, 1),
    (-1, 0),
    (-1, -1),
    (0, -1),
    (1, -1),
];

/// Defaults must stay in step with [`crate::region::RegionParams`]: `cell` has to
/// resolve a channel, and the reach of a sink decides how much ground one basin
/// can hold.
#[derive(Clone, Copy, Debug)]
pub struct FlowParams {
    /// Lattice spacing, metres. Smaller resolves finer channels and costs the
    /// square of itself in basin size.
    pub cell: f32,
    /// Refuses to enumerate a basin larger than this.
    ///
    /// Not a tuning knob: it is the assertion that the region layer really did
    /// bound the drainage, placed where it would fail loudly rather than hang.
    /// One mouth can only gather ground within a sink's reach of it, which at
    /// the defaults is under nine square kilometres, so this sits far above what
    /// a sound world can reach and only fires when something is wrong.
    pub max_basin_cells: usize,
    /// Channel width in metres per square root of drained square metres.
    pub width_coefficient: f32,
    /// Ground drained, in square metres, before there is a channel at all.
    /// Below this the water has not gathered into anything worth drawing.
    pub channel_threshold: f32,
}

impl Default for FlowParams {
    fn default() -> Self {
        Self {
            cell: 16.0,
            max_basin_cells: 250_000,
            width_coefficient: 0.011,
            channel_threshold: 40_000.0,
        }
    }
}

/// One drainage basin: every cell that drains to a single sink, and how much
/// ground drains through each.
#[derive(Clone, Debug)]
pub struct Basin {
    /// The water cell this basin empties into.
    pub key: BasinKey,
    /// Cells drained through, in the order the flood reached them, which is
    /// downstream before upstream.
    order: Vec<Cell>,
    /// Cells drained by each cell, including itself. Water cells are absent:
    /// they are the destination, not part of the count.
    drained: HashMap<Cell, u32>,
    /// Whether the flood stopped early at [`FlowParams::max_basin_cells`].
    pub truncated: bool,
}

impl Basin {
    /// How many cells of ground drain through this one, itself included. Zero
    /// for anything outside the basin.
    pub fn cells_drained(&self, at: Cell) -> u32 {
        self.drained.get(&at).copied().unwrap_or(0)
    }

    pub fn len(&self) -> usize {
        self.order.len()
    }

    pub fn is_empty(&self) -> bool {
        self.order.is_empty()
    }

    /// Every cell in the basin, downstream before upstream.
    pub fn cells(&self) -> &[Cell] {
        &self.order
    }
}

/// The drainage of a world, computed a basin at a time and kept.
///
/// Owns its [`RegionGen`] because the two are one world: a basin flooded against
/// one ground and asked about against another is not a basin.
pub struct FlowField {
    region: RegionGen,
    params: FlowParams,
    basins: HashMap<BasinKey, Basin>,
}

impl FlowField {
    pub fn new(region: RegionGen, params: FlowParams) -> Self {
        Self {
            region,
            params,
            basins: HashMap::new(),
        }
    }

    pub fn region(&self) -> &RegionGen {
        &self.region
    }

    pub fn params(&self) -> &FlowParams {
        &self.params
    }

    pub fn cell_of(&self, x: f32, z: f32) -> Cell {
        (
            (x / self.params.cell).floor() as i32,
            (z / self.params.cell).floor() as i32,
        )
    }

    pub fn centre(&self, at: Cell) -> [f32; 2] {
        [
            (at.0 as f32 + 0.5) * self.params.cell,
            (at.1 as f32 + 0.5) * self.params.cell,
        ]
    }

    pub fn height(&self, at: Cell) -> f32 {
        let c = self.centre(at);
        self.region.height(c[0], c[1])
    }

    pub fn is_water(&self, at: Cell) -> bool {
        let c = self.centre(at);
        self.region.is_water(c[0], c[1])
    }

    /// The neighbour water leaves by: steepest descent of the eight.
    ///
    /// Ranked by fall per metre travelled rather than by fall alone, or a
    /// diagonal wins on being longer rather than on being steeper and every
    /// channel in the world drifts toward forty-five degrees.
    ///
    /// `None` means no neighbour is lower. On this ground that should only
    /// happen in water, and a test says so: the region layer rules out hollows
    /// in the continuous field, but sampling it on a lattice is free to invent
    /// one the field does not have.
    pub fn downstream(&self, at: Cell) -> Option<Cell> {
        self.downstream_via(&mut None, at)
    }

    /// [`Self::height`], answered from `memo` when it has been asked before.
    ///
    /// A flood asks for the same cell from up to nine directions, and a height
    /// is some seventy hashes and four octaves of noise. Without this the cost
    /// of a basin is an order of magnitude over what it needs to be, entirely in
    /// re-deriving ground that has not changed.
    fn height_via(&self, memo: &mut Option<HashMap<Cell, f32>>, at: Cell) -> f32 {
        match memo {
            None => self.height(at),
            Some(map) => match map.get(&at) {
                Some(h) => *h,
                None => {
                    let h = self.height(at);
                    map.insert(at, h);
                    h
                }
            },
        }
    }

    fn is_water_via(&self, memo: &mut Option<HashMap<Cell, f32>>, at: Cell) -> bool {
        self.height_via(memo, at) < self.region.params().sea_level
    }

    fn downstream_via(&self, memo: &mut Option<HashMap<Cell, f32>>, at: Cell) -> Option<Cell> {
        let here = self.height_via(memo, at);
        let mut best: Option<(Cell, f32)> = None;
        for (dx, dz) in NEIGHBOURS {
            let next = (at.0 + dx, at.1 + dz);
            let drop = here - self.height_via(memo, next);
            if drop <= 0.0 {
                continue;
            }
            let span = if dx != 0 && dz != 0 {
                core::f32::consts::SQRT_2
            } else {
                1.0
            };
            let steepness = drop / span;
            if best.is_none_or(|(_, b)| steepness > b) {
                best = Some((next, steepness));
            }
        }
        best.map(|(c, _)| c)
    }

    /// Follows the water from a cell to the first one that is already wet.
    ///
    /// The step cap is a guard on the lattice, not on the world: the continuous
    /// field cannot circle, but two cells that each read as lower than the other
    /// through the sampling could, and a world generator that hangs is worse
    /// than one that gives up.
    pub fn trace(&self, from: Cell) -> Vec<Cell> {
        let mut path = vec![from];
        let mut at = from;
        let cap = (self.region.sink_reach() / self.params.cell) as usize * 8 + 64;
        while path.len() < cap {
            if self.is_water(at) {
                break;
            }
            let Some(next) = self.downstream(at) else {
                break;
            };
            at = next;
            path.push(at);
        }
        path
    }

    /// The water cell the ground under a cell drains out through, or `None` if
    /// the trace never reached water.
    pub fn outlet_of(&self, at: Cell) -> Option<Cell> {
        let end = *self.trace(at).last()?;
        self.is_water(end).then_some(end)
    }

    /// Which sink the ground under a cell drains into.
    ///
    /// The body of water, as opposed to [`Self::outlet_of`], which is the single
    /// cell of it this ground arrives at. Many mouths share one sink.
    pub fn sink_of(&self, at: Cell) -> Option<Sink> {
        let end = self.outlet_of(at)?;
        let c = self.centre(end);
        self.region.nearest_sink(c[0], c[1]).map(|(s, _)| s)
    }

    /// The basin a cell belongs to, flooding and accumulating it if this is the
    /// first time anything asked.
    pub fn basin_at(&mut self, at: Cell) -> Option<&Basin> {
        let outlet = self.outlet_of(at)?;
        if !self.basins.contains_key(&outlet) {
            let basin = self.flood(outlet);
            self.basins.insert(outlet, basin);
        }
        self.basins.get(&outlet)
    }

    /// How much ground drains through a cell, in square metres.
    pub fn drained_area(&mut self, at: Cell) -> f32 {
        let area = self.params.cell * self.params.cell;
        match self.basin_at(at) {
            Some(b) => b.cells_drained(at) as f32 * area,
            None => 0.0,
        }
    }

    /// Width of the channel at a cell, in metres, or zero where the water has
    /// not gathered into one.
    ///
    /// Width goes as the square root of drained ground, which is the shape
    /// hydraulic geometry gives and the reason a river can drain a hundred times
    /// the land of its own headwater and be ten times the width rather than a
    /// hundred.
    pub fn channel_width(&mut self, at: Cell) -> f32 {
        let area = self.drained_area(at);
        if area < self.params.channel_threshold {
            return 0.0;
        }
        self.params.width_coefficient * area.sqrt()
    }

    /// Grows a basin upstream from its sink, then counts what drains through
    /// each cell of it.
    ///
    /// Upstream rather than downstream, and that is what makes it exact. Walking
    /// down from every cell would need to know which cells to start from, which
    /// is the question being asked. Growing up from the water instead admits a
    /// cell exactly when the cell it drains into is already in -- so the basin
    /// arrives as a tree, already rooted, with every cell reached once.
    fn flood(&self, outlet: Cell) -> Basin {
        let memo = &mut Some(HashMap::new());
        let mut order: Vec<Cell> = Vec::new();
        let mut drained: HashMap<Cell, u32> = HashMap::new();
        let mut claimed: HashMap<Cell, ()> = HashMap::new();
        claimed.insert(outlet, ());
        let mut frontier: Vec<Cell> = vec![outlet];

        let mut truncated = false;
        while let Some(cell) = frontier.pop() {
            if truncated {
                break;
            }
            for (dx, dz) in NEIGHBOURS {
                let up = (cell.0 + dx, cell.1 + dz);
                if claimed.contains_key(&up) || self.is_water_via(memo, up) {
                    continue;
                }
                if self.downstream_via(memo, up) != Some(cell) {
                    continue;
                }
                if order.len() >= self.params.max_basin_cells {
                    truncated = true;
                    break;
                }
                claimed.insert(up, ());
                drained.insert(up, 1);
                order.push(up);
                frontier.push(up);
            }
        }

        // Upstream before downstream, so a cell has collected everything above
        // it before it hands its total on. `order` is the flood's own order,
        // which reached every cell after the one it drains into, so walking it
        // backwards is a topological sort already paid for.
        for i in (0..order.len()).rev() {
            let cell = order[i];
            let carried = drained.get(&cell).copied().unwrap_or(1);
            if let Some(next) = self.downstream_via(memo, cell)
                && let Some(slot) = drained.get_mut(&next)
            {
                *slot += carried;
            }
        }

        Basin {
            key: outlet,
            order,
            drained,
            truncated,
        }
    }

    /// Basins held in memory, for a caller that wants to bound what it keeps.
    pub fn cached_basins(&self) -> usize {
        self.basins.len()
    }

    pub fn forget_basins(&mut self) {
        self.basins.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::region::RegionParams;

    fn flow() -> FlowField {
        FlowField::new(
            RegionGen::new(&RegionParams::default()),
            FlowParams::default(),
        )
    }

    fn hash32(mut x: u32) -> u32 {
        x ^= x >> 16;
        x = x.wrapping_mul(0x7feb_352d);
        x ^= x >> 15;
        x = x.wrapping_mul(0x846c_a68b);
        x ^= x >> 16;
        x
    }

    fn probes(count: i32) -> impl Iterator<Item = (f32, f32)> {
        (0..count).map(move |i| {
            let h = hash32(i as u32 + 1);
            let x = ((h >> 8) as f32 / 16_777_216.0 - 0.5) * 30_000.0;
            let z = ((hash32(h) >> 8) as f32 / 16_777_216.0 - 0.5) * 30_000.0;
            (x, z)
        })
    }

    /// The region layer rules out hollows in the continuous field. Sampling it
    /// on a lattice is a separate promise, and this is the one that could fail
    /// on its own: a cell lower than all eight of its neighbours is a pit the
    /// ground does not have and the flood would never drain.
    #[test]
    fn no_land_cell_is_lower_than_all_its_neighbours() {
        let f = flow();
        let (mut land, mut pits) = (0, 0);
        for (x, z) in probes(4_000) {
            let c = f.cell_of(x, z);
            if f.is_water(c) {
                continue;
            }
            land += 1;
            if f.downstream(c).is_none() {
                pits += 1;
                if pits <= 3 {
                    println!("pit at {c:?} height {:.2}", f.height(c));
                }
            }
        }
        assert!(land > 1_000, "almost every probe started wet: {land}");
        assert_eq!(pits, 0, "{pits} of {land} land cells drain nowhere");
    }

    /// The lattice version of the guarantee the region layer makes.
    #[test]
    fn every_cell_traces_into_water() {
        let f = flow();
        for (x, z) in probes(2_000) {
            let c = f.cell_of(x, z);
            let path = f.trace(c);
            let end = *path.last().expect("empty trace");
            assert!(
                f.is_water(end),
                "trace from {c:?} ran {} cells and stopped dry at {end:?}, height {:.2}",
                path.len(),
                f.height(end)
            );
        }
    }

    /// What a basin is for. Water gathers going down, so the ground drained has
    /// to grow every step of the way -- if it ever shrank, the count upstream
    /// would be counting something that does not arrive.
    #[test]
    fn drained_ground_only_grows_downstream() {
        let mut f = flow();
        let mut checked = 0;
        for (x, z) in probes(300) {
            let start = f.cell_of(x, z);
            if f.is_water(start) {
                continue;
            }
            let path = f.trace(start);
            let mut last = 0.0f32;
            for cell in path {
                if f.is_water(cell) {
                    break;
                }
                let area = f.drained_area(cell);
                if area == 0.0 {
                    break;
                }
                assert!(
                    area >= last,
                    "drained ground fell from {last:.0} to {area:.0} at {cell:?}"
                );
                last = area;
                checked += 1;
            }
        }
        assert!(checked > 2_000, "barely walked anything: {checked}");
    }

    /// A cell drains itself plus everything that drains into it, and nothing
    /// else. This is the arithmetic the widths are read off, so it is worth
    /// stating rather than trusting the traversal.
    /// The cell with the largest catchment anywhere near the probes, which is
    /// the one worth checking arithmetic on.
    ///
    /// Found by tracing rather than by sampling. A cell picked at random sits
    /// near a ridge far more often than on a main stem -- most of any catchment
    /// is its edges -- so sampling for a big one mostly finds headwater and
    /// concludes there are no rivers.
    fn fattest_cell(f: &mut FlowField, count: i32) -> (Cell, f32) {
        let mut best = ((0, 0), 0.0f32);
        for (x, z) in probes(count) {
            let start = f.cell_of(x, z);
            if f.is_water(start) {
                continue;
            }
            for cell in f.trace(start) {
                let area = f.drained_area(cell);
                if area > best.1 {
                    best = (cell, area);
                }
            }
        }
        best
    }

    #[test]
    fn a_cell_drains_itself_and_everything_above_it() {
        let mut f = flow();
        let (start, area) = fattest_cell(&mut f, 200);
        assert!(
            area > 100_000.0,
            "the biggest catchment found was {area:.0} m2, too small to prove anything"
        );
        let basin = f.basin_at(start).expect("no basin").clone();
        let mut checked = 0;
        for &cell in basin.cells().iter().take(3_000) {
            let mut above = 0;
            for (dx, dz) in NEIGHBOURS {
                let up = (cell.0 + dx, cell.1 + dz);
                if f.downstream(up) == Some(cell) {
                    above += basin.cells_drained(up);
                }
            }
            assert_eq!(
                basin.cells_drained(cell),
                above + 1,
                "cell {cell:?} claims {} drained, its neighbours give {}",
                basin.cells_drained(cell),
                above + 1
            );
            checked += 1;
        }
        assert!(
            checked > 100,
            "basin too small to prove anything: {checked}"
        );
    }

    /// The claim the whole module rests on: a basin is finite, because the
    /// region layer put a sink within reach of everywhere. Truncation here is
    /// not a slow test, it is that promise broken.
    #[test]
    fn a_basin_is_small_enough_to_hold() {
        let mut f = flow();
        let mut biggest = 0;
        for (x, z) in probes(120) {
            let c = f.cell_of(x, z);
            if let Some(b) = f.basin_at(c) {
                assert!(!b.truncated, "basin {:?} ran past the cap", b.key);
                biggest = biggest.max(b.len());
            }
        }
        assert!(
            biggest > 200,
            "never found a basin worth the name: {biggest}"
        );
        assert!(
            biggest < FlowParams::default().max_basin_cells,
            "largest basin was {biggest} cells"
        );
    }

    /// Two machines on one seed have to agree about the rivers, and a cache is
    /// exactly the sort of thing that makes them not.
    #[test]
    fn the_same_seed_drains_the_same_way() {
        let (mut a, mut b) = (flow(), flow());
        for (x, z) in probes(200) {
            let c = a.cell_of(x, z);
            assert_eq!(a.drained_area(c).to_bits(), b.drained_area(c).to_bits());
        }
    }

    /// The order basins are asked for must not reach the answers. A cache keyed
    /// on the sink and filled from a pure flood should not care, and this is
    /// what says so.
    #[test]
    fn asking_in_a_different_order_gives_the_same_answer() {
        let mut forward = flow();
        let mut backward = flow();
        let cells: Vec<Cell> = probes(150).map(|(x, z)| forward.cell_of(x, z)).collect();
        let ahead: Vec<f32> = cells.iter().map(|c| forward.drained_area(*c)).collect();
        let mut behind: Vec<f32> = cells
            .iter()
            .rev()
            .map(|c| backward.drained_area(*c))
            .collect();
        behind.reverse();
        assert_eq!(ahead, behind);
    }

    /// A river is not the same size everywhere.
    ///
    /// Stated as a ratio inside one basin rather than as a width anywhere,
    /// because a width is not evidence: at the channel threshold every stream in
    /// the world is already a couple of metres across, so "the widest is over
    /// two metres" is satisfied by a world of identical ditches. What has to be
    /// true is that the mouth carries far more than the headwaters -- that is
    /// discharge doing something.
    #[test]
    fn rivers_widen_from_headwater_to_mouth() {
        let mut f = flow();
        let (fattest, mouth_area) = fattest_cell(&mut f, 200);
        let basin = f.basin_at(fattest).expect("no basin").clone();
        assert!(
            basin.len() > 200,
            "basin too small to have a shape: {}",
            basin.len()
        );

        // Around a tenth of cells are headwater, not the third a branching tree
        // would give. The flow here is closer to parallel than to dendritic:
        // water runs down a smooth cone in near-lines rather than gathering into
        // forks, because the detail that would organise it into branches is
        // small against the base slope. Worth knowing before rivers are drawn
        // from this, so the floor below only asks that headwater exists at all
        // rather than pretending to a shape the ground does not have.
        let leaves = basin
            .cells()
            .iter()
            .filter(|c| basin.cells_drained(**c) == 1)
            .count();
        assert!(leaves > 20, "the basin has {leaves} headwater cells");

        let biggest = basin
            .cells()
            .iter()
            .map(|c| basin.cells_drained(*c))
            .max()
            .unwrap_or(0);
        assert!(
            biggest > 40,
            "the main stem of this basin gathers only {biggest} cells"
        );
        assert!(
            f.channel_width(fattest) > 4.0,
            "the fattest channel found is {:.2} m across {:.0} m2",
            f.channel_width(fattest),
            mouth_area
        );
    }

    /// Channels have to be rare. Every cell carrying one would mean the
    /// threshold is doing nothing and the whole world is river.
    #[test]
    fn channels_are_a_small_share_of_the_ground() {
        let mut f = flow();
        let (mut land, mut wet) = (0, 0);
        for (x, z) in probes(1_500) {
            let c = f.cell_of(x, z);
            if f.is_water(c) {
                continue;
            }
            land += 1;
            if f.channel_width(c) > 0.0 {
                wet += 1;
            }
        }
        let share = wet as f32 / land as f32;
        assert!(
            share < 0.35,
            "channels cover {:.0}% of dry land",
            share * 100.0
        );
    }

    /// Steepest descent has to be by slope, not by drop, or a diagonal wins for
    /// being longer and every channel drifts toward forty-five degrees.
    #[test]
    fn descent_is_ranked_by_slope_not_by_drop() {
        let straight = 1.0f32;
        let diagonal = 1.4f32 / core::f32::consts::SQRT_2;
        assert!(
            straight > diagonal,
            "a 1.4 m drop across a diagonal should lose to 1.0 m straight"
        );
    }
}
