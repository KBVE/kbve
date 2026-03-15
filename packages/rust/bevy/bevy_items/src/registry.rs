use std::collections::HashMap;

use bevy::prelude::*;
use prost::Message;

use crate::proto::item;

/// Stable numeric identifier for an item, derived from its slug.
///
/// Used as a lightweight key for cross-system references (inventory slots,
/// network packets, save files). The full item data lives in [`ItemDb`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
pub struct ProtoItemId(pub u64);

impl ProtoItemId {
    /// Create an id from an item slug using a stable hash.
    pub fn from_slug(slug: &str) -> Self {
        use std::hash::{Hash, Hasher};
        let mut h = std::collections::hash_map::DefaultHasher::new();
        slug.hash(&mut h);
        Self(h.finish())
    }
}

/// Bevy resource holding all proto-defined item data.
///
/// Loaded once at startup from a proto-encoded `ItemRegistry` binary or
/// built programmatically. Provides fast lookups by [`ProtoItemId`], slug,
/// ULID, or type-flag bitmask.
#[derive(Resource, Default)]
pub struct ItemDb {
    by_id: HashMap<ProtoItemId, item::Item>,
    by_slug: HashMap<String, ProtoItemId>,
    by_ulid: HashMap<String, ProtoItemId>,
    display_names: HashMap<ProtoItemId, &'static str>,
}

impl ItemDb {
    /// Build the registry from a decoded proto `ItemRegistry`.
    pub fn from_proto(registry: item::ItemRegistry) -> Self {
        let mut db = Self::default();
        for item in registry.items {
            db.insert(item);
        }
        db
    }

    /// Build from a proto-encoded binary (e.g. embedded asset or network payload).
    pub fn from_bytes(bytes: &[u8]) -> Result<Self, prost::DecodeError> {
        let registry = item::ItemRegistry::decode(bytes)?;
        Ok(Self::from_proto(registry))
    }

    /// Build from the Astro `/api/itemdb.json` response.
    ///
    /// This handles the string-enum to i32 conversion and Astro-specific
    /// field mapping automatically.
    pub fn from_json(json_str: &str) -> Result<Self, crate::json::JsonLoadError> {
        let items = crate::json::parse_itemdb_json(json_str)?;
        let mut db = Self::default();
        for item in items {
            db.insert(item);
        }
        Ok(db)
    }

    /// Insert a single item into the registry.
    pub fn insert(&mut self, item: item::Item) {
        let id = ProtoItemId::from_slug(&item.slug);
        let name: &'static str = Box::leak(item.name.clone().into_boxed_str());
        self.display_names.insert(id, name);
        self.by_slug.insert(item.slug.clone(), id);
        if !item.id.is_empty() {
            self.by_ulid.insert(item.id.clone(), id);
        }
        self.by_id.insert(id, item);
    }

    /// Look up an item by its [`ProtoItemId`].
    pub fn get(&self, id: ProtoItemId) -> Option<&item::Item> {
        self.by_id.get(&id)
    }

    /// Look up an item by its URL slug (e.g. `"fire-flask"`).
    pub fn get_by_slug(&self, slug: &str) -> Option<&item::Item> {
        let id = self.by_slug.get(slug)?;
        self.by_id.get(id)
    }

    /// Look up an item by its ULID string.
    pub fn get_by_ulid(&self, ulid: &str) -> Option<&item::Item> {
        let id = self.by_ulid.get(ulid)?;
        self.by_id.get(id)
    }

    /// Resolve a slug to a [`ProtoItemId`].
    pub fn id_for_slug(&self, slug: &str) -> Option<ProtoItemId> {
        self.by_slug.get(slug).copied()
    }

    /// Get the cached display name for an item.
    pub fn display_name(&self, id: ProtoItemId) -> &'static str {
        self.display_names.get(&id).copied().unwrap_or("Unknown")
    }

    /// Get the max stack size for an item (defaults to 1).
    pub fn max_stack(&self, id: ProtoItemId) -> u32 {
        self.by_id
            .get(&id)
            .and_then(|i| i.max_stack)
            .map(|s| s as u32)
            .unwrap_or(1)
    }

    /// Find all items matching a type-flag bitmask.
    pub fn find_by_type_flags(&self, flags: i32) -> Vec<&item::Item> {
        self.by_id
            .values()
            .filter(|item| item.type_flags & flags == flags)
            .collect()
    }

    /// Find all items matching a rarity tier.
    pub fn find_by_rarity(&self, rarity: item::ItemRarity) -> Vec<&item::Item> {
        self.by_id
            .values()
            .filter(|item| item.rarity == rarity as i32)
            .collect()
    }

    /// Total number of items in the registry.
    pub fn len(&self) -> usize {
        self.by_id.len()
    }

    /// Whether the registry is empty.
    pub fn is_empty(&self) -> bool {
        self.by_id.is_empty()
    }

    /// Iterate over all items.
    pub fn iter(&self) -> impl Iterator<Item = (ProtoItemId, &item::Item)> {
        self.by_id.iter().map(|(&id, item)| (id, item))
    }
}
