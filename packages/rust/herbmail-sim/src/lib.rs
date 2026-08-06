//! Herbmail world collision and character movement.
//!
//! This is the single implementation of both, shared by the authoritative
//! server and (once it is built to wasm) the client's physics worker. The
//! client currently runs the prebuilt `@dimforge/rapier3d-compat` 0.19.3 npm
//! package, whose wasm is built from `rapier3d` 0.30.1 — the version pinned
//! here, so the two are the same solver rather than two transliterations.

pub mod constants;
pub mod motor;
pub mod tiles;
pub mod world;

pub use constants::*;
pub use motor::{FixedStep, approach};
pub use tiles::{SectorTiles, SOLID, PIT, WALL, FLOOR, ARCH, COLUMN, OASIS};
pub use world::{CharacterHandle, PhysicsWorld, sector_colliders};
