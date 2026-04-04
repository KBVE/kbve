//! Generic sprite creature types — data-driven definitions that replace
//! per-creature hardcoded modules.

use bevy::prelude::*;
use bevy::render::storage::ShaderStorageBuffer;

use super::super::sprite_material::{SpriteAnimData, SpriteAtlasMaterial};

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
// Direction handling
// ---------------------------------------------------------------------------

/// How a sprite creature resolves its facing direction.
#[derive(Clone, Debug)]
pub enum DirectionModel {
    /// 2-way: sprite faces left or right via UV mirror (frog, wraith).
    Flip,
    /// 4-directional atlas rows. Each animation block has 4 sub-rows.
    /// `quadrant_to_row[q]` maps an isometric quadrant index to a row offset.
    ///
    /// Quadrant index is derived from movement delta `(dx, dz)`:
    ///   `q = (diff_positive as u32) << 1 | sum_positive as u32`
    ///   where `diff = dx - dz`, `sum = dx + dz`.
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
    /// Cumulative probability threshold (0.0–1.0).
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
// Visibility schedule (reuses TimeSchedule from bevy_kbve_net)
// ---------------------------------------------------------------------------

pub use bevy_kbve_net::npcdb::TimeSchedule as VisibilitySchedule;

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
}

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

/// All registered sprite creature type descriptors.
#[derive(Resource, Default)]
pub struct SpriteCreatureTypes {
    pub types: Vec<SpriteCreatureType>,
}

/// Per-creature-type GPU resources (material + SSBO). One entry per type.
#[derive(Resource, Default)]
pub struct SpriteAtlasPool {
    pub entries: Vec<SpriteAtlasEntry>,
}

/// GPU resources for a single creature type.
pub struct SpriteAtlasEntry {
    pub type_key: &'static str,
    pub material: Handle<SpriteAtlasMaterial>,
    pub anim_buffer: Handle<ShaderStorageBuffer>,
    pub anim_data: Vec<SpriteAnimData>,
    pub spawned: bool,
}
