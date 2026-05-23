//! Client-side WebSocket transport — tokio-tungstenite over rustls.
//!
//! The actual `MatchSocket` will land as a `#[derive(GodotClass)]` under
//! `q::nexus_defense::match_socket` once the protocol round-trips in tests.
//! For now this module only exposes encode/decode shims so consumers can
//! prove parity with the server side.

#[cfg(feature = "proto-shared")]
use crate::proto;

#[cfg(feature = "proto-shared")]
pub fn encode_client_frame(frame: &proto::ClientFrame) -> Result<Vec<u8>, postcard::Error> {
    proto::encode(frame)
}

#[cfg(feature = "proto-shared")]
pub fn decode_server_event(buf: &mut [u8]) -> Result<proto::ServerEvent, postcard::Error> {
    proto::decode(buf)
}
