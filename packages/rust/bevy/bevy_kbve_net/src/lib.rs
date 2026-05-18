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
    AuthAck, AuthMessage, AuthResponse, CapturedCreatureEntry, CollectRequest,
    CreatureAttackRequest, CreatureCaptureRequest, CreatureCaptured, CreatureCapturedBatch,
    CreatureEventKind, CreatureKind, CreaturePositionSync, CreatureSnapshot, CreatureStateEvent,
    CreatureSyncChannel, DamageEvent, DamageSource, GameChannel, InventorySlotState, InventorySync,
    InventoryUpdate, ObjectRemoved, ObjectRespawned, PlayerColor, PlayerId, PlayerName,
    PlayerVitals, PositionUpdate, ProtocolPlugin, SetUsernameRequest, SetUsernameResponse,
    SkillXpGrant, TimeChannel, TimeSyncMessage,
};
pub use worldgen::{TileKey, WorldObjectKind, hash2d, item_ref_at, object_at_tile, roll_loot_at};

pub mod terrain;

#[cfg(feature = "creatures")]
pub mod creatures;
