//! Grid-based flow field pathfinding and chokepoint detection.
//!
//! Three layers:
//!
//! 1. **`BlockGrid`** — 2D walkability grid built from Minecraft block
//!    snapshots (or any tile-based world). Each cell stores height,
//!    walkability, and a terrain cost.
//!
//! 2. **`FlowField`** — BFS-computed direction vectors pointing every
//!    walkable cell toward one or more goal positions. All agents sharing
//!    a goal look up their next move in O(1) instead of running per-agent A*.
//!
//! 3. **`FlowGate`** — narrow passage / chokepoint detector. Identifies
//!    cells where the corridor width drops below a threshold, connecting
//!    wider regions. Useful for ambush AI, territory control, and patrol
//!    route generation.
//!
//! The crate is pure Rust by default. Enable the `bevy` feature to get
//! `Resource` derives for ECS integration.

pub mod flow_field;
pub mod flow_gate;
pub mod grid;
