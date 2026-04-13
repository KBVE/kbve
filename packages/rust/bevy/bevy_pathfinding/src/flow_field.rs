//! Layer 2: FlowField — BFS-computed direction vectors toward goals.
//!
//! A flow field covers the same rectangular region as a [`BlockGrid`] and
//! stores one direction vector per walkable cell. Every cell's vector
//! points toward the next cell on the shortest path to the nearest goal.
//!
//! Computation is a single BFS from all goals simultaneously — O(n) where
//! n = grid cells. All agents sharing the same goal(s) look up their next
//! step in O(1) rather than running per-agent A*.
//!
//! ## Usage
//!
//! ```ignore
//! let grid = BlockGrid::new(0, 0, 64, 64);
//! // ... populate grid with block data ...
//!
//! // Compute flow field toward a single goal (e.g., a player position)
//! let field = FlowField::compute(&grid, &[(32, 32)]);
//!
//! // Query direction for an NPC at (10, 15)
//! if let Some((dx, dz)) = field.direction(10, 15) {
//!     // Move NPC by (dx, dz) — each component is -1, 0, or 1
//! }
//! ```

use serde::{Deserialize, Serialize};
use std::collections::VecDeque;

use crate::grid::BlockGrid;

// ---------------------------------------------------------------------------
// Direction encoding
// ---------------------------------------------------------------------------

/// Packed direction: (dx, dz) where each is -1, 0, or 1.
/// `(0, 0)` means "at goal" or "unreachable".
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Dir {
    pub dx: i8,
    pub dz: i8,
}

impl Dir {
    pub const ZERO: Self = Self { dx: 0, dz: 0 };

    #[inline]
    pub fn is_zero(self) -> bool {
        self.dx == 0 && self.dz == 0
    }
}

/// Cost-to-goal value for unreachable / unvisited cells.
const UNREACHABLE: u32 = u32::MAX;

// ---------------------------------------------------------------------------
// FlowField
// ---------------------------------------------------------------------------

/// Direction vector field computed from one or more goal positions.
///
/// Each walkable cell stores a [`Dir`] pointing toward the next cell on
/// the shortest path to the nearest goal, plus the BFS distance (cost).
#[derive(Clone, Debug, Serialize, Deserialize)]
#[cfg_attr(feature = "bevy", derive(bevy::prelude::Resource))]
pub struct FlowField {
    origin_x: i32,
    origin_z: i32,
    width: u32,
    depth: u32,
    /// BFS distance-to-goal per cell. `UNREACHABLE` for walls / unvisited.
    cost: Vec<u32>,
    /// Direction to move from each cell toward the goal.
    dirs: Vec<Dir>,
}

/// 8-connected neighbor offsets.
static OFFSETS: [(i32, i32); 8] = [
    (-1, -1),
    (0, -1),
    (1, -1),
    (-1, 0),
    (1, 0),
    (-1, 1),
    (0, 1),
    (1, 1),
];

impl FlowField {
    /// Compute a flow field from the given goals on the grid.
    ///
    /// Goals that are out of bounds or on non-walkable cells are skipped.
    /// Returns a flow field covering the same region as the grid.
    pub fn compute(grid: &BlockGrid, goals: &[(i32, i32)]) -> Self {
        let n = (grid.width * grid.depth) as usize;
        let mut cost = vec![UNREACHABLE; n];
        let mut dirs = vec![Dir::ZERO; n];
        let mut queue = VecDeque::with_capacity(n / 4);

        // Seed BFS from all goal positions
        for &(gx, gz) in goals {
            if !grid.in_bounds(gx, gz) || !grid.is_walkable(gx, gz) {
                continue;
            }
            let idx = Self::idx(gx, gz, grid.origin_x, grid.origin_z, grid.width);
            if let Some(i) = idx {
                if cost[i] == UNREACHABLE {
                    cost[i] = 0;
                    queue.push_back((gx, gz));
                }
            }
        }

        // BFS expansion — unweighted for speed (all steps cost 1).
        // For weighted terrain, swap to Dijkstra, but BFS is usually
        // good enough for MC block grids where cost differences are small.
        while let Some((cx, cz)) = queue.pop_front() {
            let ci = match Self::idx(cx, cz, grid.origin_x, grid.origin_z, grid.width) {
                Some(i) => i,
                None => continue,
            };
            let current_cost = cost[ci];

            for &(dx, dz) in &OFFSETS {
                let nx = cx + dx;
                let nz = cz + dz;

                if !grid.in_bounds(nx, nz) || !grid.is_walkable(nx, nz) {
                    continue;
                }

                // Height check — mobs can only step up/down 1 block
                let center_h = grid.get(cx, cz).height;
                let neigh_h = grid.get(nx, nz).height;
                if (neigh_h - center_h).abs() > crate::grid::MAX_STEP_HEIGHT {
                    continue;
                }

                let ni = match Self::idx(nx, nz, grid.origin_x, grid.origin_z, grid.width) {
                    Some(i) => i,
                    None => continue,
                };

                let new_cost = current_cost + 1;
                if new_cost < cost[ni] {
                    cost[ni] = new_cost;
                    // Direction points from neighbor TOWARD current (which is
                    // closer to goal) — so the neighbor should move by (-dx, -dz).
                    dirs[ni] = Dir {
                        dx: -dx as i8,
                        dz: -dz as i8,
                    };
                    queue.push_back((nx, nz));
                }
            }
        }

        Self {
            origin_x: grid.origin_x,
            origin_z: grid.origin_z,
            width: grid.width,
            depth: grid.depth,
            cost,
            dirs,
        }
    }

    /// Compute a flow field that guides AWAY from the given sources.
    ///
    /// This is the reverse of `compute` — useful for flee behavior. Cells
    /// near the sources have high "danger" and the field points toward
    /// safety (away from the nearest source).
    pub fn compute_flee(grid: &BlockGrid, sources: &[(i32, i32)]) -> Self {
        // First compute a normal flow field toward the sources to get
        // distance-to-source for every cell.
        let toward = Self::compute(grid, sources);

        let n = toward.cost.len();
        let mut dirs = vec![Dir::ZERO; n];

        // For each cell, pick the walkable neighbor with the HIGHEST
        // cost-to-source (farthest from danger).
        for (i, &cell_cost) in toward.cost.iter().enumerate() {
            if cell_cost == UNREACHABLE || cell_cost == 0 {
                continue;
            }

            let lx = (i as u32) % toward.width;
            let lz = (i as u32) / toward.width;
            let x = toward.origin_x + lx as i32;
            let z = toward.origin_z + lz as i32;

            let mut best_cost = cell_cost;
            let mut best_dir = Dir::ZERO;

            for &(dx, dz) in &OFFSETS {
                let nx = x + dx;
                let nz = z + dz;
                if let Some(ni) = Self::idx(nx, nz, toward.origin_x, toward.origin_z, toward.width)
                {
                    let nc = toward.cost[ni];
                    if nc != UNREACHABLE && nc > best_cost {
                        best_cost = nc;
                        best_dir = Dir {
                            dx: dx as i8,
                            dz: dz as i8,
                        };
                    }
                }
            }

            dirs[i] = best_dir;
        }

        Self {
            origin_x: toward.origin_x,
            origin_z: toward.origin_z,
            width: toward.width,
            depth: toward.depth,
            cost: toward.cost,
            dirs,
        }
    }

    // -- Queries -----------------------------------------------------------

    /// Get the direction to move from the given cell toward the nearest goal.
    /// Returns `None` if the cell is out of bounds or unreachable.
    pub fn direction(&self, x: i32, z: i32) -> Option<(i32, i32)> {
        let i = Self::idx(x, z, self.origin_x, self.origin_z, self.width)?;
        let d = self.dirs[i];
        if d.is_zero() && self.cost[i] != 0 {
            // Zero direction but not at goal = unreachable
            return None;
        }
        Some((d.dx as i32, d.dz as i32))
    }

    /// Get the BFS distance from the given cell to the nearest goal.
    /// Returns `None` if unreachable or out of bounds.
    pub fn distance(&self, x: i32, z: i32) -> Option<u32> {
        let i = Self::idx(x, z, self.origin_x, self.origin_z, self.width)?;
        let c = self.cost[i];
        if c == UNREACHABLE { None } else { Some(c) }
    }

    /// Convert the direction at `(x, z)` into a world-space target position.
    ///
    /// Given an entity at `(ex, ey, ez)` in f64 MC coords, returns the
    /// center of the next cell they should walk toward, with Y set to the
    /// grid's recorded height for that cell.
    pub fn next_target(&self, grid: &BlockGrid, x: i32, z: i32) -> Option<[f64; 3]> {
        let (dx, dz) = self.direction(x, z)?;
        if dx == 0 && dz == 0 {
            return None; // At goal
        }
        let nx = x + dx;
        let nz = z + dz;
        let cell = grid.get(nx, nz);
        Some([nx as f64 + 0.5, cell.height as f64, nz as f64 + 0.5])
    }

    /// Check if the given position is at or adjacent to a goal (distance 0 or 1).
    pub fn at_goal(&self, x: i32, z: i32) -> bool {
        self.distance(x, z).is_some_and(|d| d <= 1)
    }

    // -- Internals ---------------------------------------------------------

    #[inline]
    fn idx(x: i32, z: i32, origin_x: i32, origin_z: i32, width: u32) -> Option<usize> {
        let lx = x - origin_x;
        let lz = z - origin_z;
        if lx < 0 || lz < 0 || lx >= width as i32 {
            return None;
        }
        let i = lz as u32 * width + lx as u32;
        Some(i as usize)
    }
}
