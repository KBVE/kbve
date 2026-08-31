# bevy_player

Bevy kinematic character controller with Avian3D physics — gravity, jump, collision-aware movement, and fall damage.

## Usage

```rust
use bevy::prelude::*;
use bevy_player::{PlayerPlugin, PlayerConfig};

fn main() {
    App::new()
        .add_plugins(PlayerPlugin::new(PlayerConfig::default()))
        .run();
}
```

## Key Types

- `PlayerPlugin::new(PlayerConfig)` — main plugin entry point
- `PlayerConfig` — speed, gravity, jump velocity tuning
- `Player` / `PlayerPhysics` — ECS components
- `DirectionMap` — input-to-direction mapping
- `FallDamageEvent` — emitted on hard landings
- `spawn_player_entity()` — helper to spawn a fully configured player

## License

MIT
