//! # bevy_kbve_inventory
//!
//! Generic inventory plugin for Bevy games. Provides slot-based item storage
//! with automatic stacking, loot events, and a snapshot mechanism for
//! cross-thread state access (e.g. Tauri IPC or WASM bindings).
//!
//! ## Usage
//!
//! Define your item type as an enum implementing the required traits, then
//! register the plugin:
//!
//! ```ignore
//! use bevy_kbve_inventory::{InventoryPlugin, Inventory, LootEvent, ItemKind};
//!
//! #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
//! enum MyItem { Sword, Shield, Potion }
//!
//! impl ItemKind for MyItem {
//!     fn display_name(&self) -> &'static str {
//!         match self {
//!             MyItem::Sword => "Sword",
//!             MyItem::Shield => "Shield",
//!             MyItem::Potion => "Potion",
//!         }
//!     }
//! }
//!
//! // In your app setup:
//! app.add_plugins(InventoryPlugin::<MyItem>::new(16));
//! ```

use std::fmt::Debug;
use std::hash::Hash;
use std::marker::PhantomData;
use std::sync::{LazyLock, Mutex};

use bevy::prelude::*;
use serde::{Deserialize, Serialize};

// ── Item trait ──────────────────────────────────────────────────────────

/// Trait that item types must implement to be used with the inventory system.
pub trait ItemKind:
    Debug
    + Clone
    + Copy
    + PartialEq
    + Eq
    + Hash
    + Send
    + Sync
    + Serialize
    + for<'de> Deserialize<'de>
    + 'static
{
    /// Human-readable name for UI display.
    fn display_name(&self) -> &'static str;

    /// Optional max stack size per slot. Defaults to `u32::MAX` (unlimited).
    fn max_stack(&self) -> u32 {
        u32::MAX
    }
}

// ── Item stack ──────────────────────────────────────────────────────────

/// A single inventory slot holding a quantity of one item kind.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(bound = "K: ItemKind")]
pub struct ItemStack<K: ItemKind> {
    pub kind: K,
    pub quantity: u32,
}

// ── Inventory resource ──────────────────────────────────────────────────

/// Slot-based inventory with automatic stacking.
#[derive(Resource, Debug, Clone, Serialize, Deserialize)]
#[serde(bound = "K: ItemKind")]
pub struct Inventory<K: ItemKind> {
    pub items: Vec<ItemStack<K>>,
    pub max_slots: usize,
}

impl<K: ItemKind> Default for Inventory<K> {
    fn default() -> Self {
        Self {
            items: Vec::new(),
            max_slots: 16,
        }
    }
}

impl<K: ItemKind> Inventory<K> {
    /// Create an inventory with the given slot capacity.
    pub fn new(max_slots: usize) -> Self {
        Self {
            items: Vec::new(),
            max_slots,
        }
    }

    /// Add items, stacking with existing items of the same kind.
    /// Returns the quantity that could not be added (0 if all fit).
    pub fn add(&mut self, kind: K, mut quantity: u32) -> u32 {
        // Try to stack with existing slots first
        for stack in &mut self.items {
            if stack.kind == kind {
                let room = kind.max_stack().saturating_sub(stack.quantity);
                let added = quantity.min(room);
                stack.quantity += added;
                quantity -= added;
                if quantity == 0 {
                    return 0;
                }
            }
        }

        // Fill new slots with remaining quantity
        while quantity > 0 && self.items.len() < self.max_slots {
            let added = quantity.min(kind.max_stack());
            self.items.push(ItemStack {
                kind,
                quantity: added,
            });
            quantity -= added;
        }

        quantity
    }

    /// Remove up to `quantity` of the given item kind. Returns the amount actually removed.
    pub fn remove(&mut self, kind: K, mut quantity: u32) -> u32 {
        let mut removed = 0u32;

        self.items.retain_mut(|stack| {
            if stack.kind != kind || quantity == 0 {
                return true;
            }
            let take = stack.quantity.min(quantity);
            stack.quantity -= take;
            quantity -= take;
            removed += take;
            stack.quantity > 0
        });

        removed
    }

    /// Count total quantity of a given item kind across all slots.
    pub fn count(&self, kind: K) -> u32 {
        self.items
            .iter()
            .filter(|s| s.kind == kind)
            .map(|s| s.quantity)
            .sum()
    }

    /// Check if the inventory has room for at least one more item.
    pub fn has_room(&self) -> bool {
        self.items.len() < self.max_slots
            || self.items.iter().any(|s| s.quantity < s.kind.max_stack())
    }

    /// Number of occupied slots.
    pub fn slot_count(&self) -> usize {
        self.items.len()
    }

    /// Clear all items.
    pub fn clear(&mut self) {
        self.items.clear();
    }
}

// ── Loot event ──────────────────────────────────────────────────────────

/// Fire this event to add items to the inventory.
#[derive(Event, Debug, Clone)]
pub struct LootEvent<K: ItemKind> {
    pub kind: K,
    pub quantity: u32,
}

// ── Snapshot ────────────────────────────────────────────────────────────

/// Thread-safe snapshot of the inventory for reading outside the ECS
/// (e.g. from Tauri commands or WASM JS bindings).
static INVENTORY_SNAPSHOT_RAW: LazyLock<Mutex<Option<String>>> = LazyLock::new(|| Mutex::new(None));

/// Read the latest inventory snapshot as a deserialized value.
pub fn get_inventory_snapshot<K: ItemKind>() -> Option<Inventory<K>> {
    let json = INVENTORY_SNAPSHOT_RAW.lock().ok()?.clone()?;
    serde_json::from_str(&json).ok()
}

/// Read the latest inventory snapshot as a raw JSON string.
pub fn get_inventory_snapshot_json() -> Option<String> {
    INVENTORY_SNAPSHOT_RAW.lock().ok()?.clone()
}

// ── Plugin ──────────────────────────────────────────────────────────────

/// Bevy plugin that registers the inventory resource, loot event observer,
/// and snapshot system for a given item type `K`.
pub struct InventoryPlugin<K: ItemKind> {
    max_slots: usize,
    _marker: PhantomData<K>,
}

impl<K: ItemKind> InventoryPlugin<K> {
    /// Create the plugin with the specified number of inventory slots.
    pub fn new(max_slots: usize) -> Self {
        Self {
            max_slots,
            _marker: PhantomData,
        }
    }
}

impl<K: ItemKind> Plugin for InventoryPlugin<K> {
    fn build(&self, app: &mut App) {
        app.insert_resource(Inventory::<K>::new(self.max_slots));
        app.add_observer(process_loot_events::<K>);
        app.add_systems(Update, snapshot_inventory::<K>);
    }
}

// ── Systems ─────────────────────────────────────────────────────────────

fn process_loot_events<K: ItemKind>(event: On<LootEvent<K>>, mut inventory: ResMut<Inventory<K>>) {
    inventory.add(event.kind, event.quantity);
}

fn snapshot_inventory<K: ItemKind>(inventory: Res<Inventory<K>>) {
    if inventory.is_changed() {
        if let Ok(json) = serde_json::to_string(inventory.as_ref()) {
            if let Ok(mut snap) = INVENTORY_SNAPSHOT_RAW.lock() {
                *snap = Some(json);
            }
        }
    }
}

// ── Tests ───────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
    enum TestItem {
        Wood,
        Stone,
        Gold,
    }

    impl ItemKind for TestItem {
        fn display_name(&self) -> &'static str {
            match self {
                TestItem::Wood => "Wood",
                TestItem::Stone => "Stone",
                TestItem::Gold => "Gold",
            }
        }

        fn max_stack(&self) -> u32 {
            match self {
                TestItem::Gold => 10,
                _ => u32::MAX,
            }
        }
    }

    #[test]
    fn add_and_stack() {
        let mut inv = Inventory::<TestItem>::new(4);
        inv.add(TestItem::Wood, 5);
        inv.add(TestItem::Wood, 3);
        assert_eq!(inv.slot_count(), 1);
        assert_eq!(inv.count(TestItem::Wood), 8);
    }

    #[test]
    fn respects_max_slots() {
        let mut inv = Inventory::<TestItem>::new(2);
        inv.add(TestItem::Wood, 1);
        inv.add(TestItem::Stone, 1);
        let overflow = inv.add(TestItem::Gold, 1);
        assert_eq!(overflow, 1);
        assert_eq!(inv.slot_count(), 2);
    }

    #[test]
    fn respects_max_stack() {
        let mut inv = Inventory::<TestItem>::new(3);
        let overflow = inv.add(TestItem::Gold, 25);
        // 10 + 10 + 5 across 3 slots
        assert_eq!(overflow, 0);
        assert_eq!(inv.slot_count(), 3);
        assert_eq!(inv.count(TestItem::Gold), 25);
    }

    #[test]
    fn remove_items() {
        let mut inv = Inventory::<TestItem>::new(4);
        inv.add(TestItem::Wood, 10);
        let removed = inv.remove(TestItem::Wood, 3);
        assert_eq!(removed, 3);
        assert_eq!(inv.count(TestItem::Wood), 7);
    }

    #[test]
    fn remove_clears_empty_slots() {
        let mut inv = Inventory::<TestItem>::new(4);
        inv.add(TestItem::Wood, 5);
        inv.remove(TestItem::Wood, 5);
        assert_eq!(inv.slot_count(), 0);
    }

    #[test]
    fn has_room() {
        let mut inv = Inventory::<TestItem>::new(1);
        assert!(inv.has_room());
        inv.add(TestItem::Wood, 1);
        assert!(inv.has_room()); // Wood has unlimited stack
    }

    #[test]
    fn serde_roundtrip() {
        let mut inv = Inventory::<TestItem>::new(4);
        inv.add(TestItem::Wood, 5);
        inv.add(TestItem::Stone, 3);
        let json = serde_json::to_string(&inv).unwrap();
        let restored: Inventory<TestItem> = serde_json::from_str(&json).unwrap();
        assert_eq!(restored.count(TestItem::Wood), 5);
        assert_eq!(restored.count(TestItem::Stone), 3);
        assert_eq!(restored.max_slots, 4);
    }
}
