use std::collections::HashMap;

use prost::Message;

use crate::proto::map;

/// Stable numeric identifier for a map entity (zone, region, or object def),
/// derived from its ref.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
pub struct ProtoMapId(pub u64);

impl ProtoMapId {
    /// Create an id from a ref using a stable hash.
    pub fn from_ref(r: &str) -> Self {
        use std::hash::{Hash, Hasher};
        let mut h = std::collections::hash_map::DefaultHasher::new();
        r.hash(&mut h);
        Self(h.finish())
    }
}

/// Bevy resource holding all proto-defined map data.
///
/// Loaded once at startup from a proto-encoded `MapRegistry` binary or
/// built programmatically. Provides fast lookups for zones, regions,
/// and world object definitions.
#[derive(Default)]
#[cfg_attr(feature = "bevy", derive(bevy::prelude::Resource))]
pub struct MapDb {
    zones_by_id: HashMap<ProtoMapId, map::Zone>,
    zones_by_ref: HashMap<String, ProtoMapId>,
    zones_by_ulid: HashMap<String, ProtoMapId>,

    regions_by_id: HashMap<ProtoMapId, map::Region>,
    regions_by_ref: HashMap<String, ProtoMapId>,
    regions_by_ulid: HashMap<String, ProtoMapId>,

    object_defs_by_id: HashMap<ProtoMapId, map::WorldObjectDef>,
    object_defs_by_ref: HashMap<String, ProtoMapId>,
    object_defs_by_ulid: HashMap<String, ProtoMapId>,
}

impl MapDb {
    /// Build the database from a decoded proto `MapRegistry`.
    pub fn from_proto(registry: map::MapRegistry) -> Self {
        let mut db = Self::default();
        for zone in registry.zones {
            db.insert_zone(zone);
        }
        for region in registry.regions {
            db.insert_region(region);
        }
        for obj_def in registry.object_defs {
            db.insert_object_def(obj_def);
        }
        db
    }

    /// Build from a proto-encoded binary.
    pub fn from_bytes(bytes: &[u8]) -> Result<Self, prost::DecodeError> {
        let registry = map::MapRegistry::decode(bytes)?;
        Ok(Self::from_proto(registry))
    }

    /// Build from a JSON string containing a `MapRegistry`.
    ///
    /// Accepts canonical protobuf JSON, whose field names are lowerCamelCase,
    /// as well as the snake_case names prost generates. Without the former the
    /// whole document deserializes to defaults in silence — every message here
    /// carries `#[serde(default)]`, so an unmatched `objectDefs` key is simply
    /// dropped and the registry comes back empty.
    pub fn from_json(json_str: &str) -> Result<Self, serde_json::Error> {
        let mut value: serde_json::Value = serde_json::from_str(json_str)?;
        snake_case_keys(&mut value);
        let registry: map::MapRegistry = serde_json::from_value(value)?;
        Ok(Self::from_proto(registry))
    }

    /// Insert a zone into the database.
    pub fn insert_zone(&mut self, zone: map::Zone) {
        let id = ProtoMapId::from_ref(&zone.r#ref);
        self.zones_by_ref.insert(zone.r#ref.clone(), id);
        if let Some(ulid) = kbve_proto::ulid_text(zone.id.as_ref()) {
            self.zones_by_ulid.insert(ulid, id);
        }
        self.zones_by_id.insert(id, zone);
    }

    /// Look up a zone by its [`ProtoMapId`].
    pub fn get_zone(&self, id: ProtoMapId) -> Option<&map::Zone> {
        self.zones_by_id.get(&id)
    }

    /// Look up a zone by ref.
    pub fn get_zone_by_ref(&self, r: &str) -> Option<&map::Zone> {
        let id = self.zones_by_ref.get(r)?;
        self.zones_by_id.get(id)
    }

    /// Look up a zone by ULID.
    pub fn get_zone_by_ulid(&self, ulid: &str) -> Option<&map::Zone> {
        let id = self.zones_by_ulid.get(ulid)?;
        self.zones_by_id.get(id)
    }

    /// Find all zones matching a biome.
    pub fn find_zones_by_biome(&self, biome: map::Biome) -> Vec<&map::Zone> {
        self.zones_by_id
            .values()
            .filter(|z| z.biome == biome as i32)
            .collect()
    }

    /// Find all zones matching a zone type.
    pub fn find_zones_by_type(&self, zone_type: map::ZoneType) -> Vec<&map::Zone> {
        self.zones_by_id
            .values()
            .filter(|z| z.r#type == zone_type as i32)
            .collect()
    }

    /// Total number of zones.
    pub fn zone_count(&self) -> usize {
        self.zones_by_id.len()
    }

    /// Iterate over all zones.
    pub fn zones(&self) -> impl Iterator<Item = (ProtoMapId, &map::Zone)> {
        self.zones_by_id.iter().map(|(&id, zone)| (id, zone))
    }

    /// Insert a region into the database.
    pub fn insert_region(&mut self, region: map::Region) {
        let id = ProtoMapId::from_ref(&region.r#ref);
        self.regions_by_ref.insert(region.r#ref.clone(), id);
        if let Some(ulid) = kbve_proto::ulid_text(region.id.as_ref()) {
            self.regions_by_ulid.insert(ulid, id);
        }
        self.regions_by_id.insert(id, region);
    }

    /// Look up a region by its [`ProtoMapId`].
    pub fn get_region(&self, id: ProtoMapId) -> Option<&map::Region> {
        self.regions_by_id.get(&id)
    }

    /// Look up a region by ref.
    pub fn get_region_by_ref(&self, r: &str) -> Option<&map::Region> {
        let id = self.regions_by_ref.get(r)?;
        self.regions_by_id.get(id)
    }

    /// Look up a region by ULID.
    pub fn get_region_by_ulid(&self, ulid: &str) -> Option<&map::Region> {
        let id = self.regions_by_ulid.get(ulid)?;
        self.regions_by_id.get(id)
    }

    /// Total number of regions.
    pub fn region_count(&self) -> usize {
        self.regions_by_id.len()
    }

    /// Iterate over all regions.
    pub fn regions(&self) -> impl Iterator<Item = (ProtoMapId, &map::Region)> {
        self.regions_by_id.iter().map(|(&id, region)| (id, region))
    }

    /// Insert a world object definition into the database.
    pub fn insert_object_def(&mut self, obj_def: map::WorldObjectDef) {
        let id = ProtoMapId::from_ref(&obj_def.r#ref);
        self.object_defs_by_ref.insert(obj_def.r#ref.clone(), id);
        if let Some(ulid) = kbve_proto::ulid_text(obj_def.id.as_ref()) {
            self.object_defs_by_ulid.insert(ulid, id);
        }
        self.object_defs_by_id.insert(id, obj_def);
    }

    /// Look up a world object definition by its [`ProtoMapId`].
    pub fn get_object_def(&self, id: ProtoMapId) -> Option<&map::WorldObjectDef> {
        self.object_defs_by_id.get(&id)
    }

    /// Look up a world object definition by ref.
    pub fn get_object_def_by_ref(&self, r: &str) -> Option<&map::WorldObjectDef> {
        let id = self.object_defs_by_ref.get(r)?;
        self.object_defs_by_id.get(id)
    }

    /// Look up a world object definition by ULID.
    pub fn get_object_def_by_ulid(&self, ulid: &str) -> Option<&map::WorldObjectDef> {
        let id = self.object_defs_by_ulid.get(ulid)?;
        self.object_defs_by_id.get(id)
    }

    /// Find all object defs matching a world object type.
    pub fn find_object_defs_by_type(
        &self,
        obj_type: map::WorldObjectType,
    ) -> Vec<&map::WorldObjectDef> {
        self.object_defs_by_id
            .values()
            .filter(|o| o.r#type == obj_type as i32)
            .collect()
    }

    /// Total number of world object definitions.
    pub fn object_def_count(&self) -> usize {
        self.object_defs_by_id.len()
    }

    /// Iterate over all world object definitions.
    pub fn object_defs(&self) -> impl Iterator<Item = (ProtoMapId, &map::WorldObjectDef)> {
        self.object_defs_by_id.iter().map(|(&id, def)| (id, def))
    }

    /// Whether the entire database is empty.
    pub fn is_empty(&self) -> bool {
        self.zones_by_id.is_empty()
            && self.regions_by_id.is_empty()
            && self.object_defs_by_id.is_empty()
    }
}

/// Proto map fields whose keys are data, not field names. Their contents must
/// survive normalisation untouched — an item ref is not a struct field.
const STRING_KEYED_MAPS: &[&str] = &["resources", "capacity_per_item", "capacityPerItem"];

/// Rewrite lowerCamelCase object keys to snake_case, in place.
///
/// Only keys that actually look camelCase are touched, so slugs and display
/// names used as map keys are left alone.
fn snake_case_keys(value: &mut serde_json::Value) {
    match value {
        serde_json::Value::Array(items) => {
            for item in items {
                snake_case_keys(item);
            }
        }
        serde_json::Value::Object(map) => {
            let renamed: serde_json::Map<String, serde_json::Value> = std::mem::take(map)
                .into_iter()
                .map(|(key, mut child)| {
                    if !STRING_KEYED_MAPS.contains(&key.as_str()) {
                        snake_case_keys(&mut child);
                    }
                    let key = to_snake_case(&key);
                    coerce_enum(&key, &mut child);
                    (key, child)
                })
                .collect();
            *map = renamed;
        }
        _ => {}
    }
}

/// Enum-valued fields, paired with the prefixes their value names carry.
///
/// Three spellings reach this, and all three are accepted.
///
/// The snapshot is inconsistent about how much of the prefix it writes: `type`
/// arrives as `WORLD_OBJECT_RESOURCE_NODE` while `interaction` arrives as a
/// bare `shop`.
///
/// On top of that, some names moved. The schema's enum values are prefixed
/// with the enum's own name now, which the linter requires, so
/// `WORLD_OBJECT_RESOURCE_NODE` became `WORLD_OBJECT_TYPE_RESOURCE_NODE`. The
/// content pipeline still emits the old spelling, and will until it is
/// regenerated against the current schema. Both prefixes are carried here so
/// the snapshot keeps loading in the meantime; when the pipeline catches up,
/// the legacy column can go.
type EnumLookup = fn(&str) -> Option<i32>;

/// A field's lookup, its legacy prefix, and its canonical one.
type EnumEntry = (EnumLookup, &'static str, &'static str);

fn enum_lookup(field: &str) -> Option<EnumEntry> {
    let entry: EnumEntry = match field {
        "type" => (
            |n| map::WorldObjectType::from_str_name(n).map(|e| e as i32),
            "WORLD_OBJECT_",
            "WORLD_OBJECT_TYPE_",
        ),
        "resource_type" => (
            |n| map::ResourceType::from_str_name(n).map(|e| e as i32),
            "RESOURCE_",
            "RESOURCE_TYPE_",
        ),
        "container_type" => (
            |n| map::ContainerType::from_str_name(n).map(|e| e as i32),
            "CONTAINER_",
            "CONTAINER_TYPE_",
        ),
        "crafting_station_type" => (
            |n| map::CraftingStationType::from_str_name(n).map(|e| e as i32),
            "CRAFTING_STATION_",
            "CRAFTING_STATION_TYPE_",
        ),
        "footprint_shape" => (
            |n| map::FootprintShape::from_str_name(n).map(|e| e as i32),
            "FOOTPRINT_SHAPE_",
            "FOOTPRINT_SHAPE_",
        ),
        "cost_source" => (
            |n| map::CostSource::from_str_name(n).map(|e| e as i32),
            "COST_SOURCE_",
            "COST_SOURCE_",
        ),
        "kind" => (
            |n| map::ServiceKind::from_str_name(n).map(|e| e as i32),
            "SERVICE_KIND_",
            "SERVICE_KIND_",
        ),
        "interaction" => (
            |n| map::InteractionKind::from_str_name(n).map(|e| e as i32),
            "INTERACTION_KIND_",
            "INTERACTION_KIND_",
        ),
        _ => return None,
    };
    Some(entry)
}

/// Canonical protobuf JSON writes enums as their variant name; prost wants the
/// discriminant. Convert the ones mapdb actually uses, leaving an unrecognised
/// name in place so the deserializer reports it instead of silently zeroing.
fn coerce_enum(field: &str, value: &mut serde_json::Value) {
    let Some((from_name, legacy, canonical)) = enum_lookup(field) else {
        return;
    };
    let lookup = |name: &str| -> Option<i32> {
        let upper = name.to_ascii_uppercase();
        from_name(&upper)
            // A bare value, e.g. `shop`.
            .or_else(|| from_name(&format!("{canonical}{upper}")))
            // The old spelling, re-prefixed with the enum's own name.
            .or_else(|| {
                upper
                    .strip_prefix(legacy)
                    .and_then(|tail| from_name(&format!("{canonical}{tail}")))
            })
    };

    match value {
        serde_json::Value::String(name) => {
            if let Some(discriminant) = lookup(name) {
                *value = serde_json::Value::from(discriminant);
            }
        }
        serde_json::Value::Array(items) => {
            for item in items {
                if let serde_json::Value::String(name) = item
                    && let Some(discriminant) = lookup(name)
                {
                    *item = serde_json::Value::from(discriminant);
                }
            }
        }
        _ => {}
    }
}

/// `objectDefs` -> `object_defs`. Anything that is not lowerCamelCase, such as
/// a `copper-ore` map key or a `WORLD_OBJECT_ARENA` value, is returned as-is.
fn to_snake_case(key: &str) -> String {
    // Only a bare lowerCamelCase identifier is a field name. Anything with a
    // space, hyphen or leading capital is data — a slug or a display name.
    let is_camel = key.starts_with(|c: char| c.is_ascii_lowercase())
        && key.chars().all(|c| c.is_ascii_alphanumeric())
        && key.chars().any(|c| c.is_ascii_uppercase());
    if !is_camel {
        return key.to_owned();
    }
    let mut out = String::with_capacity(key.len() + 4);
    for (i, c) in key.chars().enumerate() {
        if c.is_ascii_uppercase() {
            if i > 0 {
                out.push('_');
            }
            out.push(c.to_ascii_lowercase());
        } else {
            out.push(c);
        }
    }
    out
}

#[cfg(test)]
mod json_case_tests {
    use super::*;

    #[test]
    fn camel_case_field_names_become_snake_case() {
        assert_eq!(to_snake_case("objectDefs"), "object_defs");
        assert_eq!(to_snake_case("subKind"), "sub_kind");
        assert_eq!(to_snake_case("harvestYield"), "harvest_yield");
    }

    #[test]
    fn slugs_and_enum_values_are_left_alone() {
        assert_eq!(to_snake_case("copper-ore"), "copper-ore");
        assert_eq!(to_snake_case("ref"), "ref");
        assert_eq!(to_snake_case("WORLD_OBJECT_ARENA"), "WORLD_OBJECT_ARENA");
        assert_eq!(to_snake_case("Adamantine Vein"), "Adamantine Vein");
    }

    #[test]
    fn canonical_proto_json_loads_its_object_defs() {
        let json = r#"{
            "objectDefs": [
                {
                    "ref": "copper-vein",
                    "name": "Copper Vein",
                    "type": "WORLD_OBJECT_RESOURCE_NODE",
                    "subKind": "copper_ore",
                    "harvestYield": 6
                }
            ]
        }"#;

        let db = MapDb::from_json(json).expect("canonical proto JSON must load");

        let def = db
            .get_object_def_by_ref("copper-vein")
            .expect("object defs must survive the load");
        assert_eq!(def.name, "Copper Vein");
        assert_eq!(def.sub_kind.as_deref(), Some("copper_ore"));
    }

    #[test]
    fn the_snapshots_legacy_enum_spelling_still_resolves() {
        // The pipeline emits WORLD_OBJECT_RESOURCE_NODE; the schema calls it
        // WORLD_OBJECT_TYPE_RESOURCE_NODE. This is the case that silently
        // produced a zero -- an UNSPECIFIED object type -- if it were coerced
        // by name alone.
        let json = r#"{
            "objectDefs": [
                { "ref": "copper-vein", "name": "Copper Vein", "type": "WORLD_OBJECT_RESOURCE_NODE" }
            ]
        }"#;
        let db = MapDb::from_json(json).expect("the legacy spelling must load");
        let def = db.get_object_def_by_ref("copper-vein").unwrap();
        assert_eq!(
            def.r#type,
            map::WorldObjectType::ResourceNode as i32,
            "a resource node must not arrive as UNSPECIFIED"
        );
    }

    #[test]
    fn snake_case_json_still_loads() {
        let json = r#"{
            "object_defs": [
                { "ref": "boulder", "name": "Boulder", "sub_kind": "stone" }
            ]
        }"#;

        let db = MapDb::from_json(json).expect("snake_case JSON must still load");

        assert_eq!(
            db.get_object_def_by_ref("boulder").map(|d| d.name.as_str()),
            Some("Boulder")
        );
    }

    #[test]
    fn item_ref_map_keys_are_not_rewritten() {
        let mut value: serde_json::Value = serde_json::from_str(
            r#"{"resourceLedger":{"resources":{"copperOre":4,"copper-ore":2}}}"#,
        )
        .unwrap();
        snake_case_keys(&mut value);

        let resources = &value["resource_ledger"]["resources"];
        assert!(
            resources.get("copperOre").is_some(),
            "a map key is data and must not be rewritten: {resources}"
        );
    }
}
