//! Generic sprite creature types — data-driven definitions shared between
//! client and server.

use bevy::prelude::*;
use serde::{Deserialize, Serialize};
use ulid::Ulid;

// ---------------------------------------------------------------------------
// Creature instance identity
// ---------------------------------------------------------------------------

/// Globally unique creature instance identifier assigned by the server.
/// Embeds creation timestamp in the ULID's upper 48 bits, so you can tell
/// when a creature was spawned from its ID alone.
#[derive(Component, Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct CreatureId(pub Ulid);

impl Default for CreatureId {
    fn default() -> Self {
        Self::new()
    }
}

impl CreatureId {
    /// Generate a new ULID (server-side only).
    pub fn new() -> Self {
        Self(Ulid::new())
    }

    /// Reconstruct from wire u128.
    pub fn from_u128(v: u128) -> Self {
        Self(Ulid::from(v))
    }

    /// Serialize to u128 for wire protocol.
    pub fn as_u128(&self) -> u128 {
        self.0.into()
    }

    /// Millisecond timestamp embedded in the ULID.
    pub fn timestamp_ms(&self) -> u64 {
        self.0.timestamp_ms()
    }
}

// ---------------------------------------------------------------------------
// Per-entity components
// ---------------------------------------------------------------------------

/// Generic marker for all sprite-sheet creatures processed by the unified
/// spawn/animate systems. Replaces per-creature markers (WolfMarker, etc.).
#[derive(Component)]
pub struct SpriteCreatureMarker {
    /// Key into `SpriteCreatureTypes` resource.
    pub type_key: &'static str,
    /// Deterministic patrol counter — incremented on every decision.
    pub patrol_step: u32,
    /// Current 4-way direction index (ignored for `DirectionModel::Flip`).
    pub direction: u32,
    /// Base row of the currently active animation block.
    pub anim_base_row: u32,
    /// Frame count of the currently active animation.
    pub anim_frame_count: u32,
    /// Movement speed for the current action (set at transition time).
    pub active_move_speed: f32,
}

/// Links a sprite creature entity to its blob shadow entity.
#[derive(Component)]
pub struct CreatureShadowLink(pub Entity);

// ---------------------------------------------------------------------------
// Creature vitals — ECS-friendly health/mana/energy tracking
// ---------------------------------------------------------------------------

/// Per-entity vitals for NPC creatures. Server-authoritative, replicated
/// to clients for health bars and interaction logic.
#[derive(Component, Clone, Debug)]
pub struct CreatureVitals {
    pub health: f32,
    pub max_health: f32,
    pub mana: f32,
    pub max_mana: f32,
    pub energy: f32,
    pub max_energy: f32,
    /// True when health <= 0. Prevents further damage processing.
    pub is_dead: bool,
}

impl CreatureVitals {
    pub fn new(max_health: f32, max_mana: f32, max_energy: f32) -> Self {
        Self {
            health: max_health,
            max_health,
            mana: max_mana,
            max_mana,
            energy: max_energy,
            max_energy,
            is_dead: false,
        }
    }

    /// Apply damage, clamping health to 0. Returns true if this killed the creature.
    pub fn take_damage(&mut self, amount: f32) -> bool {
        if self.is_dead {
            return false;
        }
        self.health = (self.health - amount).max(0.0);
        if self.health <= 0.0 {
            self.is_dead = true;
            return true;
        }
        false
    }

    /// Heal, clamping to max_health.
    pub fn heal(&mut self, amount: f32) {
        if self.is_dead {
            return;
        }
        self.health = (self.health + amount).min(self.max_health);
    }

    /// Spend mana. Returns false if insufficient.
    pub fn spend_mana(&mut self, amount: f32) -> bool {
        if self.mana < amount {
            return false;
        }
        self.mana -= amount;
        true
    }

    /// Spend energy. Returns false if insufficient.
    pub fn spend_energy(&mut self, amount: f32) -> bool {
        if self.energy < amount {
            return false;
        }
        self.energy -= amount;
        true
    }

    /// Health as a 0.0-1.0 fraction.
    pub fn health_fraction(&self) -> f32 {
        if self.max_health <= 0.0 {
            return 0.0;
        }
        self.health / self.max_health
    }
}

/// Per-creature-type vitals configuration.
#[derive(Clone, Debug)]
pub struct VitalsConfig {
    pub max_health: f32,
    pub max_mana: f32,
    pub max_energy: f32,
}

impl Default for VitalsConfig {
    fn default() -> Self {
        Self {
            max_health: 20.0,
            max_mana: 0.0,
            max_energy: 50.0,
        }
    }
}

// ---------------------------------------------------------------------------
// Direction handling
// ---------------------------------------------------------------------------

/// How a sprite creature resolves its facing direction.
#[derive(Clone, Debug)]
pub enum DirectionModel {
    /// 2-way: sprite faces left or right via UV mirror (frog, wraith).
    Flip,
    /// 4-directional atlas rows. Each animation block has 4 sub-rows.
    FourWay { quadrant_to_row: [u32; 4] },
}

/// Compute 4-way isometric direction from movement delta.
/// Returns a quadrant index: `(diff>=0) << 1 | (sum>=0)`.
#[inline]
pub fn iso_quadrant(dx: f32, dz: f32) -> u32 {
    let diff = dx - dz;
    let sum = dx + dz;
    ((diff >= 0.0) as u32) << 1 | (sum >= 0.0) as u32
}

// ---------------------------------------------------------------------------
// Movement
// ---------------------------------------------------------------------------

/// How a creature moves during `SpriteHopState::Airborne`.
#[derive(Clone, Debug)]
pub enum MovementProfile {
    /// Frog-style hop with parabolic arc.
    HopArc {
        base_height: f32,
        height_per_dist: f32,
        max_jump_height_diff: f32,
        jump_airborne_frame: u32,
    },
    /// Linear ground run at the speed specified per-action.
    LinearRun,
    /// Wraith-style glide with sine hover bob.
    Glide {
        speed: f32,
        hover_base: f32,
        hover_amplitude: f32,
        hover_frequency: f32,
    },
}

// ---------------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------------

/// A single animation definition: base row + frame count.
#[derive(Clone, Copy, Debug)]
pub struct AnimDef {
    pub base_row: u32,
    pub frame_count: u32,
}

/// A named animation action (e.g. "run", "bite", "attack").
#[derive(Clone, Debug)]
pub struct AnimAction {
    pub name: &'static str,
    pub def: AnimDef,
}

/// Complete animation set for a creature type.
#[derive(Clone, Debug)]
pub struct AnimSet {
    /// The default idle animation.
    pub idle: AnimDef,
    /// Additional named animations referenced by `BehaviorAction`.
    pub actions: Vec<AnimAction>,
}

impl AnimSet {
    /// Look up an action by name, falling back to idle if not found.
    pub fn find(&self, name: &str) -> AnimDef {
        self.actions
            .iter()
            .find(|a| a.name == name)
            .map(|a| a.def)
            .unwrap_or(self.idle)
    }
}

// ---------------------------------------------------------------------------
// Behavior
// ---------------------------------------------------------------------------

/// What a creature does when its idle timer expires.
#[derive(Clone, Debug)]
pub enum BehaviorAction {
    /// Move to a random nearby position.
    Move {
        anim_name: &'static str,
        min_dist: f32,
        max_dist: f32,
        speed: f32,
    },
    /// Play an emote animation in place.
    Emote {
        anim_name: &'static str,
        repeat: u32,
    },
    /// Extended idle (same as Emote with idle anim).
    ExtendedIdle { repeat: u32 },
}

/// A weighted behavior choice.
#[derive(Clone, Debug)]
pub struct BehaviorChoice {
    /// Cumulative probability threshold (0.0-1.0).
    pub threshold: f32,
    pub action: BehaviorAction,
}

/// Behavior profile: weighted list of choices on idle timeout.
#[derive(Clone, Debug)]
pub struct BehaviorProfile {
    pub choices: Vec<BehaviorChoice>,
}

// ---------------------------------------------------------------------------
// Tinting
// ---------------------------------------------------------------------------

/// How weather tinting is applied to this creature type.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum TintProfile {
    /// Standard day/night RGB tint, alpha = 1.0.
    Standard,
    /// Ghost tint: same RGB, alpha fades during daytime (wraith).
    Ghost,
}

// ---------------------------------------------------------------------------
// Visibility schedule
// ---------------------------------------------------------------------------

/// When this creature type is visible. Re-exported from npcdb when that
/// feature is enabled; standalone definition when not.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum VisibilitySchedule {
    Night,
    Day,
    Always,
}

// ---------------------------------------------------------------------------
// Sprite animation state (moved from game crate creature.rs)
// ---------------------------------------------------------------------------

/// Sprite render data (sprite sheet UV animation + hop arcs).
/// Shared between client and server for simulation state.
#[derive(Component)]
pub struct SpriteData {
    pub frame_timer: f32,
    pub frame_duration: f32,
    pub current_frame: u32,
    pub anim_row: u32,
    pub anim_frames: u32,
    pub facing_left: bool,
    pub hop_state: SpriteHopState,
}

/// Sprite creature hop/idle state machine.
#[derive(Clone, Copy, PartialEq)]
pub enum SpriteHopState {
    Idle {
        timer: f32,
    },
    Emote {
        remaining_frames: u32,
    },
    JumpWindup {
        target: Vec3,
    },
    Airborne {
        start: Vec3,
        target: Vec3,
        progress: f32,
    },
    Landing {
        timer: f32,
    },
}

impl Default for SpriteHopState {
    fn default() -> Self {
        Self::Idle { timer: 3.0 }
    }
}

// ---------------------------------------------------------------------------
// Creature core component (simulation-relevant fields only)
// ---------------------------------------------------------------------------

/// Core creature state needed by the simulation system.
/// On the client this is the same struct defined in the game crate's creature.rs;
/// the server uses this shared version directly.
#[derive(Component)]
pub struct Creature {
    /// NPC ref key (e.g. "wild-boar").
    pub npc_ref: &'static str,
    /// Current lifecycle state.
    pub state: CreatureState,
    /// Deterministic seed for this entity's current slot assignment.
    pub slot_seed: u32,
    /// Currently assigned chunk slot `(chunk_x, chunk_z, local_idx)`.
    pub assigned_slot: Option<(i32, i32, u16)>,
    /// World-space anchor position derived from the slot seed.
    pub anchor: Vec3,
    /// Phase offset for animation variety (derived from slot_seed).
    pub phase: f32,
}

/// Creature lifecycle state.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub enum CreatureState {
    /// In the entity pool, not assigned to any chunk slot.
    #[default]
    Pooled,
    /// Assigned to a chunk slot and actively simulated.
    Active,
}

/// Pool index component — tracks which pool slot this entity occupies.
#[derive(Component)]
pub struct CreaturePoolIndex(pub usize);

// ---------------------------------------------------------------------------
// Atlas pool (simulation-only tracking, no GPU handles)
// ---------------------------------------------------------------------------

/// Per-creature-type spawn tracking. GPU resource handles stay client-side.
#[derive(Resource, Default)]
pub struct SpriteAtlasPool {
    pub entries: Vec<SpriteAtlasEntry>,
}

/// Tracking entry for a single creature type.
pub struct SpriteAtlasEntry {
    pub type_key: &'static str,
    pub spawned: bool,
}

// ---------------------------------------------------------------------------
// Complete type descriptor
// ---------------------------------------------------------------------------

/// Static descriptor for one sprite creature type. Lives in the
/// `SpriteCreatureTypes` resource, keyed by NPC ref string.
#[derive(Clone, Debug)]
pub struct SpriteCreatureType {
    pub npc_ref: &'static str,
    pub texture_path: &'static str,
    pub sheet_cols: u32,
    pub sheet_rows: u32,
    pub sprite_size: f32,
    pub shadow_radius_factor: f32,
    pub shadow_height_factor: f32,
    pub frame_duration_base: f32,
    pub idle_min: f32,
    pub idle_max: f32,
    pub recycle_dist: f32,
    pub spawn_ring_inner: f32,
    pub spawn_ring_outer: f32,
    pub seed_offset: u32,
    pub direction_model: DirectionModel,
    pub movement: MovementProfile,
    pub visibility: VisibilitySchedule,
    pub tint: TintProfile,
    pub anims: AnimSet,
    pub behavior: BehaviorProfile,
    /// Optional behavior tree. When present, replaces the weighted-probability
    /// system with tree-driven decisions evaluated off the game thread.
    pub behavior_tree: Option<super::behavior::BehaviorNode>,
    /// Optional physics LOD config. When present, creatures get adaptive
    /// collision components based on distance to player.
    pub physics_lod: Option<super::physics_lod::PhysicsLodConfig>,
    /// Vitals configuration (health, mana, energy). Every creature gets vitals.
    pub vitals: VitalsConfig,
    /// Optional influence profile for waypoint-based patrol routing.
    /// When present, creatures get a `PatrolRoute` component at spawn.
    pub influence: Option<super::influence::InfluenceProfile>,
    /// Emote animation names available for dwell actions during patrol.
    pub patrol_emotes: &'static [&'static str],
}

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

/// All registered sprite creature type descriptors.
#[derive(Resource, Default)]
pub struct SpriteCreatureTypes {
    pub types: Vec<SpriteCreatureType>,
}

// ---------------------------------------------------------------------------
// Player positions resource (decouples from Player component)
// ---------------------------------------------------------------------------

/// Player positions populated each frame by the client or server.
/// The physics LOD system reads this instead of querying a `Player` component
/// directly, making it usable on both sides.
#[derive(Resource, Default)]
pub struct PlayerPositions(pub Vec<Vec3>);
