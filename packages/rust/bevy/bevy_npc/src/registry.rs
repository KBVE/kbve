use bevy::prelude::*;
use std::collections::HashMap;

use crate::types::NpcDef;

/// Bevy resource holding all loaded NPC definitions.
/// Provides O(1) lookup by ULID or slug.
#[derive(Resource, Default)]
pub struct NpcRegistry {
    by_id: HashMap<String, NpcDef>,
    by_slug: HashMap<String, String>, // slug → id
}

impl NpcRegistry {
    /// Insert an NPC definition into the registry.
    pub fn insert(&mut self, npc: NpcDef) {
        self.by_slug.insert(npc.slug.clone(), npc.id.clone());
        self.by_id.insert(npc.id.clone(), npc);
    }

    /// Look up an NPC by its ULID.
    pub fn get_by_id(&self, id: &str) -> Option<&NpcDef> {
        self.by_id.get(id)
    }

    /// Look up an NPC by its slug.
    pub fn get_by_slug(&self, slug: &str) -> Option<&NpcDef> {
        let id = self.by_slug.get(slug)?;
        self.by_id.get(id)
    }

    /// Remove an NPC by its ULID. Returns the removed definition if it existed.
    pub fn remove(&mut self, id: &str) -> Option<NpcDef> {
        if let Some(npc) = self.by_id.remove(id) {
            self.by_slug.remove(&npc.slug);
            Some(npc)
        } else {
            None
        }
    }

    /// Returns the number of registered NPCs.
    pub fn len(&self) -> usize {
        self.by_id.len()
    }

    /// Returns `true` if the registry is empty.
    pub fn is_empty(&self) -> bool {
        self.by_id.is_empty()
    }

    /// Iterate over all NPC definitions.
    pub fn iter(&self) -> impl Iterator<Item = &NpcDef> {
        self.by_id.values()
    }

    /// Load a batch of NPC definitions, replacing any existing entries with the same id.
    pub fn load_batch(&mut self, npcs: impl IntoIterator<Item = NpcDef>) {
        for npc in npcs {
            self.insert(npc);
        }
    }

    /// Load NPC definitions from a JSON string.
    /// Expects either a single `NpcDef` or an array of `NpcDef`.
    #[cfg(feature = "serde")]
    pub fn load_json(&mut self, json: &str) -> Result<usize, serde_json::Error> {
        // Try array first, then single
        if let Ok(npcs) = serde_json::from_str::<Vec<NpcDef>>(json) {
            let count = npcs.len();
            self.load_batch(npcs);
            Ok(count)
        } else {
            let npc: NpcDef = serde_json::from_str(json)?;
            self.insert(npc);
            Ok(1)
        }
    }
}
