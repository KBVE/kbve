# bevy_inventory

Generic, slot-based inventory with item stacking, transfer, search, and serde-driven snapshots. Pure Rust core; optional Bevy ECS integration via the `bevy` feature.

## Why

Most inventory crates ship with a fixed item type and a Bevy hard-dep. `bevy_inventory` is the opposite:

- **Bring your own item enum** — implement [`ItemKind`] and you're done.
- **Pure Rust by default** — works inside FFI cdylibs (uniti) and headless Discord-bot consumers without pulling in Bevy.
- **Bevy plugin behind a feature flag** — opt in for ECS resource + observers + UI action events.
- **Serde all the way** — every public type round-trips through JSON / bincode / msgpack for save files, network sync, and FFI snapshots.

## Quick start (pure Rust)

```rust
use bevy_inventory::{Inventory, ItemKind, ItemStack};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
enum Item { Wood, Stone, Gold }

impl ItemKind for Item {
    fn display_name(&self) -> &'static str {
        match self { Item::Wood => "Wood", Item::Stone => "Stone", Item::Gold => "Gold" }
    }
    fn max_stack(&self) -> u32 {
        match self { Item::Gold => 10, _ => u32::MAX }
    }
}

let mut inv = Inventory::<Item>::new(16);
inv.add(Item::Wood, 50);
inv.add(Item::Gold, 25);                          // splits across 3 slots (cap 10)
assert_eq!(inv.count(Item::Gold), 25);
assert_eq!(inv.slot_count(), 4);

let removed = inv.remove(Item::Wood, 30);
assert_eq!(removed, 30);
```

## Quick start (Bevy)

```rust,ignore
use bevy::prelude::*;
use bevy_inventory::{InventoryPlugin, LootEvent, InventoryFullEvent, MoveSlotAction};

App::new()
    .add_plugins(DefaultPlugins)
    .add_plugins(InventoryPlugin::<Item>::new(20))
    .add_systems(Update, drop_loot)
    .add_observer(on_full)
    .run();

fn drop_loot(mut commands: Commands) {
    commands.trigger(LootEvent { kind: Item::Wood, quantity: 5 });
}

fn on_full(event: On<InventoryFullEvent<Item>>) {
    info!("Could not store {} {}", event.overflow, event.kind.display_name());
}
```

## Surface

| Item                                                             | Purpose                                            |
| ---------------------------------------------------------------- | -------------------------------------------------- |
| [`ItemKind`]                                                     | Trait — your item enum implements this             |
| [`ItemStack`]                                                    | One slot's `(kind, quantity)`                      |
| [`Inventory`]                                                    | Slot-based store with stacking + capacity rules    |
| [`ActionOutcome`] / [`ActionError`]                              | Result tags reported via [`InventoryActionResult`] |
| `InventoryPlugin<K>`                                             | Bevy plugin (feature `bevy`)                       |
| [`LootEvent`]                                                    | Request: add items                                 |
| [`InventoryFullEvent`]                                           | Notification: items overflowed                     |
| [`SplitStackAction`] / [`MergeStackAction`] / [`MoveSlotAction`] | UI drag-and-drop primitives                        |
| [`InventoryActionResult`]                                        | Notification: action processed                     |
| `get_inventory_snapshot` / `get_inventory_snapshot_json`         | Snapshot read API (feature `snapshot`)             |

## Features

| Feature              | Effect                                                                 |
| -------------------- | ---------------------------------------------------------------------- |
| `bevy` (default)     | Adds `InventoryPlugin`, action events, `Resource` derive               |
| `snapshot` (default) | Adds JSON snapshot writer system + reader API; depends on `serde_json` |

Disable both for a minimal pure-Rust core (FFI cdylibs, build scripts):

```toml
[dependencies]
bevy_inventory = { version = "0.1", default-features = false }
```

## Stacking rules

- [`Inventory::add`] fills existing stacks of the same kind first (up to [`ItemKind::max_stack`]), then allocates new slots.
- Anything that doesn't fit is returned as overflow.
- [`Inventory::has_room_for`] mirrors that logic so UI can disable an "accept loot" button without speculative writes.
- [`Inventory::compact`] consolidates fragmented stacks created by manual slot operations.

## License

MIT

[`ItemKind`]: https://docs.rs/bevy_inventory/latest/bevy_inventory/trait.ItemKind.html
[`ItemStack`]: https://docs.rs/bevy_inventory/latest/bevy_inventory/struct.ItemStack.html
[`Inventory`]: https://docs.rs/bevy_inventory/latest/bevy_inventory/struct.Inventory.html
[`Inventory::add`]: https://docs.rs/bevy_inventory/latest/bevy_inventory/struct.Inventory.html#method.add
[`Inventory::has_room_for`]: https://docs.rs/bevy_inventory/latest/bevy_inventory/struct.Inventory.html#method.has_room_for
[`Inventory::compact`]: https://docs.rs/bevy_inventory/latest/bevy_inventory/struct.Inventory.html#method.compact
[`ItemKind::max_stack`]: https://docs.rs/bevy_inventory/latest/bevy_inventory/trait.ItemKind.html#method.max_stack
[`ActionOutcome`]: https://docs.rs/bevy_inventory/latest/bevy_inventory/enum.ActionOutcome.html
[`ActionError`]: https://docs.rs/bevy_inventory/latest/bevy_inventory/enum.ActionError.html
[`LootEvent`]: https://docs.rs/bevy_inventory/latest/bevy_inventory/struct.LootEvent.html
[`InventoryFullEvent`]: https://docs.rs/bevy_inventory/latest/bevy_inventory/struct.InventoryFullEvent.html
[`SplitStackAction`]: https://docs.rs/bevy_inventory/latest/bevy_inventory/struct.SplitStackAction.html
[`MergeStackAction`]: https://docs.rs/bevy_inventory/latest/bevy_inventory/struct.MergeStackAction.html
[`MoveSlotAction`]: https://docs.rs/bevy_inventory/latest/bevy_inventory/struct.MoveSlotAction.html
[`InventoryActionResult`]: https://docs.rs/bevy_inventory/latest/bevy_inventory/struct.InventoryActionResult.html
