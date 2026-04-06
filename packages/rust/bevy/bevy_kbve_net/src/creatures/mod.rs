//! Shared creature simulation — runs identically on client and server.
//!
//! Contains behavior trees, brain dispatch, state machines, type definitions,
//! physics LOD, and the core simulation system. NO rendering code lives here.

pub mod ambient_types;
pub mod behavior;
pub mod brain;
pub mod common;
pub mod definitions;
pub mod influence;
pub mod nav_grid;
pub mod nav_systems;
pub mod patrol;
pub mod physics_lod;
pub mod simulate;
pub mod simulate_butterfly;
pub mod simulate_firefly;
pub mod spawn;
pub mod spawn_ambient;
pub mod types;
pub mod waypoint_graph;
