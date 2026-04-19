//! Pathfinding adapter for Isometric creatures — foundation layer.
//!
//! `bevy_pathfinding` operates on a 2D grid (`BlockGrid`) with BFS-computed
//! `FlowField`s. Isometric is a 3D game with continuous positions, so
//! using it requires a mapping:
//!
//! ```text
//!   world Vec3 (x, y, z)  →  grid (col, row) = (x / cell_size, z / cell_size)
//! ```
//!
//! This module defines the cell size + helper conversions. A later PR will
//! build a per-frame `FlowField` from the walkable terrain mesh and have
//! creature `BehaviorNode` leaves query it for navigation — matching the
//! pattern MC already uses in `behavior_statetree::tree::flow_nodes`.
//!
//! Keeping this module as a stub lets the crate land + compile; the actual
//! grid construction and flow-field dispatch is wired in the follow-up PR
//! that migrates Isometric's BehaviorNode enum to `bevy_behavior` trees.

use bevy::prelude::Vec3;

/// Grid cell edge length in world units. Picked to match the isometric tile
/// pitch so one grid cell corresponds to one visual tile.
pub const CELL_SIZE: f32 = 1.0;

/// Convert a world-space position to a `(col, row)` grid cell index.
///
/// The y-axis (height) is discarded — pathfinding is 2D. Creatures spawn
/// and move on the surface mesh, so vertical position is irrelevant for
/// the flow-field layer.
pub fn world_to_grid(pos: Vec3) -> (i32, i32) {
    (
        (pos.x / CELL_SIZE).floor() as i32,
        (pos.z / CELL_SIZE).floor() as i32,
    )
}

/// Convert a grid cell index back to a world-space position (cell center).
///
/// `y` is supplied by the caller since pathfinding doesn't track height.
pub fn grid_to_world(col: i32, row: i32, y: f32) -> Vec3 {
    Vec3::new(
        (col as f32 + 0.5) * CELL_SIZE,
        y,
        (row as f32 + 0.5) * CELL_SIZE,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn world_grid_roundtrip() {
        let pos = Vec3::new(3.5, 2.0, -1.5);
        let (col, row) = world_to_grid(pos);
        assert_eq!((col, row), (3, -2));
        let back = grid_to_world(col, row, pos.y);
        // Cell center is offset by 0.5 from the origin corner, so the
        // roundtrip lands within one cell of the input.
        assert!((back.x - 3.5).abs() <= CELL_SIZE);
        assert!((back.z - (-1.5)).abs() <= CELL_SIZE);
    }
}
