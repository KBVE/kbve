use bevy::prelude::*;
use serde::{Deserialize, Serialize};

use super::scene_objects::{FlowerArchetype, MushroomKind, RockKind};

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

impl ItemKind {
    pub fn display_name(&self) -> &'static str {
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

// ── Inventory resource ──────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ItemStack {
    pub kind: ItemKind,
    pub quantity: u32,
}

#[derive(Resource, Debug, Clone, Default, Serialize, Deserialize)]
pub struct Inventory {
    pub items: Vec<ItemStack>,
    pub max_slots: usize,
}

impl Inventory {
    pub fn new(max_slots: usize) -> Self {
        Self {
            items: Vec::new(),
            max_slots,
        }
    }

    /// Add items to the inventory. Stacks with existing items of the same kind.
    pub fn add(&mut self, kind: ItemKind, quantity: u32) {
        for stack in &mut self.items {
            if stack.kind == kind {
                stack.quantity += quantity;
                return;
            }
        }
        // New item — only add if we have room
        if self.items.len() < self.max_slots {
            self.items.push(ItemStack { kind, quantity });
        }
    }
}

// ── Loot event ──────────────────────────────────────────────────────────

#[derive(Event, Debug, Clone)]
pub struct LootEvent {
    pub kind: ItemKind,
    pub quantity: u32,
}

// ── Snapshot (same pattern as PlayerState) ───────────────────────────────

#[cfg(not(target_arch = "wasm32"))]
use std::sync::{LazyLock, Mutex};

#[cfg(not(target_arch = "wasm32"))]
static INVENTORY_SNAPSHOT: LazyLock<Mutex<Option<Inventory>>> = LazyLock::new(|| Mutex::new(None));

#[cfg(target_arch = "wasm32")]
use std::cell::RefCell;

#[cfg(target_arch = "wasm32")]
thread_local! {
    static INVENTORY_SNAPSHOT_WASM: RefCell<Option<Inventory>> = const { RefCell::new(None) };
}

pub fn get_inventory_snapshot() -> Option<Inventory> {
    #[cfg(not(target_arch = "wasm32"))]
    {
        INVENTORY_SNAPSHOT.lock().unwrap().clone()
    }
    #[cfg(target_arch = "wasm32")]
    {
        INVENTORY_SNAPSHOT_WASM.with(|cell| cell.borrow().clone())
    }
}

// ── Plugin ──────────────────────────────────────────────────────────────

pub struct InventoryPlugin;

impl Plugin for InventoryPlugin {
    fn build(&self, app: &mut App) {
        app.insert_resource(Inventory::new(16));
        app.add_observer(process_loot_events);
        app.add_systems(Update, snapshot_inventory);
    }
}

// ── Systems ─────────────────────────────────────────────────────────────

fn process_loot_events(event: On<LootEvent>, mut inventory: ResMut<Inventory>) {
    inventory.add(event.kind, event.quantity);
}

fn snapshot_inventory(inventory: Res<Inventory>) {
    if inventory.is_changed() {
        #[cfg(not(target_arch = "wasm32"))]
        {
            *INVENTORY_SNAPSHOT.lock().unwrap() = Some(inventory.clone());
        }
        #[cfg(target_arch = "wasm32")]
        {
            INVENTORY_SNAPSHOT_WASM.with(|cell| {
                *cell.borrow_mut() = Some(inventory.clone());
            });
        }
    }
}
