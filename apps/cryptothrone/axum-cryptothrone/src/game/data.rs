use std::collections::HashMap;
use std::sync::LazyLock;

use super::models::{DialogueNode, DialogueOption, ItemData, NPCData};

static ITEMS: LazyLock<Vec<ItemData>> = LazyLock::new(|| {
    vec![
        ItemData {
            id: "health_potion".into(),
            name: "Health Potion".into(),
            item_type: "consumable".into(),
            img: "/assets/items/health_potion.png".into(),
            description: "Restores 25 HP.".into(),
            bonuses: HashMap::from([("hp".into(), 25.0)]),
            durability: 1,
            weight: 0.5,
            actions: vec!["use".into(), "drop".into(), "inspect".into()],
        },
        ItemData {
            id: "mana_potion".into(),
            name: "Mana Potion".into(),
            item_type: "consumable".into(),
            img: "/assets/items/mana_potion.png".into(),
            description: "Restores 20 MP.".into(),
            bonuses: HashMap::from([("mp".into(), 20.0)]),
            durability: 1,
            weight: 0.5,
            actions: vec!["use".into(), "drop".into(), "inspect".into()],
        },
        ItemData {
            id: "iron_sword".into(),
            name: "Iron Sword".into(),
            item_type: "weapon".into(),
            img: "/assets/items/iron_sword.png".into(),
            description: "A sturdy iron sword.".into(),
            bonuses: HashMap::from([("attack".into(), 5.0)]),
            durability: 100,
            weight: 3.0,
            actions: vec!["equip".into(), "drop".into(), "inspect".into()],
        },
        ItemData {
            id: "salmon".into(),
            name: "Salmon".into(),
            item_type: "consumable".into(),
            img: "/assets/items/salmon.png".into(),
            description: "A fresh salmon. Restores 10 HP.".into(),
            bonuses: HashMap::from([("hp".into(), 10.0)]),
            durability: 1,
            weight: 1.0,
            actions: vec!["use".into(), "drop".into(), "inspect".into()],
        },
        ItemData {
            id: "blue_shark".into(),
            name: "Blue Shark".into(),
            item_type: "consumable".into(),
            img: "/assets/items/blue_shark.png".into(),
            description: "A rare blue shark. Restores 30 HP.".into(),
            bonuses: HashMap::from([("hp".into(), 30.0)]),
            durability: 1,
            weight: 2.0,
            actions: vec!["use".into(), "drop".into(), "inspect".into()],
        },
    ]
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
