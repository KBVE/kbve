//! The bridge from mmorpg's height field to `bevy_pathfinder`'s grid.
//!
//! `BlockGrid` was written for a voxel world, where a cell's walkability is a
//! property of the block sitting in it. Here there are no blocks: the ground is
//! a continuous function, so walkability has to be derived. A cell is solid
//! when the ground there is neither too steep to climb nor under water, and the
//! two are separate tests because they fail in different places -- a riverbed
//! is flat and still impassable.
//!
//! One metre per cell. The character is about that wide, so a finer grid would
//! promise gaps it cannot fit through and a coarser one would refuse gaps it
//! can.

use bevy::prelude::*;
use bevy_pathfinder::grid::{BlockGrid, CellNav, SurfaceKind};

use super::river::river_at;
use super::world::height_at;

/// Metres per navigation cell.
pub const CELL_SIZE: f32 = 1.0;

/// Steepest ground still considered walkable, as metres of rise between
/// neighbouring cells. Measured across the cell rather than from the analytic
/// normal: a cell is crossed in one step, so what matters is the climb the step
/// asks for, not the gradient at its centre.
const MAX_WALK_RISE: f32 = 0.95;

/// Ground this close under the surface is waded, not swum, and stays walkable
/// so a shoreline is not a wall.
const WADE_DEPTH: f32 = 0.6;

/// Cell coordinates containing a world position.
pub fn world_to_cell(position: Vec3) -> (i32, i32) {
    (
        (position.x / CELL_SIZE).floor() as i32,
        (position.z / CELL_SIZE).floor() as i32,
    )
}

/// Centre of a cell, on the ground.
pub fn cell_to_world(x: i32, z: i32) -> Vec3 {
    let wx = (x as f32 + 0.5) * CELL_SIZE;
    let wz = (z as f32 + 0.5) * CELL_SIZE;
    Vec3::new(wx, height_at(wx, wz), wz)
}

/// How deep the water is over ground already sampled at `ground`.
fn water_depth(x: f32, z: f32, ground: f32) -> f32 {
    river_at(x, z)
        .map(|sample| (sample.water_level - ground).max(0.0))
        .unwrap_or(0.0)
}

/// Classifies one cell from its own height, its neighbours' heights, and the
/// water over it.
///
/// Taking the neighbours as an argument is what lets the grid builder sample
/// each height once and hand the same number to the four cells that need it.
fn classify(height: f32, neighbours: [f32; 4], water_depth: f32) -> CellNav {
    let rise = neighbours
        .iter()
        .map(|n| (n - height).abs())
        .fold(0.0f32, f32::max);

    let surface = if water_depth > WADE_DEPTH || rise > MAX_WALK_RISE {
        SurfaceKind::Blocked
    } else if water_depth > 0.0 {
        SurfaceKind::Slow
    } else {
        SurfaceKind::Solid
    };

    CellNav {
        height: height.round() as i32,
        surface,
        cost: surface.base_cost(),
    }
}

/// Classifies a single cell, sampling everything it needs.
///
/// The grid builder does not use this -- it shares samples between neighbours
/// instead -- but both apply the same rule, so they agree cell for cell, which
/// is what `a_cell_agrees_with_the_grid_that_holds_it` holds them to.
#[cfg(test)]
pub fn cell_at(x: i32, z: i32) -> CellNav {
    let centre = cell_to_world(x, z);
    let neighbours = [
        cell_to_world(x + 1, z).y,
        cell_to_world(x - 1, z).y,
        cell_to_world(x, z + 1).y,
        cell_to_world(x, z - 1).y,
    ];

    classify(
        centre.y,
        neighbours,
        water_depth(centre.x, centre.z, centre.y),
    )
}

/// Builds a grid covering `width` by `depth` cells from a cell origin.
///
/// Heights are sampled once each over a one-cell margin and then shared, which
/// is the difference between one `height_at` per cell and five.
pub fn build_grid(origin_x: i32, origin_z: i32, width: u32, depth: u32) -> BlockGrid {
    let stride = width as usize + 2;
    let rows = depth as usize + 2;

    let heights: Vec<f32> = (0..rows)
        .flat_map(|row| {
            (0..stride).map(move |column| {
                let x = (origin_x + column as i32 - 1) as f32 + 0.5;
                let z = (origin_z + row as i32 - 1) as f32 + 0.5;
                height_at(x * CELL_SIZE, z * CELL_SIZE)
            })
        })
        .collect();

    let mut cells = Vec::with_capacity((width * depth) as usize);
    for dz in 0..depth as usize {
        for dx in 0..width as usize {
            let here = (dz + 1) * stride + dx + 1;
            let height = heights[here];
            let wx = (origin_x + dx as i32) as f32 + 0.5;
            let wz = (origin_z + dz as i32) as f32 + 0.5;

            cells.push(classify(
                height,
                [
                    heights[here + 1],
                    heights[here - 1],
                    heights[here + stride],
                    heights[here - stride],
                ],
                water_depth(wx * CELL_SIZE, wz * CELL_SIZE, height),
            ));
        }
    }

    BlockGrid::from_cells(origin_x, origin_z, width, depth, cells)
        .expect("cell count is width * depth by construction")
}

#[cfg(test)]
mod tests {
    use super::*;
    use bevy_pathfinder::flow_field::FlowField;

    #[test]
    fn a_cell_round_trips_through_world_space() {
        for (x, z) in [(0, 0), (7, -3), (-19, 44)] {
            assert_eq!(
                world_to_cell(cell_to_world(x, z)),
                (x, z),
                "cell ({x}, {z}) did not survive the trip through world space"
            );
        }
    }

    #[test]
    fn the_grid_reports_the_size_it_was_asked_for() {
        let grid = build_grid(-8, -8, 16, 16);
        assert_eq!(grid.len(), 16 * 16);
        assert!(grid.in_bounds(-8, -8));
        assert!(grid.in_bounds(7, 7));
        assert!(!grid.in_bounds(8, 8));
    }

    #[test]
    fn a_cell_agrees_with_the_grid_that_holds_it() {
        let grid = build_grid(0, 0, 12, 12);
        for z in 0..12 {
            for x in 0..12 {
                assert_eq!(
                    grid.get(x, z).surface,
                    cell_at(x, z).surface,
                    "grid and direct sample disagree at ({x}, {z})"
                );
            }
        }
    }

    /// A cell whose ground is under enough water to be impassable.
    fn a_blocked_cell() -> Option<(i32, i32)> {
        for z in -400..400 {
            for x in -400..400 {
                if !cell_at(x, z).walkable() {
                    return Some((x, z));
                }
            }
        }
        None
    }

    /// A window holding both walkable and blocked ground, centred on water.
    fn mixed_window() -> Option<(i32, i32)> {
        let (wx, wz) = a_blocked_cell()?;
        let (ox, oz) = (wx - 32, wz - 32);
        let grid = build_grid(ox, oz, 64, 64);
        let blocked = grid.iter().filter(|(_, _, c)| !c.walkable()).count();
        (blocked > 0 && blocked < grid.len()).then_some((ox, oz))
    }

    #[test]
    fn a_route_across_blocked_ground_never_steps_into_it() {
        let (ox, oz) = mixed_window().expect("no window with both walkable and blocked ground");
        let grid = build_grid(ox, oz, 64, 64);

        let goal = grid
            .iter()
            .find(|(_, _, c)| c.walkable())
            .map(|(x, z, _)| (x, z))
            .expect("window has walkable ground by construction");
        let field = FlowField::compute(&grid, &[goal]);

        let mut walked = 0;
        for (x, z, cell) in grid.iter() {
            if !cell.walkable() || field.distance(x, z).is_none() {
                continue;
            }

            let (mut cx, mut cz) = (x, z);
            for _ in 0..4096 {
                if field.at_goal(cx, cz) {
                    break;
                }
                let Some((dx, dz)) = field.direction(cx, cz) else {
                    break;
                };
                cx += dx;
                cz += dz;
                assert!(
                    grid.is_walkable(cx, cz),
                    "the route from ({x}, {z}) stepped into blocked ground at ({cx}, {cz})"
                );
            }
            walked += 1;
        }

        assert!(walked > 64, "only {walked} cells had a route to follow");
    }

    #[test]
    fn deep_water_is_not_walkable() {
        let mut found = None;
        for z in -300..300 {
            for x in -300..300 {
                let centre = cell_to_world(x, z);
                if water_depth(centre.x, centre.z, centre.y) > WADE_DEPTH + 1.0 {
                    found = Some((x, z));
                    break;
                }
            }
            if found.is_some() {
                break;
            }
        }

        let (x, z) = found.expect("no deep water within 300 cells of the origin");
        assert!(
            !cell_at(x, z).walkable(),
            "cell ({x}, {z}) is under deep water and still walkable"
        );
    }

    #[test]
    fn the_ground_the_dummies_stand_on_is_walkable() {
        for index in 0..8 {
            let angle = index as f32 / 8.0 * core::f32::consts::TAU;
            let (wx, wz) = (angle.cos() * 9.0, angle.sin() * 9.0);
            let (x, z) = world_to_cell(Vec3::new(wx, 0.0, wz));
            assert!(
                cell_at(x, z).walkable(),
                "the dummy ring sits on unwalkable ground at ({x}, {z})"
            );
        }
    }
}

#[cfg(test)]
mod cost {
    use super::*;

    #[test]
    #[ignore = "diagnostic"]
    fn how_long_the_startup_grid_takes() {
        for radius in [32i32, 48, 96] {
            let span = (radius * 2) as u32;
            let start = std::time::Instant::now();
            let grid = build_grid(-radius, -radius, span, span);
            let elapsed = start.elapsed();
            let blocked = grid.iter().filter(|(_, _, c)| !c.walkable()).count();
            println!(
                "{span}x{span} grid in {elapsed:?}, {blocked}/{} blocked",
                grid.len()
            );
        }
    }
}
