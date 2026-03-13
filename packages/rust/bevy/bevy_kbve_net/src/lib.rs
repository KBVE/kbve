//! Shared lightyear protocol for KBVE multiplayer.
//!
//! Defines replicated components, input types, channels, and the protocol
//! plugin used by both client and server.

pub mod inputs;
pub mod protocol;

pub use inputs::PlayerInput;
pub use protocol::{AuthMessage, AuthResponse, GameChannel, PlayerColor, PlayerId, ProtocolPlugin};
