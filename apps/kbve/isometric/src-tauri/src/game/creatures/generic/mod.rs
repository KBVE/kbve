//! Generic creature system — client wrapper.
//!
//! Shared simulation logic lives in `bevy_kbve_net::creatures`.
//! This module adds client-only rendering, spawning, tinting, and network events.

pub mod net_events;
pub mod render;
pub mod spawn;
pub mod tint;

// Re-export shared types from bevy_kbve_net for convenience
pub use bevy_kbve_net::creatures::brain::CreatureBrain;
pub use bevy_kbve_net::creatures::physics_lod::{PhysicsLod, PlayerProximity};
pub use bevy_kbve_net::creatures::simulate::SimulationCenter;
pub use bevy_kbve_net::creatures::types::{
    CreatureShadowLink, SpriteCreatureMarker, SpriteCreatureTypes,
};
