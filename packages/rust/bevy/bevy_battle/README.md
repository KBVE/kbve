# bevy_battle

Generic Bevy turn-based battle plugin with damage, effects, class procs, and enemy AI.

## Usage

```rust
use bevy::prelude::*;
use bevy_battle::BevyBattlePlugin;

fn main() {
    App::new()
        .add_plugins(BevyBattlePlugin)
        .run();
}
```

## Key Types

- `BevyBattlePlugin` — main plugin entry point
- `CombatModifiers` — resource for global combat tuning
- `BattleRng` — seeded RNG resource for deterministic battles

## License

MIT
