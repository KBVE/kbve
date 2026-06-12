use std::collections::HashMap;

use bevy::prelude::Resource;
use serde::Deserialize;

use crate::proto::{KIND_CAT_ITEM, KIND_CAT_NPC, KIND_CAT_PLAYER, KindEntry};

#[derive(Debug, Clone, Deserialize)]
pub struct NpcDb {
    #[serde(default)]
    pub npcs: Vec<NpcDef>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NpcDef {
    #[serde(rename = "ref")]
    pub ref_id: String,
    pub name: String,
    #[serde(default)]
    pub stats: NpcStats,
    #[serde(default)]
    pub equipment: Option<NpcEquipment>,
    #[serde(default)]
    pub faction: Option<NpcFaction>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NpcFaction {
    #[serde(default)]
    pub faction_id: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NpcStats {
    #[serde(default)]
    pub hp: i32,
    #[serde(default)]
    pub max_hp: i32,
    #[serde(default)]
    pub attack: i32,
    #[serde(default)]
    pub defense: i32,
    #[serde(default)]
    pub speed: i32,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct NpcEquipment {
    #[serde(default)]
    pub equipped: Vec<NpcEquipSlot>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NpcEquipSlot {
    #[serde(default)]
    pub item_ref: String,
}

impl NpcDef {
    pub fn is_hostile(&self) -> bool {
        self.faction
            .as_ref()
            .is_some_and(|f| f.faction_id == "hostile")
    }
}

impl NpcDb {
    pub fn from_json(bytes: &[u8]) -> Result<Self, serde_json::Error> {
        serde_json::from_slice(bytes)
    }

    pub fn get(&self, ref_id: &str) -> Option<&NpcDef> {
        self.npcs.iter().find(|n| n.ref_id == ref_id)
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct ItemDb {
    #[serde(default)]
    pub items: Vec<ItemDef>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemDef {
    #[serde(rename = "ref")]
    pub ref_id: String,
    pub name: String,
    #[serde(default)]
    pub stackable: bool,
    #[serde(default)]
    pub consumable: bool,
}

impl ItemDb {
    pub fn from_json(bytes: &[u8]) -> Result<Self, serde_json::Error> {
        serde_json::from_slice(bytes)
    }

    pub fn get(&self, ref_id: &str) -> Option<&ItemDef> {
        self.items.iter().find(|i| i.ref_id == ref_id)
    }
}

#[derive(Resource, Debug, Clone, Default)]
pub struct KindRegistry {
    entries: Vec<KindEntry>,
    by_ref: HashMap<String, u16>,
}

impl KindRegistry {
    pub fn new() -> Self {
        let mut reg = Self::default();
        reg.insert("player", KIND_CAT_PLAYER);
        reg
    }

    fn insert(&mut self, ref_id: &str, cat: u8) -> u16 {
        if let Some(kind) = self.by_ref.get(ref_id) {
            return *kind;
        }
        let kind = self.entries.len() as u16;
        self.entries.push(KindEntry {
            kind,
            ref_id: ref_id.to_string(),
            cat,
        });
        self.by_ref.insert(ref_id.to_string(), kind);
        kind
    }

    pub fn register_npc(&mut self, ref_id: &str) -> u16 {
        self.insert(ref_id, KIND_CAT_NPC)
    }

    pub fn register_item(&mut self, ref_id: &str) -> u16 {
        self.insert(ref_id, KIND_CAT_ITEM)
    }

    pub fn kind_of(&self, ref_id: &str) -> Option<u16> {
        self.by_ref.get(ref_id).copied()
    }

    pub fn ref_of(&self, kind: u16) -> Option<&str> {
        self.entries.get(kind as usize).map(|e| e.ref_id.as_str())
    }

    pub fn entries(&self) -> Vec<KindEntry> {
        self.entries.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn npcdb_parses_minimal() {
        let json = r#"{"npcs":[{"ref":"cleric","name":"Cleric",
            "stats":{"hp":40,"maxHp":40,"attack":3,"speed":4},
            "equipment":{"equipped":[{"slot":"EQUIP_SLOT_CHEST","itemRef":"robe"}]}}]}"#;
        let db = NpcDb::from_json(json.as_bytes()).expect("parse");
        let npc = db.get("cleric").expect("cleric");
        assert_eq!(npc.name, "Cleric");
        assert_eq!(npc.stats.max_hp, 40);
        assert_eq!(npc.equipment.as_ref().unwrap().equipped[0].item_ref, "robe");
    }

    #[test]
    fn itemdb_parses_minimal() {
        let json = r#"{"items":[{"ref":"potion","name":"Potion","stackable":true,
            "consumable":true,"weight":0.5,"unknown_field":1}]}"#;
        let db = ItemDb::from_json(json.as_bytes()).expect("parse");
        let item = db.get("potion").expect("potion");
        assert!(item.stackable);
    }

    #[test]
    fn registry_assigns_stable_kinds() {
        let mut reg = KindRegistry::new();
        let cleric = reg.register_npc("cleric");
        let bat = reg.register_npc("crystal-bat");
        let potion = reg.register_item("potion");
        assert_eq!(reg.kind_of("player"), Some(0));
        assert_eq!((cleric, bat, potion), (1, 2, 3));
        assert_eq!(reg.register_npc("cleric"), 1);
        assert_eq!(reg.ref_of(3), Some("potion"));
        assert_eq!(reg.entries().len(), 4);
    }
}
