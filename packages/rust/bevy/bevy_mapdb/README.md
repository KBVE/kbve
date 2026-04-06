# bevy_mapdb

Proto-driven map definitions for Bevy games — compiles `mapdb.proto` into typed Rust structs with a searchable registry.

## Usage

```rust
use bevy::prelude::*;
use bevy_mapdb::{BevyMapDbPlugin, MapDb};

fn load_maps(mut commands: Commands) {
    let json = include_str!("path/to/mapdb.json");
    let db = MapDb::from_json(json).expect("Failed to parse map JSON");
    commands.insert_resource(db);
}
```

## Key Types

- `BevyMapDbPlugin` — main plugin entry point
- `MapDb` — searchable resource (`from_json()`, `from_bytes()`, `from_proto()`)
- `ProtoMapId` — typed map identifier

## License

MIT
