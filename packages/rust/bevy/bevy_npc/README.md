# bevy_npc

Proto-driven NPC definitions for Bevy games.

Compiles `npcdb.proto` into typed Rust structs via `prost` and wraps them in a searchable `NpcDb` Bevy resource. Game-agnostic — any game can load the same proto NPC registry and query it by slug, ULID, type flags, rarity, or creature family.

## Usage

### Loading from JSON

```rust
use bevy::prelude::*;
use bevy_npc::{BevyNpcPlugin, NpcDb};

fn load_npcs(mut commands: Commands) {
    let json = include_str!("path/to/npcdb.json");
    let db = NpcDb::from_json(json).expect("Failed to parse NPC JSON");
    commands.insert_resource(db);
}
```

### Loading from proto binary

```rust
let bytes = include_bytes!("path/to/npcs.binpb");
let db = NpcDb::from_bytes(bytes).expect("Failed to decode NPC registry");
```

## Features

| Feature    | Description                                                                                                                                                                                   |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `creature` | Game-agnostic ECS components for creature pooling, capture, and interaction. Enables `CreaturePoolIndex`, `CreatureState`, `CapturedCreatures`, `CreatureCaptureEvent`, and `CreaturePlugin`. |

## License

MIT
