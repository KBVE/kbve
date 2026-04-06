# bevy_inventory

Generic Bevy inventory plugin with item stacking, slot limits, and loot events. WASM-compatible.

## Usage

```rust
use bevy::prelude::*;
use bevy_inventory::{InventoryPlugin, Inventory, ItemStack, LootEvent};

fn main() {
    App::new()
        .add_plugins(InventoryPlugin::new(20)) // 20 slots
        .run();
}
```

## Key Types

- `InventoryPlugin::new(max_slots)` — main plugin entry point
- `Inventory` — ECS component holding item slots
- `ItemKind` — trait for defining item types (`display_name()`, `max_stack()`)
- `ItemStack` — a stack of items in a slot
- `LootEvent` / `InventoryFullEvent` — events for game logic
- `SplitStackAction` / `MergeStackAction` / `MoveSlotAction` — inventory manipulation

## Features

| Feature              | Description                               |
| -------------------- | ----------------------------------------- |
| `snapshot` (default) | JSON inventory snapshots via `serde_json` |

## License

MIT
