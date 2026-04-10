//! Resource-based message buffers for JNI ↔ ECS communication.
//!
//! Using Resources with Vec buffers instead of Bevy Events to avoid
//! feature-gating issues with MinimalPlugins. These are drained each
//! ECS tick by the systems.

use bevy::prelude::*;

use crate::types::{NpcCommand, NpcObservation};

/// Inbound buffer: observations queued from JNI, drained by ingest system.
#[derive(Resource, Default)]
pub struct ObservationBuffer {
    pub pending: Vec<NpcObservation>,
}

/// Outbound buffer: intents produced by plan system, drained by runtime.
#[derive(Resource, Default)]
pub struct IntentBuffer {
    pub ready: Vec<IntentReady>,
}

/// A single intent ready to send back to Java.
#[derive(Debug, Clone)]
pub struct IntentReady {
    pub entity_id: u64,
    pub epoch: u64,
    pub commands: Vec<NpcCommand>,
}
