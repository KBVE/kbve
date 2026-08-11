//! Off-thread 3d physics — the {Physics} pillar.
//!
//! Pure rapier3d with no engine types anywhere in it, so the same step code
//! serves the Godot client today and compiles headless into the authoritative
//! server later. The app talks to it only through [`types::SimCommand`] and
//! [`types::SimSnapshot`]; the Godot-facing adapter lives in
//! `crate::rapier::bridge3d` behind the `rapier3d-client` feature.

pub mod thread;
pub mod types;
pub mod world;

pub use thread::PhysicsHandle;
pub use types::{
    AutostepDesc, BodyDesc, BodyId, BodyKind, BodySnapshot, CharacterDesc, Iso, ShapeDesc,
    SimCommand, SimConfig, SimSnapshot, TerrainDesc,
};
pub use world::SimWorld;
