//! # bevy_inventory
//!
//! A generic, slot-based inventory plugin for games.
//!
//! ## Features
//!
//! - **Generic item types** — bring your own `enum` implementing [`ItemKind`].
//! - **Automatic stacking** — items stack up to [`ItemKind::max_stack`] per slot.
//! - **Slot capacity** — configurable maximum number of slots via [`Inventory::new`].
//! - **Slot operations** — [`Inventory::swap_slots`], [`Inventory::remove_at_slot`],
//!   and [`Inventory::get_slot`] for drag-and-drop UI integration.
//! - **Capacity queries** — [`Inventory::has_room_for`] checks whether a specific
//!   quantity of an item can fit, accounting for both partial stacks and empty slots.
//! - **Serde support** — [`Inventory`] and [`ItemStack`] derive `Serialize`/`Deserialize`
//!   for save files, network sync, or any other serialization need.
//! - **Search** — [`Inventory::search`] finds items by name with case-insensitive
//!   substring matching.
//!
//! ## Bevy integration (optional)
//!
//! Enable the `bevy` feature to get:
//! - [`InventoryPlugin`] that registers the inventory resource and event observers.
//! - [`LootEvent`] / [`InventoryFullEvent`] observers for automatic stacking.
//! - [`SplitStackAction`] / [`MergeStackAction`] / [`MoveSlotAction`] UI actions.
//! - Thread-safe snapshots via [`get_inventory_snapshot`].
//!
//! Without the `bevy` feature, the crate is pure Rust with zero Bevy dependency —
//! suitable for FFI cdylibs (uniti) and non-Bevy consumers (discordsh-bot).

use std::fmt::Debug;
use std::hash::Hash;

#[cfg(feature = "bevy")]
use std::marker::PhantomData;

#[cfg(feature = "bevy")]
use bevy::prelude::*;

use serde::{Deserialize, Serialize};

/// Trait that item types must implement to be used with the inventory system.
///
/// Implementors are typically an `enum` of all item kinds in a game.
/// The trait requires `Serialize + Deserialize` so the inventory can be
/// serialised for snapshots, save files, and network sync.
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
    fn max_stack(&self) -> u32 {
        u32::MAX
    }
}

/// A single inventory slot holding a quantity of one item kind.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(bound = "K: ItemKind")]
pub struct ItemStack<K: ItemKind> {
    /// The item kind stored in this slot.
    pub kind: K,
    /// How many of this item are in the slot (always `>= 1`).
    pub quantity: u32,
}

/// Slot-based inventory with automatic stacking.
///
/// # Stacking behaviour
///
/// When adding items via [`Inventory::add`], the inventory first tries to fill
/// existing stacks of the same kind (up to [`ItemKind::max_stack`]), then
/// allocates new slots for the remainder. Any quantity that cannot fit is
/// returned as overflow.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "bevy", derive(Resource))]
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
    /// # Examples
    ///
    /// ```
    /// use bevy_inventory::{Inventory, ItemKind};
    /// use serde::{Deserialize, Serialize};
    ///
    /// #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
    /// enum Item { Wood }
    /// impl ItemKind for Item {
    ///     fn display_name(&self) -> &'static str { "Wood" }
    /// }
    ///
    /// let inv: Inventory<Item> = Inventory::new(20);
    /// assert!(inv.is_empty());
    /// ```
    pub fn new(max_slots: usize) -> Self {
        Self {
            items: Vec::new(),
            max_slots,
        }
    }

    /// Add items, filling existing stacks of the same kind first, then
    /// allocating new slots.
    ///
    /// # Arguments
    ///
    /// * `kind` — item kind to add.
    /// * `quantity` — how many to add.
    ///
    /// # Returns
    ///
    /// The overflow — quantity that could not be added because the
    /// inventory is full. `0` means everything fit.
    pub fn add(&mut self, kind: K, mut quantity: u32) -> u32 {
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

    /// Remove up to `quantity` of the given item kind, draining stacks
    /// front-to-back.
    ///
    /// # Returns
    ///
    /// The amount actually removed (clamped at the available count).
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

    /// Remove the entire stack at slot `index`.
    ///
    /// # Returns
    ///
    /// `Some(stack)` on hit, `None` if `index` is out of range.
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
    pub fn has_room(&self) -> bool {
        self.items.len() < self.max_slots
            || self.items.iter().any(|s| s.quantity < s.kind.max_stack())
    }

    /// Returns `true` if the inventory can fit `quantity` of `kind`,
    /// accounting for both partial stacks and empty slots.
    ///
    /// # Arguments
    ///
    /// * `kind` — item kind to test.
    /// * `quantity` — how many would be added.
    pub fn has_room_for(&self, kind: K, mut quantity: u32) -> bool {
        for stack in &self.items {
            if stack.kind == kind {
                let room = kind.max_stack().saturating_sub(stack.quantity);
                quantity = quantity.saturating_sub(room);
                if quantity == 0 {
                    return true;
                }
            }
        }

        let empty_slots = self.max_slots.saturating_sub(self.items.len());
        let fits_in_new = (empty_slots as u64) * (kind.max_stack() as u64);
        (quantity as u64) <= fits_in_new
    }

    /// Number of occupied slots.
    pub fn slot_count(&self) -> usize {
        self.items.len()
    }

    /// Read a specific slot by index.
    pub fn get_slot(&self, index: usize) -> Option<&ItemStack<K>> {
        self.items.get(index)
    }

    /// Swap the contents of two slots.
    ///
    /// # Returns
    ///
    /// `true` on success. `false` when either index is out of range.
    /// Swapping a slot with itself returns `true` if the index is in
    /// range.
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
    pub fn iter(&self) -> impl Iterator<Item = &ItemStack<K>> {
        self.items.iter()
    }

    /// Find the first slot index containing the given item kind.
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

    /// Split a stack at `index`, moving `quantity` items into a new
    /// slot at the end.
    ///
    /// # Returns
    ///
    /// `true` on success. `false` when:
    ///
    /// - `index` is out of range,
    /// - `quantity == 0` or `quantity >= stack.quantity` (no split needed),
    /// - the inventory is at `max_slots` and has no room for the new stack.
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

    /// Merge the stack at `from` into the stack at `to`. The source
    /// slot is removed entirely once drained.
    ///
    /// # Returns
    ///
    /// Number of items moved. `0` when:
    ///
    /// - `from == to`,
    /// - either index is out of range,
    /// - the kinds differ.
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
                        continue;
                    }
                    if self.items[i].quantity >= max {
                        break;
                    }
                }
                j += 1;
            }
            i += 1;
        }
    }

    /// Transfer items from this inventory to another.
    ///
    /// Fills `target` first; only items that successfully land in
    /// `target` are removed from `self`. Anything that bounces off
    /// `target`'s capacity stays here.
    ///
    /// # Returns
    ///
    /// Number of items actually moved.
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

    /// Search for items whose display name contains `query`
    /// (case-insensitive substring match).
    ///
    /// # Returns
    ///
    /// `(slot_index, &stack)` pairs in slot order.
    pub fn search(&self, query: &str) -> Vec<(usize, &ItemStack<K>)> {
        let query_lower = query.to_lowercase();
        self.items
            .iter()
            .enumerate()
            .filter(|(_, stack)| {
                stack
                    .kind
                    .display_name()
                    .to_lowercase()
                    .contains(&query_lower)
            })
            .collect()
    }

    /// Clear all items from the inventory.
    pub fn clear(&mut self) {
        self.items.clear();
    }
}

/// The outcome of an inventory action ([`SplitStackAction`],
/// [`MergeStackAction`], [`MoveSlotAction`]).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ActionOutcome {
    /// The action ran with the requested parameters.
    Success,
    /// The action ran but the requested quantity was clamped to fit
    /// the available stack (e.g. asking to split off more items than
    /// the stack contains).
    Clamped {
        /// What the caller asked for.
        requested: u32,
        /// What actually happened.
        actual: u32,
    },
    /// The action did not run — see [`ActionError`].
    Failed(ActionError),
}

/// Reasons an inventory action can fail.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ActionError {
    /// One of the slot indices is `>= inventory.slot_count()`.
    SlotOutOfBounds,
    /// The action needed to allocate a new slot but the inventory is
    /// already at `max_slots`.
    NoEmptySlots,
    /// A merge / move was requested between slots holding different
    /// item kinds.
    KindMismatch,
    /// Quantity is zero, equal to the source quantity (split would be
    /// a no-op), or otherwise rejected by the operation.
    InvalidQuantity,
}

#[cfg(feature = "bevy")]
mod bevy_integration {
    use super::*;

    /// Event requesting items be added to the inventory. Trigger this
    /// from your loot / pickup systems; the plugin observer drains it
    /// into the [`Inventory`] resource and fires
    /// [`InventoryFullEvent`] for any overflow.
    #[derive(Event, Debug, Clone)]
    pub struct LootEvent<K: ItemKind> {
        /// Item kind to add.
        pub kind: K,
        /// How many to add.
        pub quantity: u32,
    }

    /// Fired when items could not fit during a [`LootEvent`].
    /// `overflow` is the leftover count.
    #[derive(Event, Debug, Clone)]
    pub struct InventoryFullEvent<K: ItemKind> {
        /// Item kind that overflowed.
        pub kind: K,
        /// Quantity that did not fit.
        pub overflow: u32,
    }

    /// Split a stack at `slot` into two, moving `quantity` items to a
    /// new slot at the end. Result reported via
    /// [`InventoryActionResult`].
    #[derive(Event, Debug, Clone)]
    pub struct SplitStackAction<K: ItemKind> {
        /// Source slot to split.
        pub slot: usize,
        /// How many items to move into the new slot.
        pub quantity: u32,
        _marker: PhantomData<K>,
    }

    impl<K: ItemKind> SplitStackAction<K> {
        /// Create a new split request.
        pub fn new(slot: usize, quantity: u32) -> Self {
            Self {
                slot,
                quantity,
                _marker: PhantomData,
            }
        }
    }

    /// Merge the stack at `from` into the stack at `to`. Result
    /// reported via [`InventoryActionResult`].
    #[derive(Event, Debug, Clone)]
    pub struct MergeStackAction<K: ItemKind> {
        /// Source slot — drained into `to`.
        pub from: usize,
        /// Destination slot — accepts items from `from`.
        pub to: usize,
        _marker: PhantomData<K>,
    }

    impl<K: ItemKind> MergeStackAction<K> {
        /// Create a new merge request.
        pub fn new(from: usize, to: usize) -> Self {
            Self {
                from,
                to,
                _marker: PhantomData,
            }
        }
    }

    /// Swap the contents of two slots. Result reported via
    /// [`InventoryActionResult`].
    #[derive(Event, Debug, Clone)]
    pub struct MoveSlotAction<K: ItemKind> {
        /// First slot.
        pub from: usize,
        /// Second slot.
        pub to: usize,
        _marker: PhantomData<K>,
    }

    impl<K: ItemKind> MoveSlotAction<K> {
        /// Create a new move request.
        pub fn new(from: usize, to: usize) -> Self {
            Self {
                from,
                to,
                _marker: PhantomData,
            }
        }
    }

    /// Fired after an inventory action ([`SplitStackAction`],
    /// [`MergeStackAction`], [`MoveSlotAction`]) is processed.
    #[derive(Event, Debug, Clone)]
    pub struct InventoryActionResult {
        /// `"split"`, `"merge"`, or `"move"`.
        pub action: &'static str,
        /// What happened.
        pub outcome: ActionOutcome,
    }

    /// Bevy plugin that wires up the inventory resource, action
    /// observers, and (with `snapshot` feature) the snapshot writer.
    pub struct InventoryPlugin<K: ItemKind> {
        max_slots: usize,
        _marker: PhantomData<K>,
    }

    impl<K: ItemKind> InventoryPlugin<K> {
        /// Create a plugin instance for an inventory with `max_slots`
        /// slot capacity. The plugin inserts an [`Inventory`]
        /// resource and registers observers for [`LootEvent`],
        /// [`SplitStackAction`], [`MergeStackAction`], and
        /// [`MoveSlotAction`].
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
            app.add_observer(process_split_action::<K>);
            app.add_observer(process_merge_action::<K>);
            app.add_observer(process_move_action::<K>);
            #[cfg(feature = "snapshot")]
            app.add_systems(Update, snapshot_inventory::<K>);
        }
    }

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

    fn process_split_action<K: ItemKind>(
        event: On<SplitStackAction<K>>,
        mut inventory: ResMut<Inventory<K>>,
        mut commands: Commands,
    ) {
        let slot = event.slot;
        let requested = event.quantity;

        if slot >= inventory.items.len() {
            commands.trigger(InventoryActionResult {
                action: "split",
                outcome: ActionOutcome::Failed(ActionError::SlotOutOfBounds),
            });
            return;
        }

        if inventory.items.len() >= inventory.max_slots {
            commands.trigger(InventoryActionResult {
                action: "split",
                outcome: ActionOutcome::Failed(ActionError::NoEmptySlots),
            });
            return;
        }

        let stack_qty = inventory.items[slot].quantity;

        if stack_qty < 2 {
            commands.trigger(InventoryActionResult {
                action: "split",
                outcome: ActionOutcome::Failed(ActionError::InvalidQuantity),
            });
            return;
        }

        let clamped = requested.clamp(1, stack_qty - 1);
        inventory.split_stack(slot, clamped);

        let outcome = if clamped != requested {
            ActionOutcome::Clamped {
                requested,
                actual: clamped,
            }
        } else {
            ActionOutcome::Success
        };

        commands.trigger(InventoryActionResult {
            action: "split",
            outcome,
        });
    }

    fn process_merge_action<K: ItemKind>(
        event: On<MergeStackAction<K>>,
        mut inventory: ResMut<Inventory<K>>,
        mut commands: Commands,
    ) {
        let from = event.from;
        let to = event.to;

        if from >= inventory.items.len() || to >= inventory.items.len() {
            commands.trigger(InventoryActionResult {
                action: "merge",
                outcome: ActionOutcome::Failed(ActionError::SlotOutOfBounds),
            });
            return;
        }

        if from == to {
            commands.trigger(InventoryActionResult {
                action: "merge",
                outcome: ActionOutcome::Failed(ActionError::InvalidQuantity),
            });
            return;
        }

        if inventory.items[from].kind != inventory.items[to].kind {
            commands.trigger(InventoryActionResult {
                action: "merge",
                outcome: ActionOutcome::Failed(ActionError::KindMismatch),
            });
            return;
        }

        inventory.merge_slots(from, to);

        commands.trigger(InventoryActionResult {
            action: "merge",
            outcome: ActionOutcome::Success,
        });
    }

    fn process_move_action<K: ItemKind>(
        event: On<MoveSlotAction<K>>,
        mut inventory: ResMut<Inventory<K>>,
        mut commands: Commands,
    ) {
        let from = event.from;
        let to = event.to;

        if !inventory.swap_slots(from, to) {
            commands.trigger(InventoryActionResult {
                action: "move",
                outcome: ActionOutcome::Failed(ActionError::SlotOutOfBounds),
            });
            return;
        }

        commands.trigger(InventoryActionResult {
            action: "move",
            outcome: ActionOutcome::Success,
        });
    }

    #[cfg(feature = "snapshot")]
    fn snapshot_inventory<K: ItemKind>(inventory: Res<Inventory<K>>) {
        if inventory.is_changed()
            && let Ok(json) = serde_json::to_string(inventory.as_ref())
        {
            super::snapshot_store::write(json);
        }
    }
}

#[cfg(feature = "bevy")]
pub use bevy_integration::*;

#[cfg(feature = "snapshot")]
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

#[cfg(feature = "snapshot")]
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

/// Read the most recent inventory snapshot as a typed [`Inventory<K>`].
///
/// Available with the `snapshot` feature. The snapshot is written
/// each tick the inventory resource changes by the `snapshot_inventory`
/// system installed by [`InventoryPlugin`].
///
/// # Returns
///
/// `Some(inv)` when a snapshot has been written and deserializes
/// cleanly with the requested `K`. `None` if no snapshot exists yet
/// or the stored JSON does not match `K`.
#[cfg(feature = "snapshot")]
pub fn get_inventory_snapshot<K: ItemKind>() -> Option<Inventory<K>> {
    let json = snapshot_store::read()?;
    serde_json::from_str(&json).ok()
}

/// Read the most recent inventory snapshot as raw JSON.
///
/// Cheaper than [`get_inventory_snapshot`] when the consumer only
/// needs to forward the bytes (FFI / Tauri IPC / network sync).
#[cfg(feature = "snapshot")]
pub fn get_inventory_snapshot_json() -> Option<String> {
    snapshot_store::read()
}

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
    fn remove_items() {
        let mut inv = Inventory::<TestItem>::new(4);
        inv.add(TestItem::Wood, 10);
        let removed = inv.remove(TestItem::Wood, 3);
        assert_eq!(removed, 3);
        assert_eq!(inv.count(TestItem::Wood), 7);
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
    fn split_stack_basic() {
        let mut inv = Inventory::<TestItem>::new(4);
        inv.add(TestItem::Wood, 10);
        assert!(inv.split_stack(0, 4));
        assert_eq!(inv.get_slot(0).unwrap().quantity, 6);
        assert_eq!(inv.get_slot(1).unwrap().quantity, 4);
    }

    #[test]
    fn compact_basic() {
        let mut inv = Inventory::<TestItem>::new(4);
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
        inv.compact();
        assert_eq!(inv.count(TestItem::Gold), 7);
        assert_eq!(
            inv.items
                .iter()
                .filter(|s| s.kind == TestItem::Gold)
                .count(),
            1
        );
    }

    #[test]
    fn search_case_insensitive() {
        let mut inv = Inventory::<TestItem>::new(4);
        inv.add(TestItem::Wood, 5);
        assert_eq!(inv.search("wood").len(), 1);
        assert_eq!(inv.search("WOOD").len(), 1);
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
    }
}
