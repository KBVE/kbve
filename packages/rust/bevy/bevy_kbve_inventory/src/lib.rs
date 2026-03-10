//! # bevy_inventory
//!
//! A generic, slot-based inventory plugin for [Bevy](https://bevyengine.org/) games.
//!
//! ## Features
//!
//! - **Generic item types** — bring your own `enum` implementing [`ItemKind`].
//! - **Automatic stacking** — items stack up to [`ItemKind::max_stack`] per slot.
//! - **Slot capacity** — configurable maximum number of slots via [`InventoryPlugin::new`].
//! - **Loot events** — trigger [`LootEvent`] to add items; the plugin handles stacking
//!   and fires [`InventoryFullEvent`] on overflow.
//! - **Slot operations** — [`Inventory::swap_slots`], [`Inventory::remove_at_slot`],
//!   and [`Inventory::get_slot`] for drag-and-drop UI integration.
//! - **Capacity queries** — [`Inventory::has_room_for`] checks whether a specific
//!   quantity of an item can fit, accounting for both partial stacks and empty slots.
//! - **Thread-safe snapshots** — read the latest inventory state from outside the ECS
//!   (Tauri IPC, WASM JS bindings) via [`get_inventory_snapshot`] or
//!   [`get_inventory_snapshot_json`].
//! - **Serde support** — [`Inventory`] and [`ItemStack`] derive `Serialize`/`Deserialize`
//!   for save files, network sync, or any other serialization need.
//! - **WASM-compatible** — snapshot store uses `thread_local!` on `wasm32` targets and
//!   `Mutex` on native targets.
//!
//! ## Quick start
//!
//! ```rust
//! use bevy::prelude::*;
//! use bevy_inventory::{InventoryPlugin, Inventory, LootEvent, ItemKind};
//!
//! #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
//! enum MyItem { Sword, Shield, Potion }
//!
//! impl ItemKind for MyItem {
//!     fn display_name(&self) -> &'static str {
//!         match self {
//!             MyItem::Sword  => "Sword",
//!             MyItem::Shield => "Shield",
//!             MyItem::Potion => "Potion",
//!         }
//!     }
//!
//!     fn max_stack(&self) -> u32 {
//!         match self {
//!             MyItem::Potion => 16,
//!             _ => 1,
//!         }
//!     }
//! }
//!
//! fn setup(mut commands: Commands) {
//!     // Trigger a loot event to add items
//!     commands.trigger(LootEvent { kind: MyItem::Potion, quantity: 3 });
//! }
//!
//! // In your app:
//! // app.add_plugins(InventoryPlugin::<MyItem>::new(16));
//! // app.add_systems(Startup, setup);
//! ```
//!
//! ## Architecture
//!
//! The plugin registers:
//!
//! | Component | Description |
//! |-----------|-------------|
//! | [`Inventory<K>`] resource | Holds item slots, inserted at startup |
//! | [`LootEvent<K>`] observer | Processes incoming loot and stacks items |
//! | [`InventoryFullEvent<K>`] | Triggered when a loot event overflows |
//! | Snapshot system | Serialises the inventory to a global store each frame it changes |

use std::fmt::Debug;
use std::hash::Hash;
use std::marker::PhantomData;

use bevy::prelude::*;
use serde::{Deserialize, Serialize};

// ── Item trait ──────────────────────────────────────────────────────────

/// Trait that item types must implement to be used with the inventory system.
///
/// Implementors are typically an `enum` of all item kinds in a game.
/// The trait requires `Serialize + Deserialize` so the inventory can be
/// serialised for snapshots, save files, and network sync.
///
/// # Example
///
/// ```rust
/// use bevy_inventory::ItemKind;
///
/// #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
/// enum Gem { Ruby, Sapphire, Emerald }
///
/// impl ItemKind for Gem {
///     fn display_name(&self) -> &'static str {
///         match self {
///             Gem::Ruby     => "Ruby",
///             Gem::Sapphire => "Sapphire",
///             Gem::Emerald  => "Emerald",
///         }
///     }
///
///     fn max_stack(&self) -> u32 { 64 }
/// }
/// ```
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

    /// Maximum number of this item that can occupy a single slot.
    ///
    /// Defaults to `u32::MAX` (effectively unlimited stacking).
    /// Override this to enforce per-item stack limits (e.g. 16 for potions,
    /// 1 for unique equipment).
    fn max_stack(&self) -> u32 {
        u32::MAX
    }
}

// ── Item stack ──────────────────────────────────────────────────────────

/// A single inventory slot holding a quantity of one item kind.
///
/// Stacks are created automatically by [`Inventory::add`] and are never
/// empty — a slot with `quantity == 0` is removed from the inventory.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(bound = "K: ItemKind")]
pub struct ItemStack<K: ItemKind> {
    /// The item kind stored in this slot.
    pub kind: K,
    /// How many of this item are in the slot (always `>= 1`).
    pub quantity: u32,
}

// ── Inventory resource ──────────────────────────────────────────────────

/// Slot-based inventory with automatic stacking.
///
/// Registered as a Bevy [`Resource`] by [`InventoryPlugin`]. Items are stored
/// as a `Vec` of [`ItemStack`]s, where each entry represents one occupied slot.
/// Empty slots are implicit — any index `>= items.len()` up to `max_slots` is
/// available for new items.
///
/// # Stacking behaviour
///
/// When adding items via [`Inventory::add`], the inventory first tries to fill
/// existing stacks of the same kind (up to [`ItemKind::max_stack`]), then
/// allocates new slots for the remainder. Any quantity that cannot fit is
/// returned as overflow.
///
/// # Serialisation
///
/// The inventory implements `Serialize`/`Deserialize` and can be round-tripped
/// through JSON (or any serde-compatible format) for save files or network sync.
#[derive(Resource, Debug, Clone, Serialize, Deserialize)]
#[serde(bound = "K: ItemKind")]
pub struct Inventory<K: ItemKind> {
    /// The occupied slots. Length is always `<= max_slots`.
    pub items: Vec<ItemStack<K>>,
    /// Maximum number of slots this inventory can hold.
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
    ///
    /// # Arguments
    ///
    /// * `max_slots` — The maximum number of distinct item stacks the
    ///   inventory can hold simultaneously.
    pub fn new(max_slots: usize) -> Self {
        Self {
            items: Vec::new(),
            max_slots,
        }
    }

    /// Add items, stacking with existing items of the same kind.
    ///
    /// Returns the quantity that could **not** be added (`0` if everything fit).
    /// Items are first packed into existing stacks up to [`ItemKind::max_stack`],
    /// then placed into new slots.
    ///
    /// # Example
    ///
    /// ```rust
    /// # use bevy_inventory::{Inventory, ItemKind};
    /// # #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
    /// # enum Item { Coin }
    /// # impl ItemKind for Item {
    /// #     fn display_name(&self) -> &'static str { "Coin" }
    /// #     fn max_stack(&self) -> u32 { 100 }
    /// # }
    /// let mut inv = Inventory::<Item>::new(4);
    /// let overflow = inv.add(Item::Coin, 50);
    /// assert_eq!(overflow, 0);
    /// assert_eq!(inv.count(Item::Coin), 50);
    /// ```
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

    /// Remove up to `quantity` of the given item kind.
    ///
    /// Returns the amount **actually removed**. Slots that reach zero are
    /// automatically pruned from the inventory.
    ///
    /// # Example
    ///
    /// ```rust
    /// # use bevy_inventory::{Inventory, ItemKind};
    /// # #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
    /// # enum Item { Coin }
    /// # impl ItemKind for Item {
    /// #     fn display_name(&self) -> &'static str { "Coin" }
    /// # }
    /// let mut inv = Inventory::<Item>::new(4);
    /// inv.add(Item::Coin, 10);
    /// let removed = inv.remove(Item::Coin, 7);
    /// assert_eq!(removed, 7);
    /// assert_eq!(inv.count(Item::Coin), 3);
    /// ```
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

    /// Remove all items from a specific slot index.
    ///
    /// Returns the removed [`ItemStack`], or `None` if the index is out of
    /// bounds. Subsequent slots shift down to fill the gap.
    pub fn remove_at_slot(&mut self, index: usize) -> Option<ItemStack<K>> {
        if index < self.items.len() {
            Some(self.items.remove(index))
        } else {
            None
        }
    }

    /// Count total quantity of a given item kind across all slots.
    pub fn count(&self, kind: K) -> u32 {
        self.items
            .iter()
            .filter(|s| s.kind == kind)
            .map(|s| s.quantity)
            .sum()
    }

    /// Check whether the inventory contains at least one of the given item kind.
    pub fn contains(&self, kind: K) -> bool {
        self.items.iter().any(|s| s.kind == kind)
    }

    /// Check if the inventory has room for at least one more item of any kind.
    ///
    /// Returns `true` if there is an empty slot **or** any existing stack has
    /// room below its [`ItemKind::max_stack`].
    pub fn has_room(&self) -> bool {
        self.items.len() < self.max_slots
            || self.items.iter().any(|s| s.quantity < s.kind.max_stack())
    }

    /// Check if the inventory can fit a specific quantity of a given item kind.
    ///
    /// This accounts for both partial stacks of the same kind and empty slots.
    /// Useful for pre-checking before a craft or trade to avoid silent overflow.
    ///
    /// # Example
    ///
    /// ```rust
    /// # use bevy_inventory::{Inventory, ItemKind};
    /// # #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
    /// # enum Item { Gem }
    /// # impl ItemKind for Item {
    /// #     fn display_name(&self) -> &'static str { "Gem" }
    /// #     fn max_stack(&self) -> u32 { 10 }
    /// # }
    /// let mut inv = Inventory::<Item>::new(2);
    /// inv.add(Item::Gem, 7); // slot 0: 7/10
    /// assert!(inv.has_room_for(Item::Gem, 13));  // 3 in slot 0 + 10 in slot 1
    /// assert!(!inv.has_room_for(Item::Gem, 14)); // would need 14, only 13 fits
    /// ```
    pub fn has_room_for(&self, kind: K, mut quantity: u32) -> bool {
        // Check space in existing matching stacks
        for stack in &self.items {
            if stack.kind == kind {
                let room = kind.max_stack().saturating_sub(stack.quantity);
                quantity = quantity.saturating_sub(room);
                if quantity == 0 {
                    return true;
                }
            }
        }

        // Check empty slot capacity
        let empty_slots = self.max_slots.saturating_sub(self.items.len());
        let fits_in_new = (empty_slots as u64) * (kind.max_stack() as u64);
        (quantity as u64) <= fits_in_new
    }

    /// Number of occupied slots.
    pub fn slot_count(&self) -> usize {
        self.items.len()
    }

    /// Read a specific slot by index.
    ///
    /// Returns `None` if the index is out of bounds.
    pub fn get_slot(&self, index: usize) -> Option<&ItemStack<K>> {
        self.items.get(index)
    }

    /// Swap the contents of two slots.
    ///
    /// Returns `false` if either index is out of bounds. Swapping a slot
    /// with itself is a no-op that returns `true`.
    pub fn swap_slots(&mut self, a: usize, b: usize) -> bool {
        if a == b {
            return a < self.items.len();
        }
        if a >= self.items.len() || b >= self.items.len() {
            return false;
        }
        self.items.swap(a, b);
        true
    }

    /// Iterate over all occupied slots.
    ///
    /// # Example
    ///
    /// ```rust
    /// # use bevy_inventory::{Inventory, ItemKind};
    /// # #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
    /// # enum Item { Coin, Gem }
    /// # impl ItemKind for Item {
    /// #     fn display_name(&self) -> &'static str { "item" }
    /// # }
    /// let mut inv = Inventory::<Item>::new(8);
    /// inv.add(Item::Coin, 5);
    /// inv.add(Item::Gem, 3);
    /// for slot in inv.iter() {
    ///     println!("{}: {}", slot.kind.display_name(), slot.quantity);
    /// }
    /// ```
    pub fn iter(&self) -> impl Iterator<Item = &ItemStack<K>> {
        self.items.iter()
    }

    /// Find the first slot index containing the given item kind.
    ///
    /// Returns `None` if the item is not in the inventory.
    pub fn find_slot(&self, kind: K) -> Option<usize> {
        self.items.iter().position(|s| s.kind == kind)
    }

    /// Check whether the inventory has no items.
    pub fn is_empty(&self) -> bool {
        self.items.is_empty()
    }

    /// Check whether every slot is occupied **and** every stack is at max capacity.
    pub fn is_full(&self) -> bool {
        self.items.len() >= self.max_slots
            && self.items.iter().all(|s| s.quantity >= s.kind.max_stack())
    }

    /// Total number of individual items across all slots.
    pub fn total_item_count(&self) -> u64 {
        self.items.iter().map(|s| s.quantity as u64).sum()
    }

    /// Collect all distinct item kinds currently in the inventory.
    pub fn unique_kinds(&self) -> Vec<K> {
        let mut seen = Vec::new();
        for stack in &self.items {
            if !seen.contains(&stack.kind) {
                seen.push(stack.kind);
            }
        }
        seen
    }

    /// Split a stack at `index`, moving `quantity` items into a new slot.
    ///
    /// Returns `true` if the split succeeded. Fails if:
    /// - `index` is out of bounds
    /// - `quantity` is zero or exceeds the stack's current quantity
    /// - There are no empty slots for the new stack
    ///
    /// # Example
    ///
    /// ```rust
    /// # use bevy_inventory::{Inventory, ItemKind};
    /// # #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
    /// # enum Item { Coin }
    /// # impl ItemKind for Item {
    /// #     fn display_name(&self) -> &'static str { "Coin" }
    /// # }
    /// let mut inv = Inventory::<Item>::new(4);
    /// inv.add(Item::Coin, 10);
    /// assert!(inv.split_stack(0, 4));
    /// assert_eq!(inv.get_slot(0).unwrap().quantity, 6);
    /// assert_eq!(inv.get_slot(1).unwrap().quantity, 4);
    /// ```
    pub fn split_stack(&mut self, index: usize, quantity: u32) -> bool {
        if index >= self.items.len() || quantity == 0 || self.items.len() >= self.max_slots {
            return false;
        }
        let stack = &self.items[index];
        if quantity >= stack.quantity {
            return false;
        }
        let kind = stack.kind;
        self.items[index].quantity -= quantity;
        self.items.push(ItemStack { kind, quantity });
        true
    }

    /// Merge the stack at `from` into the stack at `to`.
    ///
    /// Both slots must contain the same item kind. Items are moved up to
    /// [`ItemKind::max_stack`]; any remainder stays in the `from` slot.
    /// If the `from` slot is fully drained it is removed.
    ///
    /// Returns the number of items moved, or `0` if the merge is invalid
    /// (different kinds, out of bounds, or same index).
    pub fn merge_slots(&mut self, from: usize, to: usize) -> u32 {
        if from == to || from >= self.items.len() || to >= self.items.len() {
            return 0;
        }
        if self.items[from].kind != self.items[to].kind {
            return 0;
        }
        let max = self.items[to].kind.max_stack();
        let room = max.saturating_sub(self.items[to].quantity);
        let moved = self.items[from].quantity.min(room);
        self.items[to].quantity += moved;
        self.items[from].quantity -= moved;
        if self.items[from].quantity == 0 {
            self.items.remove(from);
        }
        moved
    }

    /// Consolidate fragmented stacks of the same kind.
    ///
    /// After many add/remove cycles, the same item kind may occupy multiple
    /// partially-filled slots. This method merges them together, freeing
    /// slots for other items.
    pub fn compact(&mut self) {
        let mut i = 0;
        while i < self.items.len() {
            let mut j = i + 1;
            while j < self.items.len() {
                if self.items[j].kind == self.items[i].kind {
                    let max = self.items[i].kind.max_stack();
                    let room = max.saturating_sub(self.items[i].quantity);
                    let moved = self.items[j].quantity.min(room);
                    self.items[i].quantity += moved;
                    self.items[j].quantity -= moved;
                    if self.items[j].quantity == 0 {
                        self.items.remove(j);
                        continue; // don't increment j, the next item slid down
                    }
                    if self.items[i].quantity >= max {
                        break; // slot i is full, move to next
                    }
                }
                j += 1;
            }
            i += 1;
        }
    }

    /// Transfer items from this inventory to another.
    ///
    /// Moves up to `quantity` of `kind` from `self` into `target`.
    /// Returns the number of items actually transferred (may be less if
    /// `self` doesn't have enough or `target` runs out of room).
    ///
    /// # Example
    ///
    /// ```rust
    /// # use bevy_inventory::{Inventory, ItemKind};
    /// # #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
    /// # enum Item { Coin }
    /// # impl ItemKind for Item {
    /// #     fn display_name(&self) -> &'static str { "Coin" }
    /// #     fn max_stack(&self) -> u32 { 100 }
    /// # }
    /// let mut player = Inventory::<Item>::new(4);
    /// let mut chest = Inventory::<Item>::new(4);
    /// player.add(Item::Coin, 50);
    /// let moved = player.transfer(&mut chest, Item::Coin, 30);
    /// assert_eq!(moved, 30);
    /// assert_eq!(player.count(Item::Coin), 20);
    /// assert_eq!(chest.count(Item::Coin), 30);
    /// ```
    pub fn transfer(&mut self, target: &mut Inventory<K>, kind: K, quantity: u32) -> u32 {
        let available = self.count(kind).min(quantity);
        if available == 0 {
            return 0;
        }
        let overflow = target.add(kind, available);
        let transferred = available - overflow;
        if transferred > 0 {
            self.remove(kind, transferred);
        }
        transferred
    }

    /// Clear all items from the inventory.
    pub fn clear(&mut self) {
        self.items.clear();
    }
}

// ── Loot event ──────────────────────────────────────────────────────────

/// Event to add items to the inventory.
///
/// Trigger this via [`Commands::trigger`] and the plugin's observer will
/// automatically stack the items into the inventory.
///
/// ```rust,no_run
/// # use bevy::prelude::*;
/// # use bevy_inventory::{LootEvent, ItemKind};
/// # #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
/// # enum Item { Coin }
/// # impl ItemKind for Item { fn display_name(&self) -> &'static str { "Coin" } }
/// fn drop_loot(mut commands: Commands) {
///     commands.trigger(LootEvent { kind: Item::Coin, quantity: 5 });
/// }
/// ```
#[derive(Event, Debug, Clone)]
pub struct LootEvent<K: ItemKind> {
    /// The item kind to add.
    pub kind: K,
    /// How many to add.
    pub quantity: u32,
}

/// Fired when items could not fit in the inventory during a [`LootEvent`].
///
/// Observe this event to show "inventory full" feedback, drop overflow items
/// on the ground, or trigger other game logic.
///
/// ```rust,no_run
/// # use bevy::prelude::*;
/// # use bevy_inventory::{InventoryFullEvent, ItemKind};
/// # #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
/// # enum Item { Coin }
/// # impl ItemKind for Item { fn display_name(&self) -> &'static str { "Coin" } }
/// fn on_inventory_full(event: On<InventoryFullEvent<Item>>) {
///     eprintln!(
///         "Could not fit {} x {}!",
///         event.overflow,
///         event.kind.display_name(),
///     );
/// }
/// ```
#[derive(Event, Debug, Clone)]
pub struct InventoryFullEvent<K: ItemKind> {
    /// The item kind that overflowed.
    pub kind: K,
    /// How many items could not fit.
    pub overflow: u32,
}

// ── Snapshot ────────────────────────────────────────────────────────────
//
// A global store that holds the latest JSON-serialised inventory so it can
// be read from outside the Bevy ECS — for example from a Tauri command
// handler or a WASM JS binding.
//
// On native targets we use `LazyLock<Mutex<_>>` for thread safety.
// On WASM (single-threaded) we use `thread_local!` + `RefCell` to avoid
// pulling in synchronisation primitives that don't exist on `wasm32`.

#[cfg(not(target_arch = "wasm32"))]
mod snapshot_store {
    use std::sync::{LazyLock, Mutex};

    static INVENTORY_SNAPSHOT_RAW: LazyLock<Mutex<Option<String>>> =
        LazyLock::new(|| Mutex::new(None));

    pub fn write(json: String) {
        if let Ok(mut snap) = INVENTORY_SNAPSHOT_RAW.lock() {
            *snap = Some(json);
        }
    }

    pub fn read() -> Option<String> {
        INVENTORY_SNAPSHOT_RAW.lock().ok()?.clone()
    }
}

#[cfg(target_arch = "wasm32")]
mod snapshot_store {
    use std::cell::RefCell;

    thread_local! {
        static INVENTORY_SNAPSHOT_RAW: RefCell<Option<String>> = const { RefCell::new(None) };
    }

    pub fn write(json: String) {
        INVENTORY_SNAPSHOT_RAW.with(|cell| {
            *cell.borrow_mut() = Some(json);
        });
    }

    pub fn read() -> Option<String> {
        INVENTORY_SNAPSHOT_RAW.with(|cell| cell.borrow().clone())
    }
}

/// Read the latest inventory snapshot as a deserialised [`Inventory<K>`].
///
/// Returns `None` if no snapshot has been written yet (i.e. the inventory
/// system has not run) or if deserialisation fails.
///
/// This function is safe to call from any thread (native) or from JS (WASM).
pub fn get_inventory_snapshot<K: ItemKind>() -> Option<Inventory<K>> {
    let json = snapshot_store::read()?;
    serde_json::from_str(&json).ok()
}

/// Read the latest inventory snapshot as a raw JSON string.
///
/// Useful when you need to forward the data without deserialising it
/// (e.g. returning it directly from a Tauri command or FFI boundary).
pub fn get_inventory_snapshot_json() -> Option<String> {
    snapshot_store::read()
}

// ── Plugin ──────────────────────────────────────────────────────────────

/// Bevy plugin that registers the inventory resource, loot event observer,
/// and snapshot system for a given item type `K`.
///
/// # What it registers
///
/// - [`Inventory<K>`] resource with the configured number of slots.
/// - An observer for [`LootEvent<K>`] that adds items to the inventory.
/// - An [`Update`] system that writes a JSON snapshot whenever the
///   inventory changes (for cross-thread / cross-boundary reads).
///
/// # Example
///
/// ```rust,no_run
/// # use bevy::prelude::*;
/// # use bevy_inventory::{InventoryPlugin, ItemKind};
/// # #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
/// # enum Item { Coin }
/// # impl ItemKind for Item { fn display_name(&self) -> &'static str { "Coin" } }
/// App::new()
///     .add_plugins(InventoryPlugin::<Item>::new(32))
///     .run();
/// ```
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

fn process_loot_events<K: ItemKind>(
    event: On<LootEvent<K>>,
    mut inventory: ResMut<Inventory<K>>,
    mut commands: Commands,
) {
    let overflow = inventory.add(event.kind, event.quantity);
    if overflow > 0 {
        commands.trigger(InventoryFullEvent {
            kind: event.kind,
            overflow,
        });
    }
}

fn snapshot_inventory<K: ItemKind>(inventory: Res<Inventory<K>>) {
    if inventory.is_changed() {
        if let Ok(json) = serde_json::to_string(inventory.as_ref()) {
            snapshot_store::write(json);
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

    #[test]
    fn contains() {
        let mut inv = Inventory::<TestItem>::new(4);
        assert!(!inv.contains(TestItem::Wood));
        inv.add(TestItem::Wood, 1);
        assert!(inv.contains(TestItem::Wood));
        assert!(!inv.contains(TestItem::Stone));
    }

    #[test]
    fn has_room_for_stacking() {
        let mut inv = Inventory::<TestItem>::new(1);
        inv.add(TestItem::Gold, 8);
        // Gold max_stack = 10, so room for 2 more
        assert!(inv.has_room_for(TestItem::Gold, 2));
        assert!(!inv.has_room_for(TestItem::Gold, 3));
    }

    #[test]
    fn has_room_for_new_slots() {
        let mut inv = Inventory::<TestItem>::new(3);
        inv.add(TestItem::Wood, 1);
        // 2 empty slots, Gold max_stack = 10, so room for 20
        assert!(inv.has_room_for(TestItem::Gold, 20));
        assert!(!inv.has_room_for(TestItem::Gold, 21));
    }

    #[test]
    fn has_room_for_combined() {
        let mut inv = Inventory::<TestItem>::new(2);
        inv.add(TestItem::Gold, 7);
        // Slot 0: Gold(7), 3 room left. Slot 1: empty, 10 room. Total = 13.
        assert!(inv.has_room_for(TestItem::Gold, 13));
        assert!(!inv.has_room_for(TestItem::Gold, 14));
    }

    #[test]
    fn get_slot() {
        let mut inv = Inventory::<TestItem>::new(4);
        inv.add(TestItem::Wood, 5);
        inv.add(TestItem::Stone, 3);
        let slot = inv.get_slot(0).unwrap();
        assert_eq!(slot.kind, TestItem::Wood);
        assert_eq!(slot.quantity, 5);
        let slot = inv.get_slot(1).unwrap();
        assert_eq!(slot.kind, TestItem::Stone);
        assert!(inv.get_slot(2).is_none());
    }

    #[test]
    fn remove_at_slot() {
        let mut inv = Inventory::<TestItem>::new(4);
        inv.add(TestItem::Wood, 5);
        inv.add(TestItem::Stone, 3);
        let removed = inv.remove_at_slot(0).unwrap();
        assert_eq!(removed.kind, TestItem::Wood);
        assert_eq!(removed.quantity, 5);
        assert_eq!(inv.slot_count(), 1);
        // Stone should now be at index 0
        assert_eq!(inv.get_slot(0).unwrap().kind, TestItem::Stone);
        // Out of bounds returns None
        assert!(inv.remove_at_slot(5).is_none());
    }

    #[test]
    fn swap_slots() {
        let mut inv = Inventory::<TestItem>::new(4);
        inv.add(TestItem::Wood, 5);
        inv.add(TestItem::Stone, 3);
        assert!(inv.swap_slots(0, 1));
        assert_eq!(inv.get_slot(0).unwrap().kind, TestItem::Stone);
        assert_eq!(inv.get_slot(1).unwrap().kind, TestItem::Wood);
    }

    #[test]
    fn swap_slots_same_index() {
        let mut inv = Inventory::<TestItem>::new(4);
        inv.add(TestItem::Wood, 5);
        assert!(inv.swap_slots(0, 0));
    }

    #[test]
    fn swap_slots_out_of_bounds() {
        let mut inv = Inventory::<TestItem>::new(4);
        inv.add(TestItem::Wood, 5);
        assert!(!inv.swap_slots(0, 3));
        assert!(!inv.swap_slots(3, 0));
    }

    #[test]
    fn iter_slots() {
        let mut inv = Inventory::<TestItem>::new(4);
        inv.add(TestItem::Wood, 5);
        inv.add(TestItem::Stone, 3);
        let kinds: Vec<_> = inv.iter().map(|s| s.kind).collect();
        assert_eq!(kinds, vec![TestItem::Wood, TestItem::Stone]);
    }

    #[test]
    fn remove_more_than_available() {
        let mut inv = Inventory::<TestItem>::new(4);
        inv.add(TestItem::Wood, 5);
        let removed = inv.remove(TestItem::Wood, 100);
        assert_eq!(removed, 5);
        assert_eq!(inv.slot_count(), 0);
    }

    #[test]
    fn remove_nonexistent_item() {
        let mut inv = Inventory::<TestItem>::new(4);
        inv.add(TestItem::Wood, 5);
        let removed = inv.remove(TestItem::Stone, 3);
        assert_eq!(removed, 0);
        assert_eq!(inv.count(TestItem::Wood), 5);
    }

    #[test]
    fn add_overflow_across_stack_and_slot_limits() {
        let mut inv = Inventory::<TestItem>::new(2);
        inv.add(TestItem::Gold, 10); // slot 0: full
        inv.add(TestItem::Gold, 10); // slot 1: full
        let overflow = inv.add(TestItem::Gold, 5);
        assert_eq!(overflow, 5);
        assert_eq!(inv.count(TestItem::Gold), 20);
    }

    #[test]
    fn has_room_for_empty_inventory() {
        let inv = Inventory::<TestItem>::new(2);
        assert!(inv.has_room_for(TestItem::Gold, 20));
        assert!(!inv.has_room_for(TestItem::Gold, 21));
    }

    #[test]
    fn has_room_for_zero() {
        let inv = Inventory::<TestItem>::new(0);
        assert!(inv.has_room_for(TestItem::Gold, 0));
    }

    // ── v2 tests ────────────────────────────────────────────────────────

    #[test]
    fn find_slot_present() {
        let mut inv = Inventory::<TestItem>::new(4);
        inv.add(TestItem::Wood, 5);
        inv.add(TestItem::Stone, 3);
        assert_eq!(inv.find_slot(TestItem::Stone), Some(1));
    }

    #[test]
    fn find_slot_absent() {
        let inv = Inventory::<TestItem>::new(4);
        assert_eq!(inv.find_slot(TestItem::Wood), None);
    }

    #[test]
    fn is_empty_and_not() {
        let mut inv = Inventory::<TestItem>::new(4);
        assert!(inv.is_empty());
        inv.add(TestItem::Wood, 1);
        assert!(!inv.is_empty());
    }

    #[test]
    fn is_full_unlimited_stack() {
        let mut inv = Inventory::<TestItem>::new(1);
        inv.add(TestItem::Wood, 1);
        // Wood has u32::MAX stack, so the slot is never "full"
        assert!(!inv.is_full());
    }

    #[test]
    fn is_full_capped_stack() {
        let mut inv = Inventory::<TestItem>::new(1);
        inv.add(TestItem::Gold, 10); // Gold max_stack = 10
        assert!(inv.is_full());
    }

    #[test]
    fn is_full_empty_inventory() {
        let inv = Inventory::<TestItem>::new(0);
        // 0 slots, 0 items — all slots are occupied (vacuously) and full
        assert!(inv.is_full());
    }

    #[test]
    fn total_item_count() {
        let mut inv = Inventory::<TestItem>::new(4);
        inv.add(TestItem::Wood, 100);
        inv.add(TestItem::Gold, 7);
        assert_eq!(inv.total_item_count(), 107);
    }

    #[test]
    fn total_item_count_empty() {
        let inv = Inventory::<TestItem>::new(4);
        assert_eq!(inv.total_item_count(), 0);
    }

    #[test]
    fn unique_kinds_no_duplicates() {
        let mut inv = Inventory::<TestItem>::new(4);
        inv.add(TestItem::Wood, 5);
        inv.add(TestItem::Stone, 3);
        inv.add(TestItem::Wood, 2); // stacks with existing
        let kinds = inv.unique_kinds();
        assert_eq!(kinds, vec![TestItem::Wood, TestItem::Stone]);
    }

    #[test]
    fn unique_kinds_empty() {
        let inv = Inventory::<TestItem>::new(4);
        assert!(inv.unique_kinds().is_empty());
    }

    #[test]
    fn split_stack_basic() {
        let mut inv = Inventory::<TestItem>::new(4);
        inv.add(TestItem::Wood, 10);
        assert!(inv.split_stack(0, 4));
        assert_eq!(inv.slot_count(), 2);
        assert_eq!(inv.get_slot(0).unwrap().quantity, 6);
        assert_eq!(inv.get_slot(1).unwrap().quantity, 4);
        assert_eq!(inv.count(TestItem::Wood), 10); // total unchanged
    }

    #[test]
    fn split_stack_zero_quantity() {
        let mut inv = Inventory::<TestItem>::new(4);
        inv.add(TestItem::Wood, 10);
        assert!(!inv.split_stack(0, 0));
    }

    #[test]
    fn split_stack_entire_stack() {
        let mut inv = Inventory::<TestItem>::new(4);
        inv.add(TestItem::Wood, 10);
        // Can't split the entire stack (would leave 0 in original)
        assert!(!inv.split_stack(0, 10));
    }

    #[test]
    fn split_stack_no_room() {
        let mut inv = Inventory::<TestItem>::new(1);
        inv.add(TestItem::Wood, 10);
        // Only 1 slot, no room for the split
        assert!(!inv.split_stack(0, 5));
    }

    #[test]
    fn split_stack_out_of_bounds() {
        let mut inv = Inventory::<TestItem>::new(4);
        inv.add(TestItem::Wood, 10);
        assert!(!inv.split_stack(5, 3));
    }

    #[test]
    fn merge_slots_basic() {
        let mut inv = Inventory::<TestItem>::new(4);
        // Manually place items to get Gold in separate slots
        inv.items.push(ItemStack {
            kind: TestItem::Gold,
            quantity: 5,
        });
        inv.items.push(ItemStack {
            kind: TestItem::Wood,
            quantity: 1,
        });
        inv.items.push(ItemStack {
            kind: TestItem::Gold,
            quantity: 3,
        });
        // Merge slot 2 (Gold:3) into slot 0 (Gold:5)
        let moved = inv.merge_slots(2, 0);
        assert_eq!(moved, 3);
        assert_eq!(inv.get_slot(0).unwrap().quantity, 8);
        assert_eq!(inv.slot_count(), 2); // slot 2 was removed
    }

    #[test]
    fn merge_slots_respects_max_stack() {
        let mut inv = Inventory::<TestItem>::new(4);
        inv.items.push(ItemStack {
            kind: TestItem::Gold,
            quantity: 8,
        });
        inv.items.push(ItemStack {
            kind: TestItem::Wood,
            quantity: 1,
        });
        inv.items.push(ItemStack {
            kind: TestItem::Gold,
            quantity: 7,
        });
        // Merge slot 2 into slot 0 — only 2 can fit (max 10)
        let moved = inv.merge_slots(2, 0);
        assert_eq!(moved, 2);
        assert_eq!(inv.get_slot(0).unwrap().quantity, 10);
        // slot 2 still has 5 remaining
        assert_eq!(
            inv.items
                .iter()
                .filter(|s| s.kind == TestItem::Gold)
                .count(),
            2
        );
        assert_eq!(inv.count(TestItem::Gold), 15);
    }

    #[test]
    fn merge_slots_different_kinds() {
        let mut inv = Inventory::<TestItem>::new(4);
        inv.add(TestItem::Wood, 5);
        inv.add(TestItem::Stone, 3);
        assert_eq!(inv.merge_slots(0, 1), 0);
    }

    #[test]
    fn merge_slots_same_index() {
        let mut inv = Inventory::<TestItem>::new(4);
        inv.add(TestItem::Wood, 5);
        assert_eq!(inv.merge_slots(0, 0), 0);
    }

    #[test]
    fn compact_basic() {
        let mut inv = Inventory::<TestItem>::new(4);
        // Manually create fragmented state
        inv.items.push(ItemStack {
            kind: TestItem::Gold,
            quantity: 3,
        });
        inv.items.push(ItemStack {
            kind: TestItem::Wood,
            quantity: 5,
        });
        inv.items.push(ItemStack {
            kind: TestItem::Gold,
            quantity: 4,
        });
        inv.items.push(ItemStack {
            kind: TestItem::Gold,
            quantity: 2,
        });
        // Gold is in 3 slots (3 + 4 + 2 = 9, max_stack = 10)
        inv.compact();
        assert_eq!(inv.count(TestItem::Gold), 9);
        // Should now be in 1 slot
        assert_eq!(
            inv.items
                .iter()
                .filter(|s| s.kind == TestItem::Gold)
                .count(),
            1
        );
        assert_eq!(inv.count(TestItem::Wood), 5);
    }

    #[test]
    fn compact_needs_multiple_slots() {
        let mut inv = Inventory::<TestItem>::new(8);
        // 25 Gold across 5 slots, max_stack = 10 → compacts to 3 slots (10+10+5)
        for _ in 0..5 {
            inv.items.push(ItemStack {
                kind: TestItem::Gold,
                quantity: 5,
            });
        }
        inv.compact();
        assert_eq!(inv.count(TestItem::Gold), 25);
        assert_eq!(
            inv.items
                .iter()
                .filter(|s| s.kind == TestItem::Gold)
                .count(),
            3
        );
    }

    #[test]
    fn compact_already_optimal() {
        let mut inv = Inventory::<TestItem>::new(4);
        inv.add(TestItem::Wood, 10);
        inv.add(TestItem::Stone, 5);
        let slots_before = inv.slot_count();
        inv.compact();
        assert_eq!(inv.slot_count(), slots_before);
    }

    #[test]
    fn transfer_basic() {
        let mut player = Inventory::<TestItem>::new(4);
        let mut chest = Inventory::<TestItem>::new(4);
        player.add(TestItem::Wood, 50);
        let moved = player.transfer(&mut chest, TestItem::Wood, 30);
        assert_eq!(moved, 30);
        assert_eq!(player.count(TestItem::Wood), 20);
        assert_eq!(chest.count(TestItem::Wood), 30);
    }

    #[test]
    fn transfer_limited_by_source() {
        let mut src = Inventory::<TestItem>::new(4);
        let mut dst = Inventory::<TestItem>::new(4);
        src.add(TestItem::Gold, 5);
        let moved = src.transfer(&mut dst, TestItem::Gold, 100);
        assert_eq!(moved, 5);
        assert_eq!(src.count(TestItem::Gold), 0);
        assert_eq!(dst.count(TestItem::Gold), 5);
    }

    #[test]
    fn transfer_limited_by_target() {
        let mut src = Inventory::<TestItem>::new(4);
        let mut dst = Inventory::<TestItem>::new(1);
        src.add(TestItem::Gold, 25);
        // dst has 1 slot, Gold max 10 → can only take 10
        let moved = src.transfer(&mut dst, TestItem::Gold, 25);
        assert_eq!(moved, 10);
        assert_eq!(src.count(TestItem::Gold), 15);
        assert_eq!(dst.count(TestItem::Gold), 10);
    }

    #[test]
    fn transfer_nonexistent_item() {
        let mut src = Inventory::<TestItem>::new(4);
        let mut dst = Inventory::<TestItem>::new(4);
        src.add(TestItem::Wood, 10);
        let moved = src.transfer(&mut dst, TestItem::Gold, 5);
        assert_eq!(moved, 0);
    }

    #[test]
    fn transfer_zero_quantity() {
        let mut src = Inventory::<TestItem>::new(4);
        let mut dst = Inventory::<TestItem>::new(4);
        src.add(TestItem::Wood, 10);
        let moved = src.transfer(&mut dst, TestItem::Wood, 0);
        assert_eq!(moved, 0);
        assert_eq!(src.count(TestItem::Wood), 10);
    }

    #[test]
    fn default_inventory() {
        let inv = Inventory::<TestItem>::default();
        assert_eq!(inv.max_slots, 16);
        assert!(inv.is_empty());
    }

    #[test]
    fn clear_inventory() {
        let mut inv = Inventory::<TestItem>::new(4);
        inv.add(TestItem::Wood, 5);
        inv.add(TestItem::Stone, 3);
        inv.clear();
        assert!(inv.is_empty());
        assert_eq!(inv.total_item_count(), 0);
    }

    #[test]
    fn add_zero_items() {
        let mut inv = Inventory::<TestItem>::new(4);
        let overflow = inv.add(TestItem::Wood, 0);
        assert_eq!(overflow, 0);
        assert!(inv.is_empty());
    }

    #[test]
    fn remove_zero_items() {
        let mut inv = Inventory::<TestItem>::new(4);
        inv.add(TestItem::Wood, 5);
        let removed = inv.remove(TestItem::Wood, 0);
        assert_eq!(removed, 0);
        assert_eq!(inv.count(TestItem::Wood), 5);
    }

    #[test]
    fn mixed_items_stress() {
        let mut inv = Inventory::<TestItem>::new(10);
        // Add various items
        inv.add(TestItem::Wood, 100);
        inv.add(TestItem::Stone, 50);
        inv.add(TestItem::Gold, 25);
        // Remove some
        inv.remove(TestItem::Wood, 30);
        inv.remove(TestItem::Gold, 10);
        // Verify
        assert_eq!(inv.count(TestItem::Wood), 70);
        assert_eq!(inv.count(TestItem::Stone), 50);
        assert_eq!(inv.count(TestItem::Gold), 15);
        assert_eq!(inv.total_item_count(), 135);
        assert_eq!(inv.unique_kinds().len(), 3);
    }
}
