use std::collections::HashMap;
use std::sync::LazyLock;

use serde::Deserialize;

use super::models::{DialogueNode, DialogueOption, ItemData, NPCData};

/// Canonical itemdb pool, generated from MDX by `astro-kbve:sync:itemdb`.
/// Embedded at compile time so the API serves the real catalogue, not a stub.
const ITEMDB_JSON: &str =
    include_str!("../../../../../packages/data/codegen/generated/itemdb-data.json");

const FLAG_WEAPON: u32 = 1;
const FLAG_ARMOR: u32 = 1 << 1;
const FLAG_FOOD: u32 = 1 << 3;
const FLAG_DRINK: u32 = 1 << 4;
const FLAG_POTION: u32 = 1 << 5;
const FLAG_QUEST: u32 = 1 << 12;
const FLAG_CONSUMABLE: u32 = FLAG_FOOD | FLAG_DRINK | FLAG_POTION;

#[derive(Deserialize)]
struct RawItemdb {
    items: Vec<RawItem>,
}

#[derive(Deserialize)]
struct RawItem {
    #[serde(rename = "ref")]
    reference: String,
    name: String,
    #[serde(default)]
    description: String,
    #[serde(rename = "typeFlags", default)]
    type_flags: u32,
    #[serde(default)]
    weight: Option<f64>,
    #[serde(default)]
    durability: Option<u32>,
    #[serde(default)]
    img: Option<String>,
    #[serde(default)]
    bonuses: HashMap<String, serde_json::Value>,
}

fn resolve_type(flags: u32) -> &'static str {
    if flags & FLAG_WEAPON != 0 {
        "weapon"
    } else if flags & FLAG_ARMOR != 0 {
        "armor"
    } else if flags & FLAG_CONSUMABLE != 0 {
        "consumable"
    } else if flags & FLAG_QUEST != 0 {
        "quest"
    } else {
        "material"
    }
}

fn resolve_actions(item_type: &str) -> Vec<String> {
    let raw = match item_type {
        "consumable" => ["use", "drop", "inspect"].as_slice(),
        "weapon" | "armor" => ["equip", "drop", "inspect"].as_slice(),
        _ => ["drop", "inspect"].as_slice(),
    };
    raw.iter().map(|s| s.to_string()).collect()
}

fn alias_bonus(key: &str) -> &str {
    match key {
        "health" => "hp",
        "mana" => "mp",
        "energy" => "ep",
        other => other,
    }
}

fn adapt(raw: RawItem) -> ItemData {
    let item_type = resolve_type(raw.type_flags).to_string();
    let durability = raw
        .durability
        .unwrap_or(if item_type == "consumable" { 1 } else { 100 });
    let bonuses = raw
        .bonuses
        .into_iter()
        .filter_map(|(k, v)| v.as_f64().map(|n| (alias_bonus(&k).to_string(), n)))
        .collect();
    let img = raw
        .img
        .unwrap_or_else(|| format!("/assets/items/{}.png", raw.reference));
    ItemData {
        actions: resolve_actions(&item_type),
        id: raw.reference,
        name: raw.name,
        item_type,
        img,
        description: raw.description.trim().to_string(),
        bonuses,
        durability,
        weight: raw.weight.unwrap_or(1.0),
    }
}

static ITEMS: LazyLock<Vec<ItemData>> = LazyLock::new(|| {
    let parsed: RawItemdb =
        serde_json::from_str(ITEMDB_JSON).expect("embedded itemdb-data.json is valid");
    parsed.items.into_iter().map(adapt).collect()
});

static NPCS: LazyLock<Vec<NPCData>> = LazyLock::new(|| {
    vec![
        NPCData {
            id: "npc_barkeep".into(),
            name: "Evee The BarKeep".into(),
            avatar: "/assets/npc/barkeep.webp".into(),
            slug: "npc/barkeep".into(),
            actions: vec!["talk".into(), "trade".into(), "steal".into()],
        },
        NPCData {
            id: "npc_monk".into(),
            name: "Elder Monk".into(),
            avatar: "/assets/entity/monks.png".into(),
            slug: "npc/monk".into(),
            actions: vec!["talk".into(), "inspect".into()],
        },
    ]
});

static DIALOGUES: LazyLock<HashMap<String, DialogueNode>> = LazyLock::new(|| {
    HashMap::from([
        (
            "dlg_barkeep_greeting".into(),
            DialogueNode {
                id: "dlg_barkeep_greeting".into(),
                title: "Greeting".into(),
                message: "Welcome to the tavern, traveler! What can I get you today?".into(),
                player_response: None,
                background_image: Some("/assets/background/animebar.webp".into()),
                options: Some(vec![
                    DialogueOption {
                        id: "opt_about".into(),
                        title: "Tell me about Cloud City".into(),
                        next_dialogue_id: "dlg_barkeep_about".into(),
                    },
                    DialogueOption {
                        id: "opt_trade".into(),
                        title: "What do you have for sale?".into(),
                        next_dialogue_id: "dlg_barkeep_trade".into(),
                    },
                ]),
            },
        ),
        (
            "dlg_barkeep_about".into(),
            DialogueNode {
                id: "dlg_barkeep_about".into(),
                title: "About Cloud City".into(),
                message: "Cloud City floats above the old kingdoms. Beware the birds — they are not what they seem. The tombstone near the plaza holds secrets of Samson the Great.".into(),
                player_response: Some("Tell me about Cloud City.".into()),
                background_image: Some("/assets/background/animebar.webp".into()),
                options: Some(vec![DialogueOption {
                    id: "opt_back".into(),
                    title: "Thanks for the info".into(),
                    next_dialogue_id: "dlg_barkeep_greeting".into(),
                }]),
            },
        ),
        (
            "dlg_barkeep_trade".into(),
            DialogueNode {
                id: "dlg_barkeep_trade".into(),
                title: "Trade".into(),
                message: "I've got potions, fresh fish, and the occasional rare item. Check back often — my stock changes with the tides.".into(),
                player_response: Some("What do you have for sale?".into()),
                background_image: Some("/assets/background/animebar.webp".into()),
                options: Some(vec![DialogueOption {
                    id: "opt_back2".into(),
                    title: "I'll think about it".into(),
                    next_dialogue_id: "dlg_barkeep_greeting".into(),
                }]),
            },
        ),
        (
            "dlg_monk_greeting".into(),
            DialogueNode {
                id: "dlg_monk_greeting".into(),
                title: "Meditation".into(),
                message: "Peace, traveler. The path to the throne is long. Patience and wisdom will serve you well.".into(),
                player_response: None,
                background_image: None,
                options: None,
            },
        ),
    ])
});

pub fn all_items() -> &'static [ItemData] {
    &ITEMS
}

pub fn item_by_id(id: &str) -> Option<&'static ItemData> {
    ITEMS.iter().find(|item| item.id == id)
}

pub fn all_npcs() -> &'static [NPCData] {
    &NPCS
}

pub fn npc_by_id(id: &str) -> Option<&'static NPCData> {
    NPCS.iter().find(|npc| npc.id == id)
}

pub fn dialogue_by_id(id: &str) -> Option<&'static DialogueNode> {
    DIALOGUES.get(id)
}
