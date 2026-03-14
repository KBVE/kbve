//! Shared lightyear protocol for KBVE multiplayer.
//!
//! Defines replicated components, input types, channels, and the protocol
//! plugin used by both client and server.

pub mod inputs;
pub mod protocol;
pub mod worldgen;

pub use inputs::PlayerInput;
pub use protocol::{
    AuthMessage, AuthResponse, CollectRequest, DamageEvent, DamageSource, GameChannel,
    ObjectRemoved, ObjectRespawned, PlayerColor, PlayerId, PlayerVitals, PositionUpdate,
    ProtocolPlugin,
};
pub use worldgen::{TileKey, WorldObjectKind, hash2d, object_at_tile};
