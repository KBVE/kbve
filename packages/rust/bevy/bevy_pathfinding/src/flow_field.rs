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

/// Packed direction: (dx, dz) where each is -1, 0, or 1.
/// `(0, 0)` means "at goal" or "unreachable".
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Dir {
    pub dx: i8,
    pub dz: i8,
}

impl Dir {
    /// The zero direction `(0, 0)` — used as the default for unreachable
    /// or at-goal cells.
    pub const ZERO: Self = Self { dx: 0, dz: 0 };

    /// Returns `true` if both components are zero.
    #[inline]
    pub fn is_zero(self) -> bool {
        self.dx == 0 && self.dz == 0
    }
}

/// Cost-to-goal value for unreachable / unvisited cells.
const UNREACHABLE: u32 = u32::MAX;

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
    /// A single multi-source BFS expands outward from every goal in
    /// `O(width * depth)` time. Goals that are out of bounds or on
    /// non-walkable cells are skipped. The resulting field covers the
    /// same region as `grid`.
    ///
    /// # Arguments
    ///
    /// * `grid` — walkability grid the field is computed over.
    /// * `goals` — list of `(x, z)` block coords every walkable cell
    ///   should point toward.
    ///
    /// # Returns
    ///
    /// A new [`FlowField`]. If `goals` is empty or every goal is
    /// invalid, every cell will be marked unreachable.
    ///
    /// # Examples
    ///
    /// ```
    /// use bevy_pathfinding::{grid::{BlockGrid, CellNav, SurfaceKind}, flow_field::FlowField};
    ///
    /// let mut grid = BlockGrid::new(0, 0, 4, 4);
    /// for (x, z, _) in grid.clone().iter() {
    ///     grid.set(x, z, CellNav { height: 0, surface: SurfaceKind::Solid, cost: 1.0 });
    /// }
    /// let field = FlowField::compute(&grid, &[(0, 0)]);
    /// assert_eq!(field.distance(0, 0), Some(0));
    /// ```
    pub fn compute(grid: &BlockGrid, goals: &[(i32, i32)]) -> Self {
        let w = grid.width;
        let d = grid.depth;
        let n = (w * d) as usize;
        let mut cost = vec![UNREACHABLE; n];
        let mut dirs = vec![Dir::ZERO; n];
        let mut queue = VecDeque::with_capacity(n / 4);

        for &(gx, gz) in goals {
            if !grid.in_bounds(gx, gz) || !grid.is_walkable(gx, gz) {
                continue;
            }
            if let Some(i) = Self::idx(gx, gz, grid.origin_x, grid.origin_z, w, d)
                && cost[i] == UNREACHABLE
            {
                cost[i] = 0;
                queue.push_back((gx, gz));
            }
        }

        while let Some((cx, cz)) = queue.pop_front() {
            let ci = match Self::idx(cx, cz, grid.origin_x, grid.origin_z, w, d) {
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

                let center_h = grid.get(cx, cz).height;
                let neigh_h = grid.get(nx, nz).height;
                if (neigh_h - center_h).abs() > crate::grid::MAX_STEP_HEIGHT {
                    continue;
                }

                let ni = match Self::idx(nx, nz, grid.origin_x, grid.origin_z, w, d) {
                    Some(i) => i,
                    None => continue,
                };

                let new_cost = current_cost + 1;
                if new_cost < cost[ni] {
                    cost[ni] = new_cost;
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
            width: w,
            depth: d,
            cost,
            dirs,
        }
    }

    /// Compute a flow field that guides AWAY from the given sources.
    ///
    /// Internally calls [`FlowField::compute`] to build a "toward" field,
    /// then for every reachable cell picks the neighbor with the highest
    /// cost-to-source as the flee direction.
    ///
    /// # Arguments
    ///
    /// * `grid` — walkability grid the field is computed over.
    /// * `sources` — list of `(x, z)` block coords agents flee from.
    ///
    /// # Returns
    ///
    /// A new [`FlowField`] where each walkable cell's [`Dir`] points
    /// toward the highest-cost neighbor (the next step away from any
    /// source).
    pub fn compute_flee(grid: &BlockGrid, sources: &[(i32, i32)]) -> Self {
        let toward = Self::compute(grid, sources);

        let n = toward.cost.len();
        let w = toward.width;
        let d = toward.depth;
        let mut dirs = vec![Dir::ZERO; n];

        for (i, &cell_cost) in toward.cost.iter().enumerate() {
            if cell_cost == UNREACHABLE || cell_cost == 0 {
                continue;
            }

            let lx = (i as u32) % w;
            let lz = (i as u32) / w;
            let x = toward.origin_x + lx as i32;
            let z = toward.origin_z + lz as i32;

            let mut best_cost = cell_cost;
            let mut best_dir = Dir::ZERO;

            for &(dx, dz) in &OFFSETS {
                let nx = x + dx;
                let nz = z + dz;
                if let Some(ni) = Self::idx(nx, nz, toward.origin_x, toward.origin_z, w, d) {
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
            width: w,
            depth: d,
            cost: toward.cost,
            dirs,
        }
    }

    /// Direction to move from `(x, z)` toward the nearest goal.
    ///
    /// # Returns
    ///
    /// * `Some((0, 0))` — `(x, z)` is itself a goal.
    /// * `Some((dx, dz))` — the next-step delta (each component in
    ///   `-1..=1`).
    /// * `None` — `(x, z)` is out of bounds or unreachable from any goal.
    pub fn direction(&self, x: i32, z: i32) -> Option<(i32, i32)> {
        let i = Self::idx(x, z, self.origin_x, self.origin_z, self.width, self.depth)?;
        let d = self.dirs[i];
        if d.is_zero() && self.cost[i] != 0 {
            return None;
        }
        Some((d.dx as i32, d.dz as i32))
    }

    /// BFS distance (in cells) from `(x, z)` to the nearest goal.
    ///
    /// # Returns
    ///
    /// `Some(d)` for reachable cells, `None` for out-of-bounds or
    /// unreachable cells.
    pub fn distance(&self, x: i32, z: i32) -> Option<u32> {
        let i = Self::idx(x, z, self.origin_x, self.origin_z, self.width, self.depth)?;
        let c = self.cost[i];
        if c == UNREACHABLE { None } else { Some(c) }
    }

    /// Convert the direction at `(x, z)` into a world-space target.
    ///
    /// # Arguments
    ///
    /// * `grid` — grid used to look up the target cell's height.
    /// * `x`, `z` — current block coords.
    ///
    /// # Returns
    ///
    /// `Some([cx, cy, cz])` where `cx`/`cz` are block-center coords
    /// (`+0.5`) and `cy` is the target cell's surface height. `None` if
    /// `(x, z)` is unreachable, out of bounds, or already at the goal.
    pub fn next_target(&self, grid: &BlockGrid, x: i32, z: i32) -> Option<[f64; 3]> {
        let (dx, dz) = self.direction(x, z)?;
        if dx == 0 && dz == 0 {
            return None;
        }
        let nx = x + dx;
        let nz = z + dz;
        let cell = grid.get(nx, nz);
        Some([nx as f64 + 0.5, cell.height as f64, nz as f64 + 0.5])
    }

    /// Returns `true` if `(x, z)` is at a goal or one cell away (BFS
    /// distance ≤ 1).
    pub fn at_goal(&self, x: i32, z: i32) -> bool {
        self.distance(x, z).is_some_and(|d| d <= 1)
    }

    /// Bounds-checked index with both width and depth validation.
    #[inline]
    fn idx(x: i32, z: i32, origin_x: i32, origin_z: i32, width: u32, depth: u32) -> Option<usize> {
        let lx = x - origin_x;
        let lz = z - origin_z;
        if lx < 0 || lz < 0 || lx >= width as i32 || lz >= depth as i32 {
            return None;
        }
        Some((lz as u32 * width + lx as u32) as usize)
    }
}
