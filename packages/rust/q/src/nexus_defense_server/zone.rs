//! Default Nexus Defense match zone, expressed as a `bevy_mapdb::map::Zone`.
//!
//! Lives in Rust today; a follow-up PR lifts this into an MDX entry under
//! `apps/kbve/astro-kbve/src/content/docs/mapdb/` once the gen-mapdb-data
//! pipeline learns how to route `type: "zone"` records into
//! `MapRegistry.zones[]`. Until then, this constructor is the source of
//! truth and keeps the proto shape stable across the cutover.
//!
//! The zone is **mode-agnostic** — only existing mapdb primitives are
//! used (no `tower_defense` proto extension). Any future TD-style game
//! (or co-op survival, or PvE arena) can load a zone via `bevy_mapdb`
//! and walk:
//!
//! - `objects[]` — pre-placed defensive buildings (uses
//!   `WorldObjectPlacement.grid_pos = {x: q, y: r}`).
//! - `spawn_points[]` — enemy spawn endpoints with
//!   `category = SPAWN_CATEGORY_ENEMY`.
//! - `pois[]` — landmark positions (nexus, waypoints, etc).
//! - `extensions[]` — typed key/value pacing knobs
//!   (`prepare_seconds`, `enemies_per_wave`).

use bevy_mapdb::map;

/// Extension keys honoured by the server. Use the `nexus_defense.` prefix
/// so co-existing mapdb consumers can scope their own knobs without
/// stepping on TD pacing.
pub const EXT_PREPARE_SECONDS: &str = "nexus_defense.prepare_seconds";
pub const EXT_ENEMIES_PER_WAVE: &str = "nexus_defense.enemies_per_wave";

pub const ZONE_REF: &str = "nexus-defense-default";

pub const DEFAULT_PREPARE_SECONDS: i64 = 6;
pub const DEFAULT_ENEMIES_PER_WAVE: i64 = 10;

const STARTER_TOWER_REF: &str = "nd-tower-basic";
const ENEMY_REF: &str = "nd-enemy-runner";

fn grid(q: i32, r: i32) -> map::GridPos {
    map::GridPos { x: q, y: r }
}

fn placement(object_def_ref: &str, q: i32, r: i32) -> map::WorldObjectPlacement {
    map::WorldObjectPlacement {
        object_def_ref: object_def_ref.to_string(),
        grid_pos: Some(grid(q, r)),
        position: None,
        rotation_y: None,
        scale_override: None,
        seed: None,
    }
}

fn extension_int(key: &str, value: i64) -> map::MapExtension {
    map::MapExtension {
        key: key.to_string(),
        value: Some(map::map_extension::Value::IntValue(value)),
    }
}

/// Build the default Nexus Defense zone. The fields populated here are
/// the only ones the server currently reads; everything else stays at
/// proto defaults so the zone serializes compactly.
pub fn default_zone() -> map::Zone {
    map::Zone {
        r#ref: ZONE_REF.to_string(),
        name: "Nexus Defense — Default".to_string(),
        description: Some(
            "Single-lane horizontal track. Spawn on the left, nexus on the right, \
             two starter towers flanking the path."
                .to_string(),
        ),
        r#type: map::ZoneType::Arena as i32,
        biome: map::Biome::Grassland as i32,
        objects: vec![
            placement(STARTER_TOWER_REF, -4, 0),
            placement(STARTER_TOWER_REF, 4, 0),
        ],
        spawn_points: vec![map::SpawnPoint {
            id: "spawn-west".to_string(),
            category: map::SpawnCategory::Enemy as i32,
            entity_ref: Some(ENEMY_REF.to_string()),
            grid_pos: Some(grid(-6, 0)),
            group_min: Some(1),
            group_max: Some(1),
            ..Default::default()
        }],
        pois: vec![map::PointOfInterest {
            id: "nexus-east".to_string(),
            r#ref: "nexus".to_string(),
            name: "Nexus".to_string(),
            r#type: map::PoiType::PoiTower as i32,
            grid_pos: Some(grid(6, 0)),
            ..Default::default()
        }],
        extensions: vec![
            extension_int(EXT_PREPARE_SECONDS, DEFAULT_PREPARE_SECONDS),
            extension_int(EXT_ENEMIES_PER_WAVE, DEFAULT_ENEMIES_PER_WAVE),
        ],
        ..Default::default()
    }
}

/// Read an int64 extension value by key, or `None` if absent / wrong type.
pub fn read_int_extension(zone: &map::Zone, key: &str) -> Option<i64> {
    zone.extensions
        .iter()
        .find(|ext| ext.key == key)
        .and_then(|ext| match ext.value.as_ref()? {
            map::map_extension::Value::IntValue(v) => Some(*v),
            _ => None,
        })
}
