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

// ---------------------------------------------------------------------------
// Subkind → item_ref resolution
//
// Deterministic per-subkind buckets — mirror the client-side resolvers in
// `apps/kbve/isometric/src-tauri/src/game/rocks.rs::rock_kind_from_hash`,
// `mushrooms.rs::mushroom_kind_from_hash`, and the inline flower-archetype
// bucket in `tilemap.rs`. Server resolves item_ref directly so the wire
// protocol can carry the canonical ref string back to clients.
// ---------------------------------------------------------------------------

const NUM_FLORA_SPECIES: usize = 10;

const FLOWER_REFS: [&str; NUM_FLORA_SPECIES] = [
    "tulip",
    "daisy",
    "lavender",
    "bellflower",
    "wildflower",
    "sunflower",
    "rose",
    "cornflower",
    "allium",
    "blue-orchid",
];

fn rock_item_ref(tx: i32, tz: i32) -> &'static str {
    let v = hash2d(tx + 20001, tz + 15001);
    if v < 0.40 {
        "stone"
    } else if v < 0.55 {
        "mossy-stone"
    } else if v < 0.72 {
        "copper-ore"
    } else if v < 0.88 {
        "iron-ore"
    } else {
        "crystal-ore"
    }
}

fn flower_item_ref(tx: i32, tz: i32) -> &'static str {
    let idx =
        (hash2d(tx + 13821, tz + 8393) * NUM_FLORA_SPECIES as f32) as usize % NUM_FLORA_SPECIES;
    FLOWER_REFS[idx]
}

fn mushroom_item_ref(tx: i32, tz: i32) -> &'static str {
    let v = hash2d(tx + 25001, tz + 18001);
    if v < 0.45 {
        "porcini"
    } else if v < 0.75 {
        "chanterelle"
    } else {
        "fly-agaric"
    }
}

/// Resolve the canonical itemdb `ref` string for the object at (tx, tz),
/// if any. Returns `None` when no object exists at the tile.
pub fn item_ref_at(tx: i32, tz: i32) -> Option<&'static str> {
    match object_at_tile(tx, tz)? {
        WorldObjectKind::Tree => Some("log"),
        WorldObjectKind::Rock => Some(rock_item_ref(tx, tz)),
        WorldObjectKind::Flower => Some(flower_item_ref(tx, tz)),
        WorldObjectKind::Mushroom => Some(mushroom_item_ref(tx, tz)),
    }
}
