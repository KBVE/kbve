//! Generic data-driven sprite creature system.
//!
//! Replaces per-creature modules (frog, wolf, etc.) with a single set of
//! spawn/animate/tint systems driven by `SpriteCreatureType` descriptors.

pub mod animate;
pub mod definitions;
pub mod spawn;
pub mod tint;
pub mod types;

pub use types::{CreatureShadowLink, SpriteAtlasPool, SpriteCreatureMarker, SpriteCreatureTypes};
