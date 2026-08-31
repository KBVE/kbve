# bevy_db

Cross-platform async key-value persistence for Bevy. `redb` (pure-Rust B+tree) on native, `rexie` (IndexedDB) on WASM. All I/O is dispatched off the game thread via `bevy_tasker`.

## Usage

```rust
use bevy::prelude::*;
use bevy_db::{BevyDbPlugin, Db, DbRequest};

App::new()
    .add_plugins(BevyDbPlugin::default())
    .run();
```

## Key Types

- `BevyDbPlugin` — plugin that initializes the backend and inserts the `Db` resource
- `Db` — request handle for `get` / `put` / `delete`
- `DbRequest<T>` — pending async result, polled with `try_recv()`
- `DbError` — backend-agnostic error enum

## License

MIT
