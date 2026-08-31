//! Off-thread 3d physics — the {Physics} pillar.

pub mod thread;
pub mod types;
pub mod world;

pub use thread::PhysicsHandle;
pub use types::{
    AutostepDesc, BodyDesc, BodyId, BodyKind, BodySnapshot, CharacterDesc, Iso, ShapeDesc,
    SimCommand, SimConfig, SimSnapshot, TerrainDesc,
};
pub use world::SimWorld;
