//! Deterministic world generation shared between client and server.
//!
//! Both sides use the same `hash2d` + placement thresholds, so they agree on
//! what object exists at every tile without replicating the full world state.

use serde::{Deserialize, Serialize};

/// Deterministic 2D hash → [0.0, 1.0).
/// Used for all procedural placement decisions.
pub fn hash2d(x: i32, z: i32) -> f32 {
    let mut h = (x.wrapping_mul(374761393)) ^ (z.wrapping_mul(668265263));
    h = (h ^ (h >> 13)).wrapping_mul(1274126177);
    h = h ^ (h >> 16);
    (h as u32 as f32) / (u32::MAX as f32)
}

/// What type of collectible object exists at a tile (if any).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum WorldObjectKind {
    Tree,
    Rock,
    Flower,
    Mushroom,
}

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

/// Uniquely identifies a world tile. Since placement is deterministic and
/// at most one object per tile, (tx, tz) is sufficient.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct TileKey {
    pub tx: i32,
    pub tz: i32,
}

// Subkind → item_ref resolution
//
// Deterministic per-subkind buckets — mirror the client-side resolvers in
// `apps/kbve/isometric/src-tauri/src/game/rocks.rs::rock_kind_from_hash`,
// `mushrooms.rs::mushroom_kind_from_hash`, and the inline flower-archetype
// bucket in `tilemap.rs`. Server resolves item_ref directly so the wire
// protocol can carry the canonical ref string back to clients.

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

// Drop tables — deterministic per-tile loot rolls
//
// The first entry of every roll is the canonical primary drop (so it matches
// `item_ref_at` and drives the client-side fall/break animation + toast).
// Additional entries are bonus drops; quantities are variance rolls keyed off
// `hash2d` so the same tile re-rolled gives the same loot — important for
// reconnects + future server replays.

fn roll_quantity_in_range(seed_a: i32, seed_b: i32, tx: i32, tz: i32, min: u32, max: u32) -> u32 {
    if max <= min {
        return min;
    }
    let span = max - min + 1;
    let v = hash2d(tx + seed_a, tz + seed_b);
    min + ((v * span as f32) as u32).min(span - 1)
}

fn roll_rock_loot(tx: i32, tz: i32) -> Vec<(&'static str, u32)> {
    let primary = rock_item_ref(tx, tz);
    let qty = match primary {
        "crystal-ore" => roll_quantity_in_range(30001, 22001, tx, tz, 1, 3),
        "iron-ore" | "copper-ore" => roll_quantity_in_range(30001, 22001, tx, tz, 1, 2),
        _ => 1,
    };
    vec![(primary, qty)]
}

fn roll_tree_loot(tx: i32, tz: i32) -> Vec<(&'static str, u32)> {
    let mut drops = vec![("log", 1u32)];
    // 10% chance to also drop branches.
    if hash2d(tx + 31001, tz + 23001) < 0.10 {
        drops.push(("branches", 1));
    }
    // 5% chance to also drop ash (singed deadfall flavor).
    if hash2d(tx + 32001, tz + 24001) < 0.05 {
        drops.push(("ash", 1));
    }
    drops
}

/// Roll the full loot table for the object at (tx, tz). Deterministic per
/// tile coords. Returns an empty Vec if no collectible object exists.
pub fn roll_loot_at(tx: i32, tz: i32) -> Vec<(&'static str, u32)> {
    let Some(kind) = object_at_tile(tx, tz) else {
        return Vec::new();
    };
    match kind {
        WorldObjectKind::Tree => roll_tree_loot(tx, tz),
        WorldObjectKind::Rock => roll_rock_loot(tx, tz),
        WorldObjectKind::Flower => vec![(flower_item_ref(tx, tz), 1)],
        WorldObjectKind::Mushroom => vec![(mushroom_item_ref(tx, tz), 1)],
    }
}
