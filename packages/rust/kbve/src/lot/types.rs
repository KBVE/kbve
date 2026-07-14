//! Wire types for the MC lot/schematic surface.
//!
//! Mirrors the row shapes returned by the `public.proxy_*` RPCs in
//! `20260526223407_mc_lot_system.sql`. Numeric state fields stay i16 to
//! match the Postgres `SMALLINT` returns.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Lifecycle state for a parcel. Matches the `mc.lot_state` SMALLINT
/// domain (0..4).
#[repr(i16)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LotState {
    Vacant = 0,
    Owned = 1,
    Built = 2,
    UnderBuild = 3,
    Demolishing = 4,
}

impl LotState {
    pub fn from_pg(v: i16) -> Option<Self> {
        match v {
            0 => Some(LotState::Vacant),
            1 => Some(LotState::Owned),
            2 => Some(LotState::Built),
            3 => Some(LotState::UnderBuild),
            4 => Some(LotState::Demolishing),
            _ => None,
        }
    }
}

/// Worker queue state for a `mc.lot_build_log` row. Matches the
/// `mc.build_apply_state` SMALLINT domain (0..4).
#[repr(i16)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BuildApplyState {
    Queued = 0,
    Applied = 1,
    Failed = 2,
    Claimed = 3,
    Cancelled = 4,
}

impl BuildApplyState {
    pub fn from_pg(v: i16) -> Option<Self> {
        match v {
            0 => Some(BuildApplyState::Queued),
            1 => Some(BuildApplyState::Applied),
            2 => Some(BuildApplyState::Failed),
            3 => Some(BuildApplyState::Claimed),
            4 => Some(BuildApplyState::Cancelled),
            _ => None,
        }
    }
}

#[repr(i16)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BuildActionKind {
    Build = 0,
    Demolish = 1,
}

impl BuildActionKind {
    pub fn from_pg(v: i16) -> Option<Self> {
        match v {
            0 => Some(BuildActionKind::Build),
            1 => Some(BuildActionKind::Demolish),
            _ => None,
        }
    }
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

/// Public schematic row from `public.proxy_list_schematics`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SchematicRow {
    pub schematic_id: String,
    pub name: String,
    pub category: String,
    pub tier: i16,
    pub dims_x: i16,
    pub dims_y: i16,
    pub dims_z: i16,
    pub price_credits: i64,
    pub price_khash: i64,
}

// ---------------------------------------------------------------------------
// Lot rows
// ---------------------------------------------------------------------------

/// Row shape returned by `public.proxy_list_vacant_lots`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VacantLotRow {
    pub lot_id: String,
    pub chunk_x_min: i32,
    pub chunk_x_max: i32,
    pub chunk_z_min: i32,
    pub chunk_z_max: i32,
    pub block_x_min: i32,
    pub block_x_max: i32,
    pub block_z_min: i32,
    pub block_z_max: i32,
    pub chunk_area: i32,
    pub anchor_y: i16,
    pub price_credits: i64,
    pub price_khash: i64,
}

/// Row shape returned by `public.proxy_list_my_active_lots` /
/// `public.proxy_list_my_transitional_lots`. Adds state + current
/// schematic on top of the vacant shape.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OwnedLotRow {
    pub lot_id: String,
    pub chunk_x_min: i32,
    pub chunk_x_max: i32,
    pub chunk_z_min: i32,
    pub chunk_z_max: i32,
    pub block_x_min: i32,
    pub block_x_max: i32,
    pub block_z_min: i32,
    pub block_z_max: i32,
    pub chunk_area: i32,
    pub anchor_y: i16,
    pub state: LotState,
    pub current_schematic_id: Option<String>,
    pub price_credits: i64,
    pub price_khash: i64,
}

/// Row shape returned by `public.proxy_list_lots_in_viewport`. Owner-
/// identity is reduced to a boolean to avoid leaking other users' UUIDs.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ViewportLotRow {
    pub lot_id: String,
    pub chunk_x_min: i32,
    pub chunk_x_max: i32,
    pub chunk_z_min: i32,
    pub chunk_z_max: i32,
    pub block_x_min: i32,
    pub block_x_max: i32,
    pub block_z_min: i32,
    pub block_z_max: i32,
    pub anchor_y: i16,
    pub is_owned: bool,
    pub is_owned_by_me: bool,
    pub state: LotState,
    pub current_schematic_id: Option<String>,
}

/// Full row from `public.proxy_service_get_lot` (service-role only).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceLotRow {
    pub lot_id: String,
    pub world: String,
    pub chunk_x_min: i32,
    pub chunk_x_max: i32,
    pub chunk_z_min: i32,
    pub chunk_z_max: i32,
    pub block_x_min: i32,
    pub block_x_max: i32,
    pub block_z_min: i32,
    pub block_z_max: i32,
    pub chunk_area: i32,
    pub anchor_y: i16,
    pub owner_user_id: Option<Uuid>,
    pub current_schematic_id: Option<String>,
    pub state: LotState,
    pub price_credits: i64,
    pub price_khash: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

// ---------------------------------------------------------------------------
// Worker claim payload
// ---------------------------------------------------------------------------

/// Single job row returned by `public.proxy_service_claim_pending_builds`.
/// Denormalized so the worker can build without follow-up reads.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaimedBuildRow {
    pub build_id: String,
    pub lot_id: String,
    pub actor_user_id: Uuid,
    pub action_kind: BuildActionKind,
    pub schematic_id: Option<String>,
    pub queued_at: DateTime<Utc>,
    pub world: String,
    pub chunk_x_min: i32,
    pub chunk_x_max: i32,
    pub chunk_z_min: i32,
    pub chunk_z_max: i32,
    pub block_x_min: i32,
    pub block_x_max: i32,
    pub block_z_min: i32,
    pub block_z_max: i32,
    pub anchor_y: i16,
    /// Catalog `resource_path` for the schematic (nbt/schem file under
    /// `schematics/`). `None` for demolish jobs.
    pub resource_path: Option<String>,
    pub dims_x: Option<i16>,
    pub dims_y: Option<i16>,
    pub dims_z: Option<i16>,
}

// ---------------------------------------------------------------------------
// Failed build listing (admin)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FailedBuildRow {
    pub build_id: String,
    pub lot_id: String,
    pub actor_user_id: Uuid,
    pub action_kind: BuildActionKind,
    pub schematic_id: Option<String>,
    pub apply_error: Option<String>,
    pub failed_at: DateTime<Utc>,
    pub attempt_count: i32,
}

// ---------------------------------------------------------------------------
// Cursors
// ---------------------------------------------------------------------------

/// Keyset cursor for the public partial-index list RPCs. All four fields
/// must be provided together (or none at all) — the SQL side raises
/// 22023 on mixed-null cursors.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct LotCursor {
    pub after_world: Option<String>,
    pub after_chunk_x: Option<i32>,
    pub after_chunk_z: Option<i32>,
    pub after_lot_id: Option<String>,
}

/// Two-field cursor for the partial-index "my lots" / "vacant" wrappers
/// that hard-code the `world` argument.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct LotChunkCursor {
    pub after_chunk_x: Option<i32>,
    pub after_chunk_z: Option<i32>,
    pub after_lot_id: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct FailedBuildCursor {
    pub after_failed_at: Option<DateTime<Utc>>,
    pub after_build_id: Option<String>,
}

// ---------------------------------------------------------------------------
// Result of forced release
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReleasedLotRow {
    pub lot_id: String,
    pub prior_state: LotState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepairedLotRow {
    pub lot_id: String,
    pub prior_state: LotState,
    pub new_state: LotState,
    pub latest_build_id: Option<String>,
    pub latest_apply_state: Option<BuildApplyState>,
    pub latest_failed_at: Option<DateTime<Utc>>,
    pub latest_apply_error: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct RequeueStaleSummary {
    pub requeued_count: i32,
    pub exhausted_count: i32,
}
