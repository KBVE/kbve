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

/// Default kind used when Java omits `entity_kind` on an observation.
/// Preserves the original wire format for legacy skeleton observations.
fn default_entity_kind() -> String {
    "skeleton".to_string()
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
    /// Tag set by Java so the ECS knows which creature archetype to spawn
    /// on first sighting ("skeleton", "dog", ...). Defaults to "skeleton"
    /// so legacy observations keep working unchanged.
    #[serde(default = "default_entity_kind")]
    pub entity_kind: String,
    /// For owned creatures (pet dogs), the Minecraft entity ID of the
    /// player that owns them. `None` for unowned mobs.
    #[serde(default)]
    pub owner_entity: Option<u64>,
}

/// Job submitted to the Tokio runtime for async processing.
#[derive(Debug)]
pub struct NpcThinkJob {
    pub observation: NpcObservation,
}

/// A command the NPC intends to execute. Validated by the server tick thread.
///
/// Some commands target a specific NPC (carried by the parent `NpcIntent`),
/// while others (`SpawnSkeleton`, `Despawn`) act on entities the AI does not
/// yet "own" — these come from the `world_intents` channel emitted by
/// world-level systems instead of per-NPC behavior trees.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum NpcCommand {
    MoveTo {
        target: [f64; 3],
    },
    Attack {
        target_entity: u64,
    },
    Interact {
        block_pos: [i64; 3],
    },
    Idle {
        ticks: u32,
    },
    Speak {
        message: String,
    },
    SetGoal {
        goal: GoalId,
    },
    CallForHelp {
        count: u32,
    },
    /// Despawn an existing AI-managed entity. The Java side discards the
    /// Minecraft entity by ID — no policy decisions, just the API call.
    Despawn {
        target_entity: u64,
    },
    /// Spawn an AI Skeleton near the given player entity ID. Java picks
    /// a random offset within `radius` blocks of the player.
    SpawnSkeleton {
        near_player: u64,
        radius: i32,
    },
    /// Spawn a pet dog for the given player entity ID. Java creates a
    /// tamed wolf within `radius` blocks of the player and wires the
    /// owner relationship up on the Minecraft side.
    SpawnPetDog {
        near_player: u64,
        radius: i32,
    },
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

// ---------------------------------------------------------------------------
// Player snapshot — sent from Java once per observation tick (separate from
// per-NPC observations). Lets the Rust ECS run spawn/despawn policy without
// asking Java "how far is the nearest player?" on every decision.
// ---------------------------------------------------------------------------

/// Single player record inside a `PlayerSnapshot`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayerInfo {
    pub entity_id: u64,
    pub username: String,
    pub position: [f64; 3],
    pub health: f32,
}

/// Snapshot of all players currently online on the server.
///
/// Sent each observation tick by Java. The Rust side reconciles it against
/// `OnlinePlayer` ECS entities (spawn new ones, update positions, despawn
/// players who logged out).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayerSnapshot {
    pub players: Vec<PlayerInfo>,
    pub tick: u64,
}
