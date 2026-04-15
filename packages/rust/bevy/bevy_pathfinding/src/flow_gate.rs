//! Layer 3: FlowGate — chokepoint / narrow passage detection.
//!
//! A flow gate is a set of walkable cells where the corridor width drops
//! below a threshold, connecting wider open regions on either side. Gates
//! are useful for:
//!
//! - **Ambush AI** — mobs wait at gates and attack when players pass through
//! - **Territory control** — claim/defend gates to control map flow
//! - **Patrol routes** — walk between gates for meaningful coverage
//! - **Spawn placement** — avoid spawning inside narrow corridors
//!
//! ## Algorithm
//!
//! 1. **Clearance map**: For every walkable cell, compute the distance to
//!    the nearest wall (BFS from all wall cells). This gives a "how wide
//!    is the corridor here" value.
//!
//! 2. **Gate detection**: Scan for cells where clearance is at a local
//!    minimum along one axis but connects higher-clearance regions on
//!    both sides. These are the "bottleneck" cells.
//!
//! 3. **Gate clustering**: Adjacent bottleneck cells are grouped into a
//!    single `FlowGate` with a center position, width, and orientation.

use serde::{Deserialize, Serialize};
use std::collections::VecDeque;

use crate::grid::BlockGrid;

// ---------------------------------------------------------------------------
// FlowGate
// ---------------------------------------------------------------------------

/// A detected chokepoint / narrow passage in the grid.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FlowGate {
    /// Unique ID for this gate (index in the gate list).
    pub id: u32,
    /// Center of the gate in absolute block coords.
    pub center_x: i32,
    pub center_z: i32,
    /// Approximate width of the passage in blocks.
    pub width: u32,
    /// Primary direction of travel through the gate: (dx, dz).
    /// Normalized to one of the 8 compass directions.
    pub direction: (i8, i8),
    /// All cells that belong to this gate.
    pub cells: Vec<(i32, i32)>,
    /// Average clearance value at the gate cells (lower = tighter).
    pub clearance: f32,
}

// ---------------------------------------------------------------------------
// Clearance map
// ---------------------------------------------------------------------------

/// Compute a clearance map: for each walkable cell, the BFS distance to
/// the nearest non-walkable cell (wall, water, out-of-bounds).
///
/// Wall cells get clearance 0. Walkable cells far from walls get high
/// values. This measures "how open is this area?"
fn compute_clearance(grid: &BlockGrid) -> Vec<u32> {
    let n = (grid.width * grid.depth) as usize;
    let mut clearance = vec![u32::MAX; n];
    let mut queue = VecDeque::with_capacity(n / 4);

    // Seed from all non-walkable cells and grid edges
    for lz in 0..grid.depth {
        for lx in 0..grid.width {
            let x = grid.origin_x + lx as i32;
            let z = grid.origin_z + lz as i32;
            let i = (lz * grid.width + lx) as usize;

            if !grid.is_walkable(x, z) {
                clearance[i] = 0;
                queue.push_back((lx, lz));
            } else if lx == 0 || lz == 0 || lx == grid.width - 1 || lz == grid.depth - 1 {
                // Grid edge cells adjacent to the boundary — treat as
                // near-wall so gates aren't detected at map edges.
                clearance[i] = 1;
                queue.push_back((lx, lz));
            }
        }
    }

    // BFS outward from walls
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

    while let Some((lx, lz)) = queue.pop_front() {
        let ci = (lz * grid.width + lx) as usize;
        let current = clearance[ci];

        for &(dx, dz) in &OFFSETS {
            let nx = lx as i32 + dx;
            let nz = lz as i32 + dz;
            if nx < 0 || nz < 0 || nx >= grid.width as i32 || nz >= grid.depth as i32 {
                continue;
            }
            let ni = (nz as u32 * grid.width + nx as u32) as usize;
            let new_c = current + 1;
            if new_c < clearance[ni] {
                clearance[ni] = new_c;
                queue.push_back((nx as u32, nz as u32));
            }
        }
    }

    clearance
}

// ---------------------------------------------------------------------------
// Gate detection
// ---------------------------------------------------------------------------

/// Minimum clearance threshold — cells with clearance at or below this
/// value are candidates for being part of a gate.
const GATE_CLEARANCE_THRESHOLD: u32 = 2;

/// Minimum clearance on the "open side" of a gate — the regions connected
/// by the gate must be at least this wide to count as meaningfully open.
const OPEN_REGION_CLEARANCE: u32 = 4;

/// Detect flow gates in the grid.
///
/// Returns a list of [`FlowGate`]s sorted by clearance (tightest first).
pub fn detect_gates(grid: &BlockGrid) -> Vec<FlowGate> {
    let clearance = compute_clearance(grid);
    let w = grid.width;
    let d = grid.depth;

    // Find bottleneck cells: walkable cells where clearance is low AND
    // there exist higher-clearance cells reachable on opposite sides.
    let mut bottleneck = vec![false; clearance.len()];

    for lz in 1..(d - 1) {
        for lx in 1..(w - 1) {
            let i = (lz * w + lx) as usize;
            let c = clearance[i];

            // Skip walls and cells that are already wide
            if c == 0 || c > GATE_CLEARANCE_THRESHOLD {
                continue;
            }

            let x = grid.origin_x + lx as i32;
            let z = grid.origin_z + lz as i32;

            if !grid.is_walkable(x, z) {
                continue;
            }

            // Check if this cell connects higher-clearance regions along
            // either the X axis or the Z axis.
            let is_gate = check_axis_gate(&clearance, w, lx, lz, 1, 0)
                || check_axis_gate(&clearance, w, lx, lz, 0, 1)
                || check_axis_gate(&clearance, w, lx, lz, 1, 1)
                || check_axis_gate(&clearance, w, lx, lz, 1, -1i32 as u32);

            if is_gate {
                bottleneck[i] = true;
            }
        }
    }

    // Cluster adjacent bottleneck cells into gates
    let mut visited = vec![false; clearance.len()];
    let mut gates = Vec::new();

    for lz in 0..d {
        for lx in 0..w {
            let i = (lz * w + lx) as usize;
            if !bottleneck[i] || visited[i] {
                continue;
            }

            // Flood-fill to collect the cluster
            let mut cluster = Vec::new();
            let mut stack = vec![(lx, lz)];

            while let Some((cx, cz)) = stack.pop() {
                let ci = (cz * w + cx) as usize;
                if visited[ci] || !bottleneck[ci] {
                    continue;
                }
                visited[ci] = true;
                cluster.push((grid.origin_x + cx as i32, grid.origin_z + cz as i32));

                // Check 8-connected neighbors
                for &(dx, dz) in &[
                    (0i32, -1i32),
                    (0, 1),
                    (-1, 0),
                    (1, 0),
                    (-1, -1),
                    (1, -1),
                    (-1, 1),
                    (1, 1),
                ] {
                    let nx = cx as i32 + dx;
                    let nz = cz as i32 + dz;
                    if nx >= 0 && nz >= 0 && nx < w as i32 && nz < d as i32 {
                        stack.push((nx as u32, nz as u32));
                    }
                }
            }

            if cluster.is_empty() {
                continue;
            }

            // Compute gate properties from the cluster
            let center_x =
                cluster.iter().map(|&(x, _)| x as f64).sum::<f64>() / cluster.len() as f64;
            let center_z =
                cluster.iter().map(|&(_, z)| z as f64).sum::<f64>() / cluster.len() as f64;

            let avg_clearance: f32 = cluster
                .iter()
                .filter_map(|&(x, z)| {
                    let lx = (x - grid.origin_x) as u32;
                    let lz = (z - grid.origin_z) as u32;
                    Some(clearance[(lz * w + lx) as usize] as f32)
                })
                .sum::<f32>()
                / cluster.len() as f32;

            // Estimate gate direction from the cluster's principal axis
            let dir = estimate_direction(&cluster);

            gates.push(FlowGate {
                id: gates.len() as u32,
                center_x: center_x.round() as i32,
                center_z: center_z.round() as i32,
                width: cluster.len() as u32,
                direction: dir,
                cells: cluster,
                clearance: avg_clearance,
            });
        }
    }

    // Sort by clearance (tightest gates first — most strategically important)
    gates.sort_by(|a, b| {
        a.clearance
            .partial_cmp(&b.clearance)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    // Re-assign IDs after sorting
    for (i, gate) in gates.iter_mut().enumerate() {
        gate.id = i as u32;
    }

    gates
}

/// Check if position (lx, lz) is a gate along the axis defined by (ax, az).
/// Returns true if cells along the axis in both directions eventually
/// reach higher-clearance regions.
fn check_axis_gate(clearance: &[u32], w: u32, lx: u32, lz: u32, ax: u32, az: u32) -> bool {
    let ax = ax as i32;
    let az = az as i32;
    let scan_dist = OPEN_REGION_CLEARANCE as i32 + 2;

    let mut found_open_pos = false;
    let mut found_open_neg = false;

    // Scan in positive direction
    for step in 1..=scan_dist {
        let nx = lx as i32 + ax * step;
        let nz = lz as i32 + az * step;
        if nx < 0 || nz < 0 || nx >= w as i32 || nz >= (clearance.len() as u32 / w) as i32 {
            break;
        }
        let ni = (nz as u32 * w + nx as u32) as usize;
        if clearance[ni] == 0 {
            break; // Hit a wall
        }
        if clearance[ni] >= OPEN_REGION_CLEARANCE {
            found_open_pos = true;
            break;
        }
    }

    // Scan in negative direction
    for step in 1..=scan_dist {
        let nx = lx as i32 - ax * step;
        let nz = lz as i32 - az * step;
        if nx < 0 || nz < 0 || nx >= w as i32 || nz >= (clearance.len() as u32 / w) as i32 {
            break;
        }
        let ni = (nz as u32 * w + nx as u32) as usize;
        if clearance[ni] == 0 {
            break;
        }
        if clearance[ni] >= OPEN_REGION_CLEARANCE {
            found_open_neg = true;
            break;
        }
    }

    found_open_pos && found_open_neg
}

/// Estimate the primary direction of travel through a gate cluster.
/// Uses the principal axis of the cluster's bounding box.
fn estimate_direction(cells: &[(i32, i32)]) -> (i8, i8) {
    if cells.len() < 2 {
        return (1, 0);
    }

    let min_x = cells.iter().map(|c| c.0).min().unwrap();
    let max_x = cells.iter().map(|c| c.0).max().unwrap();
    let min_z = cells.iter().map(|c| c.1).min().unwrap();
    let max_z = cells.iter().map(|c| c.1).max().unwrap();

    let dx = max_x - min_x;
    let dz = max_z - min_z;

    // The gate's "width" spans perpendicular to the travel direction.
    // If the cluster is wider in X, travel is along Z (and vice versa).
    if dx >= dz {
        (0, 1) // Gate spans X → travel direction is Z
    } else {
        (1, 0) // Gate spans Z → travel direction is X
    }
}

// ---------------------------------------------------------------------------
// Convenience: find nearest gate to a position
// ---------------------------------------------------------------------------

/// Find the nearest flow gate to a given block position.
pub fn nearest_gate(gates: &[FlowGate], x: i32, z: i32) -> Option<&FlowGate> {
    gates.iter().min_by_key(|g| {
        let dx = (g.center_x - x) as i64;
        let dz = (g.center_z - z) as i64;
        dx * dx + dz * dz
    })
}

/// Find all flow gates within a radius of a given position.
pub fn gates_in_radius(gates: &[FlowGate], x: i32, z: i32, radius: i32) -> Vec<&FlowGate> {
    let r2 = (radius as i64) * (radius as i64);
    gates
        .iter()
        .filter(|g| {
            let dx = (g.center_x - x) as i64;
            let dz = (g.center_z - z) as i64;
            dx * dx + dz * dz <= r2
        })
        .collect()
}
