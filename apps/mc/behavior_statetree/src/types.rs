//! Message types for the NPC AI pipeline.
//!
//! All types are immutable snapshots — the JVM side serializes observations,
//! Tokio computes intents, and the JVM side validates before applying.
//! Per-NPC epochs prevent stale decisions from being applied.

use serde::{Deserialize, Serialize};

/// Unique identifier for an NPC goal (e.g. "patrol_village", "defend_area").
pub type GoalId = u32;

/// Snapshot of a nearby entity visible to the NPC.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EntitySnapshot {
    pub entity_id: u64,
    pub entity_type: String,
    pub position: [f64; 3],
    pub health: f32,
    pub is_hostile: bool,
}

/// Snapshot of a nearby block relevant to the NPC's decision.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockSnapshot {
    pub position: [i64; 3],
    pub block_type: String,
}

/// Immutable observation gathered on the server tick thread.
/// Sent to Tokio for async AI processing.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NpcObservation {
    pub entity_id: u64,
    /// Monotonically increasing per NPC — bumped each time observation changes.
    pub epoch: u64,
    pub position: [f64; 3],
    pub health: f32,
    pub nearby_entities: Vec<EntitySnapshot>,
    pub nearby_blocks: Vec<BlockSnapshot>,
    pub current_goal: Option<GoalId>,
    pub tick: u64,
}

/// Job submitted to the Tokio runtime for async processing.
#[derive(Debug)]
pub struct NpcThinkJob {
    pub observation: NpcObservation,
}

/// A command the NPC intends to execute. Validated by the server tick thread.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum NpcCommand {
    MoveTo { target: [f64; 3] },
    Attack { target_entity: u64 },
    Interact { block_pos: [i64; 3] },
    Idle { ticks: u32 },
    Speak { message: String },
    SetGoal { goal: GoalId },
}

/// Result of async AI planning. Only applied if epoch matches current NPC epoch.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NpcIntent {
    pub entity_id: u64,
    /// Must match the NPC's current epoch or the intent is discarded.
    pub epoch: u64,
    pub commands: Vec<NpcCommand>,
}

/// Tracks the current decision generation for an NPC.
/// Used by the server tick thread to discard stale intents.
#[derive(Debug, Clone)]
pub struct NpcDecisionEpoch {
    pub entity_id: u64,
    pub epoch: u64,
}
