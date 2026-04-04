//! Generic data-driven sprite creature system.
//!
//! Replaces per-creature modules (frog, wolf, etc.) with a single set of
//! spawn/animate/tint systems driven by `SpriteCreatureType` descriptors.

pub mod animate;
pub mod behavior;
pub mod brain;
pub mod definitions;
pub mod physics_lod;
pub mod spawn;
pub mod tint;
pub mod types;

pub use brain::CreatureBrain;
pub use physics_lod::{PhysicsLod, PlayerProximity};
pub use types::{CreatureShadowLink, SpriteAtlasPool, SpriteCreatureMarker, SpriteCreatureTypes};
