//! Grid-based flow field pathfinding and chokepoint detection.
//!
//! Two parallel APIs, each suited to a different graph shape:
//!
//! ## Dense voxel / block worlds (Minecraft-style)
//!
//! 1. **`BlockGrid`** — 2D walkability grid built from Minecraft block
//!    snapshots (or any tile-based world). Each cell stores height,
//!    walkability, and a terrain cost.
//! 2. **`FlowField`** — BFS-computed direction vectors pointing every
//!    walkable cell toward one or more goal positions. All agents sharing
//!    a goal look up their next move in O(1) instead of running per-agent A*.
//! 3. **`FlowGate`** — narrow passage / chokepoint detector. Identifies
//!    cells where the corridor width drops below a threshold.
//!
//! ## Sparse abstract tile graphs (`tile-graph` feature)
//!
//! 1. **`NavGraph`** — minimal trait describing a node-and-edge graph
//!    where each node yields its weighted neighbors.
//! 2. **`TileGraph<N>`** — generic adjacency-list `NavGraph` impl for
//!    arbitrary node types (e.g. dungeon tile coordinates with per-tile
//!    exit directions).
//! 3. **`PathField<N>`** — BFS result over any `NavGraph`: distance and
//!    next-hop per node toward the nearest goal.
//!
//! The crate is pure Rust by default. Enable the `bevy` feature for
//! `Resource` derives. Enable `tile-graph` for the sparse-graph API.

pub mod flow_field;
pub mod flow_gate;
pub mod graph;
pub mod grid;

#[cfg(feature = "tile-graph")]
pub mod tile_graph;
