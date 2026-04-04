//! Shared lightyear protocol for KBVE multiplayer.
//!
//! Defines replicated components, input types, channels, and the protocol
//! plugin used by both client and server.
//!
//! Enable the `client` feature for transport selection and connection
//! lifecycle (follows lightyear's example patterns).

#[cfg(feature = "client")]
pub mod client;
pub mod inputs;
pub mod net_config;
#[cfg(feature = "npcdb")]
pub mod npcdb;
pub mod protocol;
#[cfg(all(feature = "client", target_arch = "wasm32"))]
pub mod wasm_ws;
pub mod worldgen;

pub use inputs::PlayerInput;
pub use protocol::{
    AuthAck, AuthMessage, AuthResponse, CollectRequest, CreatureAttackRequest,
    CreatureCaptureRequest, CreatureCaptured, CreatureEventKind, CreatureKind, CreatureStateEvent,
    DamageEvent, DamageSource, GameChannel, ObjectRemoved, ObjectRespawned, PlayerColor, PlayerId,
    PlayerName, PlayerVitals, PositionUpdate, ProtocolPlugin, SetUsernameRequest,
    SetUsernameResponse, TimeChannel, TimeSyncMessage,
};
pub use worldgen::{TileKey, WorldObjectKind, hash2d, object_at_tile};
