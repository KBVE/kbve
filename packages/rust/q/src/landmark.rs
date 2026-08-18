//! The two built places the world puts down on its own.
//!
//! Everything else the ground grows -- stones, trees, flora -- is scattered per cell
//! and looks the same wherever you find it. A capital and a harbour are the opposite:
//! rare, large, and worth walking towards. They are what stop an endless world from
//! being endlessly the same, and what the roads eventually have somewhere to go.
//!
//! Sites are derived rather than authored, for the same reason the crossing is: the
//! client draws the walls, the server stops bodies at them, and neither is told where
//! they are by the other. A seed and a coordinate are the whole input.

use crate::worldgen::{HeightGen, Slab, hash32};

/// The lattice landmark sites are drawn on. One row of it holds one harbour; a cell
/// off the river may hold a capital.
pub const CELL: f32 = 1000.0;

/// How far from the river's centre the quay starts. Inside this the channel is still
/// being carved, and flattening there would fill the river in.
const QUAY_IN: f32 = 18.0;

/// How far out from the quay's inner edge the flattened ground reaches.
const QUAY_W: f32 = 34.0;

/// Half the harbour's length along the river.
const HARBOUR_Z: f32 = 40.0;

/// How far a pad's ground eases from the terrain into the flat.
const PAD_FEATHER: f32 = 12.0;

/// Half the walled square.
const WALL_HALF: f32 = 58.0;

/// Half the gap left in the wall for the road.
const GATE_HALF: f32 = 5.0;

const WALL_HALF_T: f32 = 1.2;
const WALL_HALF_H: f32 = 2.6;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LandmarkKind {
    Capital,
    Harbour,
}

/// A horizontal bar of a structure, as a flow field wants it: a line and a width.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Bar {
    pub from: [f32; 2],
    pub to: [f32; 2],
    pub half_width: f32,
}

/// One built place: where it stands, how high its ground was levelled, and how far
/// that levelling reaches.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Landmark {
    pub kind: LandmarkKind,
    /// Middle of the structure. For a harbour this is the middle of the quay, which
    /// is offset from the river rather than on it.
    pub centre: [f32; 2],
    /// The level the ground was brought to, which every floor sits on.
    pub pad_y: f32,
    /// Which bank a harbour stands on, -1 or 1. Meaningless for a capital.
    pub side: f32,
    /// Which way out of a capital the gate faces along x, -1 or 1. Meaningless for a
    /// harbour.
    pub gate: f32,
    /// The cell this was drawn from, so two windows can agree they found the same one.
    pub cell: [i32; 2],
}

/// What a flow field needs: what to close, and the line through it that stays open.
#[derive(Clone, Debug, PartialEq)]
pub struct LandmarkFootprint {
    pub solid: Vec<Bar>,
    pub open: Vec<Bar>,
    /// Raised walkways a body may stand underneath -- the piers, which are over water.
    pub decks: Vec<Bar>,
    pub deck_y: f32,
}

fn smooth(t: f32) -> f32 {
    let t = t.clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

fn cell_of(v: f32) -> i32 {
    (v / CELL).floor() as i32
}

fn seeded(seed: u32, salt: u32, a: i32, b: i32) -> u32 {
    hash32(seed ^ salt ^ hash32(a as u32).wrapping_add(hash32((b as u32).wrapping_mul(0x9e37))))
}

/// The harbour on one row of the river, which every row has.
///
/// The river is the only reason a harbour is anywhere, and the river is a single
/// channel wandering about `x = 0` for the whole length of the world. So harbours are
/// indexed by how far along it you are and nothing else -- there is no second river
/// for a second column of them to stand on.
pub fn harbour_in_row(seed: u32, hgen: &HeightGen, cz: i32) -> Landmark {
    let h = seeded(seed, 0x48_41_52_42, cz, 0);
    let z = cz as f32 * CELL + HARBOUR_Z + ((h >> 8) % 512) as f32;
    let side = if h & 1 == 0 { 1.0 } else { -1.0 };
    let x = hgen.river_x(z) + side * (QUAY_IN + QUAY_W * 0.5);
    Landmark {
        kind: LandmarkKind::Harbour,
        centre: [x, z],
        pad_y: (hgen.base_height(x, z)).max(hgen.water_level() + 1.6),
        side,
        gate: 0.0,
        cell: [0, cz],
    }
}

/// The capital in one cell, if it has one.
///
/// Never in the river's own column: a walled square dropped on the channel would dam
/// it, and the ground it needs levelled is the ground the water is in.
pub fn capital_in_cell(seed: u32, hgen: &HeightGen, cx: i32, cz: i32) -> Option<Landmark> {
    if cx == 0 {
        return None;
    }
    let h = seeded(seed, 0x43_41_50_54, cx, cz);
    if h % 2 != 0 {
        return None;
    }
    // Kept clear of the cell's own edges so a pad never leaves the cell it was
    // drawn in, which is what lets a lookup read one cell instead of nine.
    let inset = WALL_HALF + PAD_FEATHER + 40.0;
    let mut lo = cx as f32 * CELL + inset;
    let mut hi = (cx + 1) as f32 * CELL - inset;

    // And clear of the channel. Sitting off the river's own column is not enough on
    // its own: the column next to it reaches all the way to `x = 0`, and the channel
    // wanders most of the way out to meet it. A pad overlapping the water dams the
    // river, which the ground would then report as walkable.
    let keep_out = hgen.river_wander() + WALL_HALF + PAD_FEATHER + 30.0;
    if cx < 0 {
        hi = hi.min(-keep_out);
    } else {
        lo = lo.max(keep_out);
    }
    if hi - lo < 1.0 {
        return None;
    }

    let x = lo + ((h >> 7) % (hi - lo) as u32) as f32;
    let z_span = CELL - inset * 2.0;
    let z = cz as f32 * CELL + inset + ((h >> 17) % z_span as u32) as f32;
    Some(Landmark {
        kind: LandmarkKind::Capital,
        centre: [x, z],
        pad_y: hgen.base_height(x, z).max(hgen.water_level() + 2.4),
        side: 0.0,
        // Facing the river, so the gate opens onto the side the road arrives from.
        gate: if x < 0.0 { 1.0 } else { -1.0 },
        cell: [cx, cz],
    })
}

/// How far past `x = 0` a harbour's flattened ground can ever reach.
///
/// The channel wanders, and the quay wanders with it, so this is the wander plus the
/// whole width of the pad. It is what makes the height lookup cheap: outside this
/// band there is no harbour to test for, whatever the seed.
fn harbour_band(hgen: &HeightGen) -> f32 {
    hgen.river_wander() + QUAY_IN + QUAY_W + PAD_FEATHER
}

/// The levelled ground under the landmarks covering a point, if any.
///
/// Returns the height to move towards and how much of the way. Called from inside the
/// height function, so it must not call back into it: everything here reads the
/// unlevelled ground.
pub fn pad_at(seed: u32, hgen: &HeightGen, x: f32, z: f32) -> Option<(f32, f32)> {
    let mut best: Option<(f32, f32)> = None;
    let mut take = |pad: Option<(f32, f32)>| {
        if let Some((y, w)) = pad
            && w > 0.0
            && best.is_none_or(|(_, bw)| w > bw)
        {
            best = Some((y, w));
        }
    };

    if x.abs() <= harbour_band(hgen) {
        // A harbour's length is short against a row, but its jitter can push it over
        // a row edge, so both neighbours are read.
        let cz = cell_of(z);
        for row in [cz - 1, cz, cz + 1] {
            let mark = harbour_in_row(seed, hgen, row);
            take(mark.pad(hgen, x, z));
        }
    }

    if let Some(mark) = capital_in_cell(seed, hgen, cell_of(x), cell_of(z)) {
        take(mark.pad(hgen, x, z));
    }
    best
}

/// Every landmark whose structure falls in a window.
pub fn in_window(seed: u32, hgen: &HeightGen, origin: [f32; 2], extent: f32) -> Vec<Landmark> {
    let mut out = Vec::new();
    let reach = extent + WALL_HALF + PAD_FEATHER;

    if (origin[0].abs() - reach) <= harbour_band(hgen) {
        let from = cell_of(origin[1] - reach);
        let to = cell_of(origin[1] + reach);
        for cz in from..=to {
            let mark = harbour_in_row(seed, hgen, cz);
            if mark.in_reach(origin, reach) {
                out.push(mark);
            }
        }
    }

    let (x0, x1) = (cell_of(origin[0] - reach), cell_of(origin[0] + reach));
    let (z0, z1) = (cell_of(origin[1] - reach), cell_of(origin[1] + reach));
    for cx in x0..=x1 {
        for cz in z0..=z1 {
            if let Some(mark) = capital_in_cell(seed, hgen, cx, cz)
                && mark.in_reach(origin, reach)
            {
                out.push(mark);
            }
        }
    }
    out
}

/// The nearest harbour standing on a given bank.
///
/// Which bank matters because this is what a road is laid to. A capital sent to the
/// harbour across the water is a road that walks into the river, and the only crossing
/// in the world is the one at `z = 0`.
pub fn nearest_harbour_on_side(seed: u32, hgen: &HeightGen, at: [f32; 2], side: f32) -> Landmark {
    let cz = cell_of(at[1]);
    let mut best: Option<(f32, Landmark)> = None;
    for row in cz - 4..=cz + 4 {
        let mark = harbour_in_row(seed, hgen, row);
        if mark.side != side {
            continue;
        }
        let d = mark.distance(at);
        if best.is_none_or(|(bd, _)| d < bd) {
            best = Some((d, mark));
        }
    }
    // Every other row on average is the wrong bank, so a run of them is possible but
    // a run of nine is not; falling back to the nearest of either keeps this total.
    best.map(|(_, m)| m)
        .unwrap_or_else(|| harbour_in_row(seed, hgen, cz))
}

/// Where a road out of a capital leaves it, which is the outside of its gateway.
impl Landmark {
    pub fn gate_mouth(&self) -> [f32; 2] {
        [
            self.centre[0] + (WALL_HALF + 4.0) * self.gate,
            self.centre[1],
        ]
    }
}

/// The nearest landmark of each kind to a point, for pointing somebody at one.
pub fn nearest(seed: u32, hgen: &HeightGen, at: [f32; 2]) -> Vec<Landmark> {
    let mut out = Vec::new();
    let cz = cell_of(at[1]);
    let mut best: Option<(f32, Landmark)> = None;
    for row in cz - 2..=cz + 2 {
        let mark = harbour_in_row(seed, hgen, row);
        let d = mark.distance(at);
        if best.is_none_or(|(bd, _)| d < bd) {
            best = Some((d, mark));
        }
    }
    out.extend(best.map(|(_, m)| m));

    let cx = cell_of(at[0]);
    let mut best: Option<(f32, Landmark)> = None;
    for x in cx - 3..=cx + 3 {
        for z in cz - 3..=cz + 3 {
            let Some(mark) = capital_in_cell(seed, hgen, x, z) else {
                continue;
            };
            let d = mark.distance(at);
            if best.is_none_or(|(bd, _)| d < bd) {
                best = Some((d, mark));
            }
        }
    }
    out.extend(best.map(|(_, m)| m));
    out
}

impl Landmark {
    pub fn distance(&self, at: [f32; 2]) -> f32 {
        let d = [at[0] - self.centre[0], at[1] - self.centre[1]];
        (d[0] * d[0] + d[1] * d[1]).sqrt()
    }

    fn in_reach(&self, origin: [f32; 2], reach: f32) -> bool {
        (self.centre[0] - origin[0]).abs() <= reach && (self.centre[1] - origin[1]).abs() <= reach
    }

    /// How much of the way to this landmark's floor the ground at a point is brought,
    /// and the floor itself.
    fn pad(&self, hgen: &HeightGen, x: f32, z: f32) -> Option<(f32, f32)> {
        let w = match self.kind {
            LandmarkKind::Capital => {
                let dx = (x - self.centre[0]).abs();
                let dz = (z - self.centre[1]).abs();
                let inside = WALL_HALF + 6.0;
                smooth((inside + PAD_FEATHER - dx.max(dz)) / PAD_FEATHER)
            }
            LandmarkKind::Harbour => {
                // The quay follows the channel, so its inner edge is measured from
                // where the water is at this z rather than from where the middle of
                // the harbour happens to be.
                let u = (x - hgen.river_x(z)) * self.side;
                let dz = (z - self.centre[1]).abs();
                let along = smooth((HARBOUR_Z + PAD_FEATHER - dz) / PAD_FEATHER);
                let out = smooth((QUAY_IN + QUAY_W + PAD_FEATHER - u) / PAD_FEATHER);
                let in_ = smooth((u - QUAY_IN) / PAD_FEATHER);
                along * out * in_
            }
        };
        (w > 0.0).then_some((self.pad_y, w))
    }

    /// Everything solid this landmark stands as, for the client to draw and the
    /// server to stop bodies at.
    pub fn slabs(&self, hgen: &HeightGen) -> Vec<Slab> {
        match self.kind {
            LandmarkKind::Capital => self.capital_slabs(),
            LandmarkKind::Harbour => self.harbour_slabs(hgen),
        }
    }

    fn capital_slabs(&self) -> Vec<Slab> {
        let [cx, cz] = self.centre;
        let y = self.pad_y;
        let mid = y + WALL_HALF_H;
        let mut out = Vec::new();

        // Three closed walls and a fourth split around the gate.
        for side in [-1.0f32, 1.0] {
            out.push(Slab::flat(
                [cx, mid, cz + WALL_HALF * side],
                [WALL_HALF, WALL_HALF_H, WALL_HALF_T],
            ));
        }
        for side in [-1.0f32, 1.0] {
            if side == self.gate {
                let run = (WALL_HALF - GATE_HALF) * 0.5;
                for end in [-1.0f32, 1.0] {
                    out.push(Slab::flat(
                        [cx + WALL_HALF * side, mid, cz + (GATE_HALF + run) * end],
                        [WALL_HALF_T, WALL_HALF_H, run],
                    ));
                }
            } else {
                out.push(Slab::flat(
                    [cx + WALL_HALF * side, mid, cz],
                    [WALL_HALF_T, WALL_HALF_H, WALL_HALF],
                ));
            }
        }

        for sx in [-1.0f32, 1.0] {
            for sz in [-1.0f32, 1.0] {
                out.push(Slab::flat(
                    [cx + WALL_HALF * sx, y + 6.0, cz + WALL_HALF * sz],
                    [3.4, 6.0, 3.4],
                ));
            }
        }

        out.push(Slab::flat([cx, y + 9.0, cz], [7.0, 9.0, 7.0]));
        out.push(Slab::flat([cx - 24.0, y + 2.5, cz + 20.0], [5.0, 2.5, 7.0]));
        out.push(Slab::flat([cx + 24.0, y + 3.0, cz - 22.0], [4.0, 3.0, 4.0]));
        out.push(Slab::flat([cx + 20.0, y + 2.5, cz + 24.0], [8.0, 2.5, 4.0]));
        out
    }

    fn harbour_slabs(&self, hgen: &HeightGen) -> Vec<Slab> {
        let [hx, hz] = self.centre;
        let y = self.pad_y;
        let s = self.side;
        let mut out = vec![
            Slab::flat([hx + s * 2.0, y + 4.0, hz - 18.0], [8.0, 4.0, 10.0]),
            Slab::flat([hx - s * 4.0, y + 3.5, hz + 20.0], [6.0, 3.5, 7.0]),
            Slab::flat([hx - s * 9.0, y + 2.5, hz + 2.0], [3.0, 2.5, 3.0]),
        ];

        let deck_y = self.deck_y(hgen);
        for k in [-1.0f32, 0.0, 1.0] {
            let z = hz + k * 15.0;
            let inner = hgen.river_x(z) + s * 2.0;
            let outer = hgen.river_x(z) + s * (QUAY_IN + 2.0);
            let mid = (inner + outer) * 0.5;
            let half = ((outer - inner) * 0.5).abs();
            out.push(Slab::flat([mid, deck_y, z], [half, 0.16, 1.7]));
            for end in [-1.0f32, 1.0] {
                let px = mid + (half - 0.6) * end;
                let bed = hgen.water_level() - 1.6;
                let h = ((deck_y - bed) * 0.5).max(0.4);
                out.push(Slab::flat([px, deck_y - h, z], [0.16, h, 0.16]));
            }
        }
        out
    }

    /// The height the piers are decked at, which is the one thing a body can be under.
    pub fn deck_y(&self, hgen: &HeightGen) -> f32 {
        hgen.water_level() + 1.0
    }

    /// The structure as lines, which is what a flow field can be told about.
    pub fn footprint(&self, hgen: &HeightGen) -> LandmarkFootprint {
        let mut solid = Vec::new();
        let mut open = Vec::new();
        let mut decks = Vec::new();

        for slab in self.slabs(hgen) {
            let [x, _, z] = slab.centre;
            let [hx, _, hz] = slab.half_extents;
            // The long horizontal axis becomes the line; the short one its width.
            if hx >= hz {
                solid.push(Bar {
                    from: [x - hx, z],
                    to: [x + hx, z],
                    half_width: hz,
                });
            } else {
                solid.push(Bar {
                    from: [x, z - hz],
                    to: [x, z + hz],
                    half_width: hx,
                });
            }
        }

        match self.kind {
            LandmarkKind::Capital => {
                let [cx, cz] = self.centre;
                let x = cx + WALL_HALF * self.gate;
                // Reopened past the wall on both sides, or the gateway is a doorway
                // into a wall the field has already closed around.
                open.push(Bar {
                    from: [x - self.gate * 8.0, cz],
                    to: [x + self.gate * 8.0, cz],
                    half_width: GATE_HALF - 1.0,
                });
            }
            LandmarkKind::Harbour => {
                let [hx, hz] = self.centre;
                for k in [-1.0f32, 0.0, 1.0] {
                    let z = hz + k * 15.0;
                    let inner = hgen.river_x(z) + self.side * 2.0;
                    let outer = hgen.river_x(z) + self.side * (QUAY_IN + 2.0);
                    let bar = Bar {
                        from: [inner, z],
                        to: [outer, z],
                        half_width: 1.4,
                    };
                    open.push(bar);
                    decks.push(bar);
                }
                open.push(Bar {
                    from: [hx, hz - HARBOUR_Z],
                    to: [hx, hz + HARBOUR_Z],
                    half_width: 3.0,
                });
            }
        }

        LandmarkFootprint {
            solid,
            open,
            decks,
            deck_y: self.deck_y(hgen),
        }
    }
}

#[cfg(test)]
mod tests;
