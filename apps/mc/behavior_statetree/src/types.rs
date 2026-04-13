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
    /// Flow field navigation hints. Not sent from Java — injected by the
    /// ECS `plan_behavior` system from computed flow field resources.
    #[serde(default)]
    pub flow_hint: FlowFieldHint,
}

// ---------------------------------------------------------------------------
// Flow field hint — injected by the ECS `plan_behavior` system from
// the computed flow field resources. Lets behavior tree nodes make
// terrain-aware movement decisions without direct ECS access.
// ---------------------------------------------------------------------------

/// Pre-computed navigation hints derived from the current flow field and
/// flow gate state. Populated per-NPC by the `plan_behavior` system.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct FlowFieldHint {
    /// Suggested next block position from the approach flow field
    /// (toward the nearest player). `None` if no flow field is available
    /// or the NPC is out of the grid bounds.
    pub approach_target: Option<[f64; 3]>,
    /// Suggested next block position from the flee flow field (away from
    /// all players). `None` if unavailable.
    pub flee_target: Option<[f64; 3]>,
    /// BFS distance (in blocks) to the nearest player via the flow field.
    /// `None` if unreachable or no field available.
    pub player_distance: Option<u32>,
    /// Position of the nearest detected chokepoint / flow gate.
    /// `None` if no gates are detected.
    pub nearest_gate: Option<[f64; 3]>,
    /// Number of flow gates within a reasonable patrol radius (~32 blocks).
    pub gates_in_range: u32,
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
/// Default speed multiplier for legacy `MoveTo` JSON that omits `speed`.
/// 1.0 = mob's base walk speed as computed by Minecraft navigation.
fn default_move_speed() -> f64 {
    1.0
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum NpcCommand {
    MoveTo {
        target: [f64; 3],
        /// Speed multiplier passed to Minecraft navigation. 1.0 is the
        /// mob's normal walk; 1.3-1.5 reads as a sprint. Serde default
        /// preserves the pre-speed MoveTo wire format.
        #[serde(default = "default_move_speed")]
        speed: f64,
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
    /// Spawn a pet parrot for the given player entity ID. Java creates
    /// a tamed parrot within `radius` blocks of the player and wires
    /// the owner relationship up on the Minecraft side.
    SpawnPetParrot {
        near_player: u64,
        radius: i32,
    },
    /// Ranged "poop" attack: apply the Minecraft POISON status effect
    /// to `target_entity` for `duration_ticks` at the given amplifier.
    /// Java also plays the splat particles + sound at the attacker's
    /// position. Rust owns the cooldown that throttles this ability.
    PoopPoison {
        target_entity: u64,
        duration_ticks: u32,
        amplifier: u8,
    },

    // -- Skeleton archetype commands ----------------------------------------
    /// Place a block at the given position. Used by melee skeletons to
    /// build scaffolding when stuck at a cliff. Java places the block and
    /// schedules it for cleanup after `cleanup_ticks` (0 = permanent).
    PlaceBlock {
        block_pos: [i64; 3],
        /// Block type tag for Java dispatch. "scaffolding" = Blocks.SCAFFOLDING.
        block_type: String,
        /// Ticks until Java auto-removes the placed block. 0 = no cleanup.
        cleanup_ticks: u32,
    },
    /// Teleport the mob to the target position. Used by mage skeletons
    /// to bypass vertical obstacles and walls. Java sets the entity
    /// position directly + plays enderman teleport particles/sound.
    Teleport {
        target: [f64; 3],
    },
    /// Shoot a projectile at the target entity. Used by archer skeletons.
    /// Java spawns an arrow from the mob aimed at the target with the
    /// given power (0.0-1.0 → pull strength, affects speed + damage).
    ShootArrow {
        target_entity: u64,
        power: f32,
    },

    // -- Archetype-specific spawn commands ----------------------------------
    /// Spawn a melee skeleton (sword + scaffold ability).
    SpawnSkeletonMelee {
        near_player: u64,
        radius: i32,
    },
    /// Spawn a mage skeleton (teleport ability).
    SpawnSkeletonMage {
        near_player: u64,
        radius: i32,
    },
    /// Spawn an archer skeleton (ranged bow attacks).
    SpawnSkeletonArcher {
        near_player: u64,
        radius: i32,
    },

    // -- Ship commands ---------------------------------------------------------
    /// Move a ship forward along its current heading. Java handles the
    /// chunked block relocation across multiple ticks. `distance` is in
    /// blocks (typically 1-3 per command for smooth sailing).
    MoveShip {
        ship_id: String,
        distance: i32,
    },
    /// Rotate a ship by `degrees` around its anchor Y axis. Positive =
    /// clockwise (starboard turn). Java rotates all block offsets and
    /// relocates in chunks.
    RotateShip {
        ship_id: String,
        degrees: f32,
    },
    /// Spawn a named ship from a bundled schematic near a player.
    /// Java loads the schematic, finds safe ocean, and places it.
    SpawnShip {
        ship_name: String,
        near_player: u64,
    },
    /// Remove a ship and all its blocks from the world.
    DespawnShip {
        ship_id: String,
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
