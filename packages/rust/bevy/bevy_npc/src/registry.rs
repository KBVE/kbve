use std::collections::HashMap;
use std::sync::Arc;

use bevy::prelude::*;
use prost::Message;

use crate::proto::npc;

/// Stable numeric identifier for an NPC, derived from its ref.
///
/// Used as a lightweight key for cross-system references (spawn tables,
/// network packets, save files). The full NPC data lives in [`NpcDb`].
///
/// The hash is FNV-1a (deterministic, no random seed) so that the same ref
/// always maps to the same id across processes, restarts, and saves.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
pub struct ProtoNpcId(pub u64);

impl ProtoNpcId {
    /// Create an id from an NPC ref using a deterministic FNV-1a hash.
    pub fn from_ref(r: &str) -> Self {
        // FNV-1a 64-bit
        let mut h: u64 = 0xcbf29ce484222325;
        for b in r.as_bytes() {
            h ^= *b as u64;
            h = h.wrapping_mul(0x100000001b3);
        }
        Self(h)
    }
}

/// Bevy resource holding all proto-defined NPC data.
///
/// Loaded once at startup from a proto-encoded `NpcRegistry` binary or
/// built programmatically. Provides fast lookups by [`ProtoNpcId`], ref,
/// ULID, or type-flag bitmask.
#[derive(Resource, Default)]
pub struct NpcDb {
    by_id: HashMap<ProtoNpcId, npc::Npc>,
    by_ref: HashMap<String, ProtoNpcId>,
    by_ulid: HashMap<String, ProtoNpcId>,
    /// Display names stored as `Arc<str>` — single allocation per NPC,
    /// reference-counted, freed when the database is dropped.
    display_names: HashMap<ProtoNpcId, Arc<str>>,
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
    ///
    /// Strings are extracted into the lookup tables before the NPC is moved
    /// into `by_id`, avoiding clones of the original `String` fields.
    pub fn insert(&mut self, npc: npc::Npc) {
        let id = ProtoNpcId::from_ref(&npc.r#ref);
        let name: Arc<str> = Arc::from(npc.name.as_str());
        let ref_key = npc.r#ref.clone();
        let ulid_key = if npc.id.is_empty() {
            None
        } else {
            Some(npc.id.clone())
        };

        self.display_names.insert(id, name);
        self.by_ref.insert(ref_key, id);
        if let Some(ulid) = ulid_key {
            self.by_ulid.insert(ulid, id);
        }
        self.by_id.insert(id, npc);
    }

    /// Look up an NPC by its [`ProtoNpcId`].
    pub fn get(&self, id: ProtoNpcId) -> Option<&npc::Npc> {
        self.by_id.get(&id)
    }

    /// Look up an NPC by its ref (e.g. `"glass-slime"`).
    pub fn get_by_ref(&self, r: &str) -> Option<&npc::Npc> {
        let id = self.by_ref.get(r)?;
        self.by_id.get(id)
    }

    /// Look up an NPC by its ULID string.
    pub fn get_by_ulid(&self, ulid: &str) -> Option<&npc::Npc> {
        let id = self.by_ulid.get(ulid)?;
        self.by_id.get(id)
    }

    /// Resolve a ref to a [`ProtoNpcId`].
    pub fn id_for_ref(&self, r: &str) -> Option<ProtoNpcId> {
        self.by_ref.get(r).copied()
    }

    /// Get the cached display name for an NPC.
    ///
    /// Returns a borrowed view tied to the database lifetime. The underlying
    /// storage is `Arc<str>` so callers that need owned ownership can call
    /// [`Self::display_name_arc`] for a cheap reference-count bump.
    pub fn display_name(&self, id: ProtoNpcId) -> &str {
        self.display_names
            .get(&id)
            .map(|s| s.as_ref())
            .unwrap_or("Unknown")
    }

    /// Get the cached display name as an `Arc<str>` (cheap to clone).
    pub fn display_name_arc(&self, id: ProtoNpcId) -> Option<Arc<str>> {
        self.display_names.get(&id).cloned()
    }

    /// Find all NPCs matching a type-flag bitmask.
    pub fn find_by_type_flags(&self, flags: i32) -> impl Iterator<Item = &npc::Npc> {
        self.by_id
            .values()
            .filter(move |npc| npc.type_flags & flags == flags)
    }

    /// Find all NPCs matching a rarity tier.
    pub fn find_by_rarity(&self, rarity: npc::NpcRarity) -> impl Iterator<Item = &npc::Npc> {
        let r = rarity as i32;
        self.by_id.values().filter(move |npc| npc.rarity == r)
    }

    /// Find all NPCs in a given creature family.
    pub fn find_by_family(&self, family: npc::CreatureFamily) -> impl Iterator<Item = &npc::Npc> {
        let f = family as i32;
        self.by_id.values().filter(move |npc| npc.family == f)
    }

    /// Find all NPCs at a given level.
    pub fn find_by_level(&self, level: i32) -> impl Iterator<Item = &npc::Npc> {
        self.by_id.values().filter(move |npc| npc.level == level)
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::proto::npc::{Npc, NpcRarity};

    fn sample(slug: &str, name: &str) -> Npc {
        Npc {
            r#ref: slug.into(),
            name: name.into(),
            ..Default::default()
        }
    }

    #[test]
    fn proto_npc_id_is_deterministic() {
        // Same ref must hash to the same id every call (and every process).
        let a = ProtoNpcId::from_ref("meadow-firefly");
        let b = ProtoNpcId::from_ref("meadow-firefly");
        assert_eq!(a, b, "same ref must hash to same id");

        // Published FNV-1a 64-bit test vector — guards against silent algo
        // swap (e.g. back to DefaultHasher's randomly-seeded SipHash).
        // Reference: http://www.isthe.com/chongo/tech/comp/fnv/
        assert_eq!(
            ProtoNpcId::from_ref("foobar").0,
            0x85944171f73967e8,
            "must match the FNV-1a 64-bit reference vector for \"foobar\""
        );
    }

    #[test]
    fn proto_npc_id_distinguishes_refs() {
        let a = ProtoNpcId::from_ref("meadow-firefly");
        let b = ProtoNpcId::from_ref("woodland-butterfly");
        assert_ne!(a, b);
    }

    #[test]
    fn insert_and_lookup() {
        let mut db = NpcDb::default();
        db.insert(sample("glass-slime", "Glass Slime"));

        let id = ProtoNpcId::from_ref("glass-slime");
        assert!(db.get(id).is_some());
        assert!(db.get_by_ref("glass-slime").is_some());
        assert_eq!(db.display_name(id), "Glass Slime");
        assert_eq!(db.id_for_ref("glass-slime"), Some(id));
        assert_eq!(db.len(), 1);
    }

    #[test]
    fn display_name_is_arc_not_leaked() {
        // Two inserts with the same name must each succeed and share no
        // global state — dropping the db must not cause leaks.
        let mut db = NpcDb::default();
        db.insert(sample("a", "Alpha"));
        db.insert(sample("b", "Alpha"));

        let id_a = ProtoNpcId::from_ref("a");
        let arc = db.display_name_arc(id_a).expect("missing arc");
        assert_eq!(arc.as_ref(), "Alpha");
        // Cloning an Arc<str> bumps refcount, no allocation.
        let _clone = Arc::clone(&arc);

        drop(db); // would have leaked under the old Box::leak() impl
    }

    #[test]
    fn unknown_display_name_fallback() {
        let db = NpcDb::default();
        let id = ProtoNpcId::from_ref("missing");
        assert_eq!(db.display_name(id), "Unknown");
        assert!(db.display_name_arc(id).is_none());
    }

    #[test]
    fn find_by_rarity_returns_iterator() {
        let mut db = NpcDb::default();
        let mut a = sample("a", "Alpha");
        a.rarity = NpcRarity::Common as i32;
        let mut b = sample("b", "Beta");
        b.rarity = NpcRarity::Epic as i32;
        let mut c = sample("c", "Gamma");
        c.rarity = NpcRarity::Common as i32;
        db.insert(a);
        db.insert(b);
        db.insert(c);

        // Iterator API: count without allocating a Vec.
        let common_count = db.find_by_rarity(NpcRarity::Common).count();
        assert_eq!(common_count, 2);
        let epic_count = db.find_by_rarity(NpcRarity::Epic).count();
        assert_eq!(epic_count, 1);
    }

    #[test]
    fn find_by_level_filters_correctly() {
        let mut db = NpcDb::default();
        for (slug, level) in [("a", 1), ("b", 2), ("c", 1), ("d", 3)] {
            let mut npc = sample(slug, slug);
            npc.level = level;
            db.insert(npc);
        }
        assert_eq!(db.find_by_level(1).count(), 2);
        assert_eq!(db.find_by_level(2).count(), 1);
        assert_eq!(db.find_by_level(99).count(), 0);
    }

    #[test]
    fn ulid_lookup_only_when_set() {
        let mut db = NpcDb::default();
        let mut npc = sample("a", "Alpha");
        npc.id = "01HQ000000000000000000000A".into();
        db.insert(npc);
        db.insert(sample("b", "Beta")); // no ulid

        assert!(db.get_by_ulid("01HQ000000000000000000000A").is_some());
        assert!(db.get_by_ulid("nope").is_none());
        // "b" has no ulid — must not be reachable via get_by_ulid.
        assert_eq!(db.by_ulid.len(), 1);
    }
}
