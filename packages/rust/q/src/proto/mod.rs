//! Shared wire types between the Godot client and the bevy/axum server.
//!
//! Encoded with `postcard` (COBS-framed) for snapshots and inputs.
//! Concrete message types land here as the protocol stabilizes; this stub
//! exists so feature gating builds without errors.

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct ProtoHello {
    pub version: u32,
}
