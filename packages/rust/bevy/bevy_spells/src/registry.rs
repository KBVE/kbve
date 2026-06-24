use std::collections::HashMap;

use bevy::prelude::*;
use prost::Message;

use crate::proto::spell;

/// Stable numeric identifier for a spell, derived from its ref.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
pub struct ProtoSpellId(pub u64);

impl ProtoSpellId {
    /// Create an id from a spell ref using a stable hash.
    pub fn from_ref(r: &str) -> Self {
        use std::hash::{Hash, Hasher};
        let mut h = std::collections::hash_map::DefaultHasher::new();
        r.hash(&mut h);
        Self(h.finish())
    }
}

/// Bevy resource holding all proto-defined spell data.
///
/// Loaded once at startup from a proto-encoded `SpellRegistry` binary or built
/// programmatically. Provides fast lookups by [`ProtoSpellId`], ref, or ULID.
#[derive(Resource, Default)]
pub struct SpellDb {
    by_id: HashMap<ProtoSpellId, spell::Spell>,
    by_ref: HashMap<String, ProtoSpellId>,
    by_ulid: HashMap<String, ProtoSpellId>,
    display_names: HashMap<ProtoSpellId, &'static str>,
}

impl SpellDb {
    /// Build the registry from a decoded proto `SpellRegistry`.
    pub fn from_proto(registry: spell::SpellRegistry) -> Self {
        let mut db = Self::default();
        for s in registry.spells {
            db.insert(s);
        }
        db
    }

    /// Build from a proto-encoded binary (e.g. embedded asset or network payload).
    pub fn from_bytes(bytes: &[u8]) -> Result<Self, prost::DecodeError> {
        let registry = spell::SpellRegistry::decode(bytes)?;
        Ok(Self::from_proto(registry))
    }

    /// Insert a single spell into the registry.
    pub fn insert(&mut self, s: spell::Spell) {
        let id = ProtoSpellId::from_ref(&s.r#ref);
        let name: &'static str = Box::leak(s.name.clone().into_boxed_str());
        self.display_names.insert(id, name);
        self.by_ref.insert(s.r#ref.clone(), id);
        if !s.id.is_empty() {
            self.by_ulid.insert(s.id.clone(), id);
        }
        self.by_id.insert(id, s);
    }

    /// Look up a spell by its [`ProtoSpellId`].
    pub fn get(&self, id: ProtoSpellId) -> Option<&spell::Spell> {
        self.by_id.get(&id)
    }

    /// Look up a spell by its ref (e.g. `"fireball"`).
    pub fn get_by_ref(&self, r: &str) -> Option<&spell::Spell> {
        let id = self.by_ref.get(r)?;
        self.by_id.get(id)
    }

    /// Look up a spell by its ULID string.
    pub fn get_by_ulid(&self, ulid: &str) -> Option<&spell::Spell> {
        let id = self.by_ulid.get(ulid)?;
        self.by_id.get(id)
    }

    /// Resolve a ref to a [`ProtoSpellId`].
    pub fn id_for_ref(&self, r: &str) -> Option<ProtoSpellId> {
        self.by_ref.get(r).copied()
    }

    /// Get the cached display name for a spell.
    pub fn display_name(&self, id: ProtoSpellId) -> &'static str {
        self.display_names.get(&id).copied().unwrap_or("Unknown")
    }

    /// Find all spells of a given school.
    pub fn find_by_school(&self, school: spell::SpellSchool) -> Vec<&spell::Spell> {
        self.by_id
            .values()
            .filter(|s| s.school == school as i32)
            .collect()
    }

    /// Find all spells matching a rarity tier.
    pub fn find_by_rarity(&self, rarity: spell::SpellRarity) -> Vec<&spell::Spell> {
        self.by_id
            .values()
            .filter(|s| s.rarity == rarity as i32)
            .collect()
    }

    /// Total number of spells in the registry.
    pub fn len(&self) -> usize {
        self.by_id.len()
    }

    /// Whether the registry is empty.
    pub fn is_empty(&self) -> bool {
        self.by_id.is_empty()
    }

    /// Iterate over all spells.
    pub fn iter(&self) -> impl Iterator<Item = (ProtoSpellId, &spell::Spell)> {
        self.by_id.iter().map(|(&id, s)| (id, s))
    }
}
