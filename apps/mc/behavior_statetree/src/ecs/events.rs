//! Resource-based message buffers for JNI ↔ ECS communication.
//!
//! Using Resources with Vec buffers instead of Bevy Events to avoid
//! feature-gating issues with MinimalPlugins. These are drained each
//! ECS tick by the systems.

use bevy::prelude::*;

use crate::types::{NpcCommand, NpcObservation, PlayerSnapshot};

/// Inbound buffer: per-NPC observations queued from JNI, drained by
/// `ingest_observations` each tick.
#[derive(Resource, Default)]
pub struct ObservationBuffer {
    pub pending: Vec<NpcObservation>,
}

/// Inbound buffer: world player snapshots queued from JNI, drained by
/// `ingest_player_snapshots` each tick. Java pushes one of these per
/// observation tick (independent of how many AI NPCs exist).
#[derive(Resource, Default)]
pub struct PlayerObservationBuffer {
    pub pending: Vec<PlayerSnapshot>,
}

/// Outbound buffer: per-NPC intents produced by `plan_behavior`, drained
/// by the runtime and shipped back to Java.
#[derive(Resource, Default)]
pub struct IntentBuffer {
    pub ready: Vec<IntentReady>,
}

/// Outbound buffer: world-level intents (spawn / despawn) emitted by
/// systems that don't act on a specific NPC's behavior tree.
///
/// `entity_id` is `0` for world intents — Java distinguishes them from
/// per-NPC intents by command kind, not by ID.
#[derive(Resource, Default)]
pub struct WorldIntentBuffer {
    pub ready: Vec<IntentReady>,
}

/// A single intent ready to send back to Java.
#[derive(Debug, Clone)]
pub struct IntentReady {
    pub entity_id: u64,
    pub epoch: u64,
    pub commands: Vec<NpcCommand>,
}
