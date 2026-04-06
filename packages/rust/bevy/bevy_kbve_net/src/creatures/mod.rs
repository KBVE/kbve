//! Shared creature simulation — runs identically on client and server.
//!
//! Contains behavior trees, brain dispatch, state machines, type definitions,
//! physics LOD, and the core simulation system. NO rendering code lives here.

pub mod behavior;
pub mod brain;
pub mod common;
pub mod definitions;
pub mod physics_lod;
pub mod simulate;
pub mod spawn;
pub mod types;
