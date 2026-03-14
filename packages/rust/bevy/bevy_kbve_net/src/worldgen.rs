//! Deterministic world generation shared between client and server.
//!
//! Both sides use the same `hash2d` + placement thresholds, so they agree on
//! what object exists at every tile without replicating the full world state.

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Deterministic hash — WASM-safe, zero-dependency
// ---------------------------------------------------------------------------

/// Deterministic 2D hash → [0.0, 1.0).
/// Used for all procedural placement decisions.
pub fn hash2d(x: i32, z: i32) -> f32 {
    let mut h = (x.wrapping_mul(374761393)) ^ (z.wrapping_mul(668265263));
    h = (h ^ (h >> 13)).wrapping_mul(1274126177);
    h = h ^ (h >> 16);
    (h as u32 as f32) / (u32::MAX as f32)
}

// ---------------------------------------------------------------------------
// Object kinds (must match client-side InteractableKind for trees/rocks/flowers/mushrooms)
// ---------------------------------------------------------------------------

/// What type of collectible object exists at a tile (if any).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum WorldObjectKind {
    Tree,
    Rock,
    Flower,
    Mushroom,
}

// ---------------------------------------------------------------------------
// Placement thresholds — must match tilemap.rs exactly
// ---------------------------------------------------------------------------

/// Check what object (if any) the deterministic world gen places at tile (tx, tz).
/// Priority: Tree > Rock > Flower > Mushroom.
pub fn object_at_tile(tx: i32, tz: i32) -> Option<WorldObjectKind> {
    // Tree: 5.5%
    if hash2d(tx + 11317, tz + 5471) < 0.055 {
        return Some(WorldObjectKind::Tree);
    }
    // Rock: 2.5%
    if hash2d(tx + 19457, tz + 12391) < 0.025 {
        return Some(WorldObjectKind::Rock);
    }
    // Flower: 12%
    if hash2d(tx + 13721, tz + 8293) < 0.12 {
        return Some(WorldObjectKind::Flower);
    }
    // Mushroom: 4%
    if hash2d(tx + 23017, tz + 17293) < 0.04 {
        return Some(WorldObjectKind::Mushroom);
    }
    None
}

// ---------------------------------------------------------------------------
// Tile key for tracking collected objects
// ---------------------------------------------------------------------------

/// Uniquely identifies a world tile. Since placement is deterministic and
/// at most one object per tile, (tx, tz) is sufficient.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct TileKey {
    pub tx: i32,
    pub tz: i32,
}
