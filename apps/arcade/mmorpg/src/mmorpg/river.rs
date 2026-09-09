//! Rivers and ponds as a downhill flow network over a coarse lattice.
//!
//! Routing is local: a cell picks its downstream from its own eight neighbours, so two chunks can
//! never disagree and nothing has to be generated in order.

use bevy::prelude::*;
use core::cell::RefCell;

use super::world::{WORLD_SEED, hash, macro_height};

/// Spacing in meters of the flow lattice.
///
/// Close to the dominant feature size of the height field, so neighbouring nodes sit on the same
/// slope and the network reads as one drainage basin rather than noise.
pub const RIVER_CELL: f32 = 176.0;

/// Fraction of a cell a node may wander from its center.
const NODE_JITTER: f32 = 0.34;

/// Drainage a cell needs before it carries a visible channel.
const MIN_DRAINAGE: u32 = 4;

/// Drainage a sink needs before it holds standing water.
///
/// Lower than [`MIN_DRAINAGE`]: a depression pools whatever reaches it, while a channel needs
/// sustained flow to cut itself.
const POND_MIN_DRAINAGE: u32 = 2;

/// Channel half-width in meters at [`MIN_DRAINAGE`], and the most it can grow to.
const MIN_HALF_WIDTH: f32 = 3.0;
const MAX_HALF_WIDTH: f32 = 11.0;

/// How far past the channel the bank blends back into untouched ground.
pub const BANK_WIDTH: f32 = 16.0;

/// Depth of the channel below its water line.
const CHANNEL_DEPTH: f32 = 3.2;

/// Depth of a pond below its water line, and the span of its bowl.
const POND_DEPTH: f32 = 4.5;
const POND_MIN_RADIUS: f32 = 16.0;
const POND_MAX_RADIUS: f32 = 46.0;

/// Slots in the per-thread node memo; a chunk touches far fewer than this.
const NODE_CACHE_SLOTS: usize = 512;

/// One lattice node: where it sits and how high it starts.
#[derive(Clone, Copy)]
struct Node {
    position: Vec2,
    height: f32,
}

/// What the water field says about a point.
#[derive(Clone, Copy, Debug)]
pub struct RiverSample {
    /// Distance in meters from the channel center or pond center.
    pub distance: f32,
    /// Half-width of the channel, or radius of the pond.
    pub half_width: f32,
    /// World height of the water surface.
    pub water_level: f32,
    /// How far the bed sits below the surface.
    pub depth: f32,
}

impl RiverSample {
    /// Bed height under the water surface.
    pub fn bed(&self) -> f32 {
        self.water_level - self.depth
    }

    /// 1 inside the channel, falling to 0 across the bank.
    pub fn carve_weight(&self) -> f32 {
        let outer = self.half_width + BANK_WIDTH;
        if self.distance >= outer {
            return 0.0;
        }
        let t = ((outer - self.distance) / (outer - self.half_width)).clamp(0.0, 1.0);
        t * t * (3.0 - 2.0 * t)
    }
}

thread_local! {
    static NODE_CACHE: RefCell<Vec<Option<(IVec2, Node)>>> =
        RefCell::new(vec![None; NODE_CACHE_SLOTS]);
}

/// Lattice cell containing a world position.
pub fn cell_at(x: f32, z: f32) -> IVec2 {
    IVec2::new(
        (x / RIVER_CELL).floor() as i32,
        (z / RIVER_CELL).floor() as i32,
    )
}

fn slot_of(cell: IVec2) -> usize {
    let mixed = (cell.x as u32)
        .wrapping_mul(0x27d4_eb2d)
        .wrapping_add((cell.y as u32).wrapping_mul(0x1656_67b1));
    (mixed as usize) % NODE_CACHE_SLOTS
}

/// Node for a cell, memoized because the flow search revisits the same cells constantly.
///
/// The memo is transparent: [`node_uncached`] is pure, so a hit and a miss return the same value.
fn node(cell: IVec2) -> Node {
    let slot = slot_of(cell);
    NODE_CACHE.with(|cache| {
        let mut cache = cache.borrow_mut();
        if let Some((cached_cell, cached)) = cache[slot]
            && cached_cell == cell
        {
            return cached;
        }
        let computed = node_uncached(cell);
        cache[slot] = Some((cell, computed));
        computed
    })
}

fn node_uncached(cell: IVec2) -> Node {
    let offset_x = hash(cell.x, cell.y, WORLD_SEED ^ 0x00a1_7e21) - 0.5;
    let offset_z = hash(cell.x, cell.y, WORLD_SEED ^ 0x5f3b_09c7) - 0.5;
    let position = Vec2::new(
        (cell.x as f32 + 0.5 + offset_x * NODE_JITTER * 2.0) * RIVER_CELL,
        (cell.y as f32 + 0.5 + offset_z * NODE_JITTER * 2.0) * RIVER_CELL,
    );
    Node {
        position,
        height: macro_height(position.x, position.y),
    }
}

const NEIGHBOURS: [IVec2; 8] = [
    IVec2::new(-1, -1),
    IVec2::new(0, -1),
    IVec2::new(1, -1),
    IVec2::new(-1, 0),
    IVec2::new(1, 0),
    IVec2::new(-1, 1),
    IVec2::new(0, 1),
    IVec2::new(1, 1),
];

/// Cell this one drains into, or `None` where it is a sink and water collects.
pub fn downstream(cell: IVec2) -> Option<IVec2> {
    let here = node(cell);
    let mut best: Option<(IVec2, f32)> = None;
    for offset in NEIGHBOURS {
        let candidate = cell + offset;
        let height = node(candidate).height;
        if height >= here.height {
            continue;
        }
        if best.is_none_or(|(_, lowest)| height < lowest) {
            best = Some((candidate, height));
        }
    }
    best.map(|(candidate, _)| candidate)
}

/// Cells draining into this one, counted two steps upstream so trunks outgrow their tributaries.
pub fn drainage(cell: IVec2) -> u32 {
    let mut total = 1;
    for offset in NEIGHBOURS {
        let feeder = cell + offset;
        if downstream(feeder) != Some(cell) {
            continue;
        }
        total += 1;
        for far in NEIGHBOURS {
            if downstream(feeder + far) == Some(feeder) {
                total += 1;
            }
        }
    }
    total
}

fn half_width_for(drainage: u32) -> f32 {
    let growth = (drainage.saturating_sub(MIN_DRAINAGE) as f32 / 10.0).clamp(0.0, 1.0);
    MIN_HALF_WIDTH + (MAX_HALF_WIDTH - MIN_HALF_WIDTH) * growth.sqrt()
}

fn pond_radius_for(drainage: u32) -> f32 {
    let growth = (drainage.saturating_sub(POND_MIN_DRAINAGE) as f32 / 10.0).clamp(0.0, 1.0);
    POND_MIN_RADIUS + (POND_MAX_RADIUS - POND_MIN_RADIUS) * growth.sqrt()
}

/// Closest point on segment `a`..`b` to `point`, as a parameter in 0..1.
fn project(point: Vec2, a: Vec2, b: Vec2) -> f32 {
    let span = b - a;
    let length_squared = span.length_squared();
    if length_squared <= f32::EPSILON {
        return 0.0;
    }
    ((point - a).dot(span) / length_squared).clamp(0.0, 1.0)
}

/// Water at a world position, taking the nearest channel or pond in the surrounding cells.
pub fn river_at(x: f32, z: f32) -> Option<RiverSample> {
    let point = Vec2::new(x, z);
    let origin = cell_at(x, z);
    let mut best: Option<RiverSample> = None;

    for row in -1..=1 {
        for col in -1..=1 {
            let cell = origin + IVec2::new(col, row);
            let flow = drainage(cell);
            let here = node(cell);

            let sample = match downstream(cell) {
                Some(next) if flow >= MIN_DRAINAGE => {
                    let there = node(next);
                    let t = project(point, here.position, there.position);
                    let closest = here.position.lerp(there.position, t);
                    RiverSample {
                        distance: point.distance(closest),
                        half_width: half_width_for(flow),
                        water_level: here.height + (there.height - here.height) * t,
                        depth: CHANNEL_DEPTH,
                    }
                }
                None if flow >= POND_MIN_DRAINAGE => RiverSample {
                    distance: point.distance(here.position),
                    half_width: pond_radius_for(flow),
                    water_level: here.height,
                    depth: POND_DEPTH,
                },
                _ => continue,
            };

            let closer = best.is_none_or(|current| {
                sample.distance - sample.half_width < current.distance - current.half_width
            });
            if closer {
                best = Some(sample);
            }
        }
    }

    best.filter(|sample| sample.distance < sample.half_width + BANK_WIDTH)
}

/// Height above the water line over which a bank dries out.
const BANK_RISE: f32 = 1.8;

/// How wet the ground is at a position: 1 at the water line, 0 once it has climbed clear of it.
///
/// Baked into the terrain mesh so the shader never has to know how water is routed.
pub fn bank_wetness(x: f32, z: f32, ground: f32) -> f32 {
    let Some(sample) = river_at(x, z) else {
        return 0.0;
    };
    let above = ground - sample.water_level;
    (1.0 - above / BANK_RISE).clamp(0.0, 1.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mmorpg::world::{height_at, natural_height};

    fn cells() -> impl Iterator<Item = IVec2> {
        (-14..14).flat_map(|x| (-14..14).map(move |y| IVec2::new(x, y)))
    }

    #[test]
    fn water_always_runs_downhill() {
        for cell in cells() {
            let Some(next) = downstream(cell) else {
                continue;
            };
            assert!(
                node(next).height < node(cell).height,
                "{cell} drains uphill into {next}"
            );
        }
    }

    #[test]
    fn flow_never_loops_back() {
        for cell in cells() {
            let Some(next) = downstream(cell) else {
                continue;
            };
            assert_ne!(
                downstream(next),
                Some(cell),
                "{cell} and {next} drain into each other"
            );
        }
    }

    #[test]
    fn every_course_reaches_a_sink() {
        for cell in cells() {
            let mut walk = cell;
            let mut steps = 0;
            while let Some(next) = downstream(walk) {
                walk = next;
                steps += 1;
                assert!(steps < 4096, "{cell} never reaches a sink");
            }
        }
    }

    #[test]
    fn carving_only_ever_lowers_ground() {
        for step in 0..4000 {
            let x = (step % 200) as f32 * 7.3 - 700.0;
            let z = (step / 200) as f32 * 31.0 - 300.0;
            assert!(
                height_at(x, z) <= natural_height(x, z) + 1e-3,
                "carve raised ground at {x},{z}"
            );
        }
    }

    #[test]
    fn the_bed_sits_under_its_own_water_line() {
        for step in 0..4000 {
            let x = (step % 200) as f32 * 6.1 - 600.0;
            let z = (step / 200) as f32 * 29.0 - 290.0;
            let Some(sample) = river_at(x, z) else {
                continue;
            };
            assert!(sample.bed() < sample.water_level);
            if sample.distance < sample.half_width {
                assert!(
                    height_at(x, z) <= sample.water_level + 1e-3,
                    "dry ground inside the channel at {x},{z}"
                );
            }
        }
    }

    #[test]
    fn the_memo_cannot_change_an_answer() {
        let probes: Vec<(f32, f32)> = (0..600)
            .map(|step| (step as f32 * 13.7 - 4000.0, step as f32 * -9.1 + 2500.0))
            .collect();
        let forward: Vec<f32> = probes.iter().map(|(x, z)| height_at(*x, *z)).collect();
        let backward: Vec<f32> = probes
            .iter()
            .rev()
            .map(|(x, z)| height_at(*x, *z))
            .collect();
        for (index, height) in backward.into_iter().rev().enumerate() {
            assert_eq!(forward[index].to_bits(), height.to_bits());
        }
    }

    #[test]
    #[ignore = "diagnostic"]
    fn drainage_histogram() {
        let mut histogram = [0u32; 24];
        let mut sinks = 0;
        let mut total = 0;
        for cell in cells() {
            total += 1;
            if downstream(cell).is_none() {
                sinks += 1;
            }
            let flow = drainage(cell).min(23) as usize;
            histogram[flow] += 1;
        }
        println!("cells={total} sinks={sinks}");
        let mut at_or_above = total;
        for (flow, count) in histogram.iter().enumerate() {
            if *count > 0 || flow < 12 {
                println!("  drainage {flow:>2}: {count:>5}  (>= {flow}: {at_or_above})");
            }
            at_or_above -= *count;
        }
    }

    #[test]
    fn banks_dry_out_as_they_climb_away_from_the_water() {
        let mut checked = 0;
        for step in 0..6000 {
            let x = (step % 300) as f32 * 5.7 - 850.0;
            let z = (step / 300) as f32 * 23.0 - 230.0;
            let Some(sample) = river_at(x, z) else {
                continue;
            };
            checked += 1;
            assert_eq!(bank_wetness(x, z, sample.water_level - 0.5), 1.0);
            assert_eq!(
                bank_wetness(x, z, sample.water_level + BANK_RISE + 0.1),
                0.0
            );
            let mid = bank_wetness(x, z, sample.water_level + BANK_RISE * 0.5);
            assert!((0.0..=1.0).contains(&mid) && mid > 0.0);
        }
        assert!(checked > 0, "no water found to test banks against");
    }

    #[test]
    fn water_covers_a_believable_share_of_the_world() {
        let mut wet = 0;
        let mut total = 0;
        for row in 0..260 {
            for col in 0..260 {
                let x = col as f32 * 11.0 - 1430.0;
                let z = row as f32 * 11.0 - 1430.0;
                total += 1;
                if river_at(x, z).is_some_and(|sample| sample.distance < sample.half_width) {
                    wet += 1;
                }
            }
        }
        let share = wet as f32 / total as f32;
        println!("water covers {share:.4}");
        assert!(
            (0.015..0.14).contains(&share),
            "water covers {share:.3} of the world"
        );
    }
}
