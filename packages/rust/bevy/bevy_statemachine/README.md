# bevy_statemachine

Thread-safe state snapshot bridge for Bevy — exposes ECS resources to external consumers (Tauri IPC, WASM JS, lightyear networking) with JSON and bincode support.

## Usage

```rust
use bevy::prelude::*;
use bevy_statemachine::{StateSnapshotPlugin, get_snapshot, get_snapshot_json};

fn main() {
    App::new()
        .add_plugins(StateSnapshotPlugin::<MyState>::new())
        .run();
}
```

## Key Types

- `StateSnapshotPlugin::<T>::new()` — main plugin, generic over your state type
- `get_snapshot::<T>()` — retrieve the latest snapshot
- `get_snapshot_json::<T>()` — retrieve as JSON string
- `snapshot_version::<T>()` — monotonic version counter

## Features

| Feature           | Description                         |
| ----------------- | ----------------------------------- |
| `serde` (default) | JSON serialization via `serde_json` |
| `bincode`         | Binary serialization via `bincode`  |

## License

MIT
