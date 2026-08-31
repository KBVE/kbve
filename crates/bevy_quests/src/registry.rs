use std::collections::HashMap;

use bevy::prelude::*;
use prost::Message;

use crate::proto::quest;

/// Stable numeric identifier for a quest, derived from its ref.
///
/// Used as a lightweight key for cross-system references (quest logs,
/// network packets, save files). The full quest data lives in [`QuestDb`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
pub struct ProtoQuestId(pub u64);

impl ProtoQuestId {
    /// Create an id from a quest ref using a stable hash.
    pub fn from_ref(r: &str) -> Self {
        use std::hash::{Hash, Hasher};
        let mut h = std::collections::hash_map::DefaultHasher::new();
        r.hash(&mut h);
        Self(h.finish())
    }
}

/// Bevy resource holding all proto-defined quest data.
///
/// Loaded once at startup from a proto-encoded `QuestRegistry` binary or
/// built programmatically. Provides fast lookups by [`ProtoQuestId`], ref,
/// ULID, or category.
#[derive(Resource, Default)]
pub struct QuestDb {
    by_id: HashMap<ProtoQuestId, quest::Quest>,
    by_ref: HashMap<String, ProtoQuestId>,
    by_ulid: HashMap<String, ProtoQuestId>,
    display_titles: HashMap<ProtoQuestId, &'static str>,
    chains: Vec<quest::QuestChain>,
}

impl QuestDb {
    /// Build the registry from a decoded proto `QuestRegistry`.
    pub fn from_proto(registry: quest::QuestRegistry) -> Self {
        let mut db = Self::default();
        for quest in registry.quests {
            db.insert(quest);
        }
        db.chains = registry.chains;
        db
    }

    /// Build from a proto-encoded binary (e.g. embedded asset or network payload).
    pub fn from_bytes(bytes: &[u8]) -> Result<Self, prost::DecodeError> {
        let registry = quest::QuestRegistry::decode(bytes)?;
        Ok(Self::from_proto(registry))
    }

    /// Build from the Astro `/api/questdb.json` response.
    ///
    /// This handles the string-enum to i32 conversion and Astro-specific
    /// field mapping automatically.
    pub fn from_json(json_str: &str) -> Result<Self, crate::json::JsonLoadError> {
        let quests = crate::json::parse_questdb_json(json_str)?;
        let mut db = Self::default();
        for quest in quests {
            db.insert(quest);
        }
        Ok(db)
    }

    /// Insert a single quest into the registry.
    pub fn insert(&mut self, quest: quest::Quest) {
        let id = ProtoQuestId::from_ref(&quest.r#ref);
        let title: &'static str = Box::leak(quest.title.clone().into_boxed_str());
        self.display_titles.insert(id, title);
        self.by_ref.insert(quest.r#ref.clone(), id);
        if !quest.id.is_empty() {
            self.by_ulid.insert(quest.id.clone(), id);
        }
        self.by_id.insert(id, quest);
    }

    /// Look up a quest by its [`ProtoQuestId`].
    pub fn get(&self, id: ProtoQuestId) -> Option<&quest::Quest> {
        self.by_id.get(&id)
    }

    /// Look up a quest by its ref (e.g. `"auto-cooker-9000"`).
    pub fn get_by_ref(&self, r: &str) -> Option<&quest::Quest> {
        let id = self.by_ref.get(r)?;
        self.by_id.get(id)
    }

    /// Look up a quest by its ULID string.
    pub fn get_by_ulid(&self, ulid: &str) -> Option<&quest::Quest> {
        let id = self.by_ulid.get(ulid)?;
        self.by_id.get(id)
    }

    /// Resolve a ref to a [`ProtoQuestId`].
    pub fn id_for_ref(&self, r: &str) -> Option<ProtoQuestId> {
        self.by_ref.get(r).copied()
    }

    /// Get the cached display title for a quest.
    pub fn display_title(&self, id: ProtoQuestId) -> &'static str {
        self.display_titles.get(&id).copied().unwrap_or("Unknown")
    }

    /// Find all quests matching a category.
    pub fn find_by_category(&self, category: quest::QuestCategory) -> Vec<&quest::Quest> {
        self.by_id
            .values()
            .filter(|q| q.category == category as i32)
            .collect()
    }

    /// Find all quests that contain a specific tag.
    pub fn find_by_tag(&self, tag: &str) -> Vec<&quest::Quest> {
        self.by_id
            .values()
            .filter(|q| q.tags.iter().any(|t| t == tag))
            .collect()
    }

    /// Find all quests given by a specific NPC.
    pub fn find_by_giver_npc(&self, npc_ref: &str) -> Vec<&quest::Quest> {
        self.by_id
            .values()
            .filter(|q| q.giver_npc_refs.iter().any(|r| r == npc_ref))
            .collect()
    }

    /// Find all quests in a specific zone.
    pub fn find_by_zone(&self, zone_ref: &str) -> Vec<&quest::Quest> {
        self.by_id
            .values()
            .filter(|q| q.zone_refs.iter().any(|r| r == zone_ref))
            .collect()
    }

    /// Get all quest chains.
    pub fn chains(&self) -> &[quest::QuestChain] {
        &self.chains
    }

    /// Total number of quests in the registry.
    pub fn len(&self) -> usize {
        self.by_id.len()
    }

    /// Whether the registry is empty.
    pub fn is_empty(&self) -> bool {
        self.by_id.is_empty()
    }

    /// Iterate over all quests.
    pub fn iter(&self) -> impl Iterator<Item = (ProtoQuestId, &quest::Quest)> {
        self.by_id.iter().map(|(&id, quest)| (id, quest))
    }
}
