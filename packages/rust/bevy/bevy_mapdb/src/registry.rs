use std::collections::HashMap;

use bevy::prelude::*;
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
#[derive(Resource, Default)]
pub struct MapDb {
    // Zones
    zones_by_id: HashMap<ProtoMapId, map::Zone>,
    zones_by_ref: HashMap<String, ProtoMapId>,
    zones_by_ulid: HashMap<String, ProtoMapId>,

    // Regions
    regions_by_id: HashMap<ProtoMapId, map::Region>,
    regions_by_ref: HashMap<String, ProtoMapId>,
    regions_by_ulid: HashMap<String, ProtoMapId>,

    // World object definitions
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
    pub fn from_json(json_str: &str) -> Result<Self, serde_json::Error> {
        let registry: map::MapRegistry = serde_json::from_str(json_str)?;
        Ok(Self::from_proto(registry))
    }

    // -------------------------------------------------------------------------
    // Zone operations
    // -------------------------------------------------------------------------

    /// Insert a zone into the database.
    pub fn insert_zone(&mut self, zone: map::Zone) {
        let id = ProtoMapId::from_ref(&zone.r#ref);
        self.zones_by_ref.insert(zone.r#ref.clone(), id);
        if !zone.id.is_empty() {
            self.zones_by_ulid.insert(zone.id.clone(), id);
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

    // -------------------------------------------------------------------------
    // Region operations
    // -------------------------------------------------------------------------

    /// Insert a region into the database.
    pub fn insert_region(&mut self, region: map::Region) {
        let id = ProtoMapId::from_ref(&region.r#ref);
        self.regions_by_ref.insert(region.r#ref.clone(), id);
        if !region.id.is_empty() {
            self.regions_by_ulid.insert(region.id.clone(), id);
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

    // -------------------------------------------------------------------------
    // World object definition operations
    // -------------------------------------------------------------------------

    /// Insert a world object definition into the database.
    pub fn insert_object_def(&mut self, obj_def: map::WorldObjectDef) {
        let id = ProtoMapId::from_ref(&obj_def.r#ref);
        self.object_defs_by_ref.insert(obj_def.r#ref.clone(), id);
        if !obj_def.id.is_empty() {
            self.object_defs_by_ulid.insert(obj_def.id.clone(), id);
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

    // -------------------------------------------------------------------------
    // Aggregate
    // -------------------------------------------------------------------------

    /// Whether the entire database is empty.
    pub fn is_empty(&self) -> bool {
        self.zones_by_id.is_empty()
            && self.regions_by_id.is_empty()
            && self.object_defs_by_id.is_empty()
    }
}
