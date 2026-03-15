use std::collections::HashMap;

use bevy::prelude::*;
use prost::Message;

use crate::proto::npc;

/// Stable numeric identifier for an NPC, derived from its slug.
///
/// Used as a lightweight key for cross-system references (spawn tables,
/// network packets, save files). The full NPC data lives in [`NpcDb`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
pub struct ProtoNpcId(pub u64);

impl ProtoNpcId {
    /// Create an id from an NPC slug using a stable hash.
    pub fn from_slug(slug: &str) -> Self {
        use std::hash::{Hash, Hasher};
        let mut h = std::collections::hash_map::DefaultHasher::new();
        slug.hash(&mut h);
        Self(h.finish())
    }
}

/// Bevy resource holding all proto-defined NPC data.
///
/// Loaded once at startup from a proto-encoded `NpcRegistry` binary or
/// built programmatically. Provides fast lookups by [`ProtoNpcId`], slug,
/// ULID, or type-flag bitmask.
#[derive(Resource, Default)]
pub struct NpcDb {
    by_id: HashMap<ProtoNpcId, npc::Npc>,
    by_slug: HashMap<String, ProtoNpcId>,
    by_ulid: HashMap<String, ProtoNpcId>,
    display_names: HashMap<ProtoNpcId, &'static str>,
}

impl NpcDb {
    /// Build the database from a decoded proto `NpcRegistry`.
    pub fn from_proto(registry: npc::NpcRegistry) -> Self {
        let mut db = Self::default();
        for npc in registry.npcs {
            db.insert(npc);
        }
        db
    }

    /// Build from a proto-encoded binary (e.g. embedded asset or network payload).
    pub fn from_bytes(bytes: &[u8]) -> Result<Self, prost::DecodeError> {
        let registry = npc::NpcRegistry::decode(bytes)?;
        Ok(Self::from_proto(registry))
    }

    /// Build from a JSON string containing an array of NPC definitions.
    pub fn from_json(json_str: &str) -> Result<Self, serde_json::Error> {
        let npcs: Vec<npc::Npc> = serde_json::from_str(json_str)?;
        let mut db = Self::default();
        for npc in npcs {
            db.insert(npc);
        }
        Ok(db)
    }

    /// Insert a single NPC into the database.
    pub fn insert(&mut self, npc: npc::Npc) {
        let id = ProtoNpcId::from_slug(&npc.slug);
        let name: &'static str = Box::leak(npc.name.clone().into_boxed_str());
        self.display_names.insert(id, name);
        self.by_slug.insert(npc.slug.clone(), id);
        if !npc.id.is_empty() {
            self.by_ulid.insert(npc.id.clone(), id);
        }
        self.by_id.insert(id, npc);
    }

    /// Look up an NPC by its [`ProtoNpcId`].
    pub fn get(&self, id: ProtoNpcId) -> Option<&npc::Npc> {
        self.by_id.get(&id)
    }

    /// Look up an NPC by its URL slug (e.g. `"glass-slime"`).
    pub fn get_by_slug(&self, slug: &str) -> Option<&npc::Npc> {
        let id = self.by_slug.get(slug)?;
        self.by_id.get(id)
    }

    /// Look up an NPC by its ULID string.
    pub fn get_by_ulid(&self, ulid: &str) -> Option<&npc::Npc> {
        let id = self.by_ulid.get(ulid)?;
        self.by_id.get(id)
    }

    /// Resolve a slug to a [`ProtoNpcId`].
    pub fn id_for_slug(&self, slug: &str) -> Option<ProtoNpcId> {
        self.by_slug.get(slug).copied()
    }

    /// Get the cached display name for an NPC.
    pub fn display_name(&self, id: ProtoNpcId) -> &'static str {
        self.display_names.get(&id).copied().unwrap_or("Unknown")
    }

    /// Find all NPCs matching a type-flag bitmask.
    pub fn find_by_type_flags(&self, flags: i32) -> Vec<&npc::Npc> {
        self.by_id
            .values()
            .filter(|npc| npc.type_flags & flags == flags)
            .collect()
    }

    /// Find all NPCs matching a rarity tier.
    pub fn find_by_rarity(&self, rarity: npc::NpcRarity) -> Vec<&npc::Npc> {
        self.by_id
            .values()
            .filter(|npc| npc.rarity == rarity as i32)
            .collect()
    }

    /// Find all NPCs in a given creature family.
    pub fn find_by_family(&self, family: npc::CreatureFamily) -> Vec<&npc::Npc> {
        self.by_id
            .values()
            .filter(|npc| npc.family == family as i32)
            .collect()
    }

    /// Find all NPCs at a given level.
    pub fn find_by_level(&self, level: i32) -> Vec<&npc::Npc> {
        self.by_id
            .values()
            .filter(|npc| npc.level == level)
            .collect()
    }

    /// Total number of NPCs in the database.
    pub fn len(&self) -> usize {
        self.by_id.len()
    }

    /// Whether the database is empty.
    pub fn is_empty(&self) -> bool {
        self.by_id.is_empty()
    }

    /// Iterate over all NPCs.
    pub fn iter(&self) -> impl Iterator<Item = (ProtoNpcId, &npc::Npc)> {
        self.by_id.iter().map(|(&id, npc)| (id, npc))
    }
}
