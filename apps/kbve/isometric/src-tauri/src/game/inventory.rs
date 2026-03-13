use serde::{Deserialize, Serialize};

use super::scene_objects::{FlowerArchetype, MushroomKind, RockKind};

// Re-export bevy_inventory types that the rest of the game uses.
pub use bevy_inventory::{
    Inventory, InventoryFullEvent, InventoryPlugin, ItemStack, LootEvent,
    get_inventory_snapshot_json,
};

// ── Item definitions ────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ItemKind {
    Log,
    Stone,
    MossyStone,
    CopperOre,
    IronOre,
    CrystalOre,
    // Flowers
    Tulip,
    Daisy,
    Lavender,
    Bellflower,
    Wildflower,
    Sunflower,
    Rose,
    Cornflower,
    Allium,
    BlueOrchid,
    // Mushrooms
    Porcini,
    Chanterelle,
    FlyAgaric,
}

impl bevy_inventory::ItemKind for ItemKind {
    fn display_name(&self) -> &'static str {
        match self {
            ItemKind::Log => "Log",
            ItemKind::Stone => "Stone",
            ItemKind::MossyStone => "Mossy Stone",
            ItemKind::CopperOre => "Copper Ore",
            ItemKind::IronOre => "Iron Ore",
            ItemKind::CrystalOre => "Crystal Ore",
            ItemKind::Tulip => "Tulip",
            ItemKind::Daisy => "Daisy",
            ItemKind::Lavender => "Lavender",
            ItemKind::Bellflower => "Bellflower",
            ItemKind::Wildflower => "Wildflower",
            ItemKind::Sunflower => "Sunflower",
            ItemKind::Rose => "Rose",
            ItemKind::Cornflower => "Cornflower",
            ItemKind::Allium => "Allium",
            ItemKind::BlueOrchid => "Blue Orchid",
            ItemKind::Porcini => "Porcini",
            ItemKind::Chanterelle => "Chanterelle",
            ItemKind::FlyAgaric => "Fly Agaric",
        }
    }

    fn max_stack(&self) -> u32 {
        match self {
            // Resources stack higher
            ItemKind::Log | ItemKind::Stone | ItemKind::MossyStone => 64,
            ItemKind::CopperOre | ItemKind::IronOre => 32,
            ItemKind::CrystalOre => 16,
            // Flowers and mushrooms stack moderately
            _ => 32,
        }
    }
}

impl ItemKind {
    pub fn from_rock_kind(kind: &RockKind) -> Self {
        match kind {
            RockKind::Boulder => ItemKind::Stone,
            RockKind::MossyRock => ItemKind::MossyStone,
            RockKind::OreCopper => ItemKind::CopperOre,
            RockKind::OreIron => ItemKind::IronOre,
            RockKind::OreCrystal => ItemKind::CrystalOre,
        }
    }

    pub fn from_flower_archetype(arch: &FlowerArchetype) -> Self {
        match arch {
            FlowerArchetype::Tulip => ItemKind::Tulip,
            FlowerArchetype::Daisy => ItemKind::Daisy,
            FlowerArchetype::Lavender => ItemKind::Lavender,
            FlowerArchetype::Bell => ItemKind::Bellflower,
            FlowerArchetype::Wildflower => ItemKind::Wildflower,
            FlowerArchetype::Sunflower => ItemKind::Sunflower,
            FlowerArchetype::Rose => ItemKind::Rose,
            FlowerArchetype::Cornflower => ItemKind::Cornflower,
            FlowerArchetype::Allium => ItemKind::Allium,
            FlowerArchetype::BlueOrchid => ItemKind::BlueOrchid,
        }
    }

    pub fn from_mushroom_kind(kind: &MushroomKind) -> Self {
        match kind {
            MushroomKind::Porcini => ItemKind::Porcini,
            MushroomKind::Chanterelle => ItemKind::Chanterelle,
            MushroomKind::FlyAgaric => ItemKind::FlyAgaric,
        }
    }
}
