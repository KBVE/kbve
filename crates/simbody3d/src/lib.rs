//! Tile-derived 3D collision and kinematic character movement on rapier3d.
//!
//! The physics complement to `simgrid`, which owns the wire, roster and grid
//! sim but has no physics engine of its own. A game links both: simgrid for
//! netcode, this for where a body may actually go.
//!
//! Built to be the *only* implementation of that for a given game. It compiles
//! natively for an authoritative server and to wasm for a browser client, so
//! prediction and authority run the same solver rather than two
//! transliterations pinned by parity vectors. `simgrid` cannot follow it to
//! wasm — it depends on bevy, axum and multi-threaded tokio.
//!
//! Nothing here is game-specific: world scale, capsule dimensions, controller
//! tuning and the meaning of tile bits all arrive via [`SimbodyConfig`].
//! Shipped configurations live in `presets`.
//!
//! rapier is pinned to 0.30.1 because that is what
//! `@dimforge/rapier3d-compat` 0.19.3 is built from, so a client still using
//! the npm package runs the same solver version.

pub mod config;
pub mod motor;
pub mod tiles;
pub mod world;

#[cfg(feature = "presets")]
pub mod presets;

pub use config::{CharacterConfig, SimbodyConfig, StepConfig, WorldConfig};
pub use motor::{FixedStep, approach};
pub use tiles::{SectorTiles, TileMask};
pub use world::{CharacterHandle, PhysicsWorld, sector_colliders};
