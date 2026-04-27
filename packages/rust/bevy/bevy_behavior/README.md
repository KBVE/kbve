# bevy_behavior

Game-agnostic behavior tree engine. Provides composite nodes (`Selector`, `Sequence`), a cooldown system, and observation traits that drive NPCs across Minecraft, Bevy Isometric, Discord MUD, and Unity without game-specific coupling.

## Usage

```rust
use bevy_behavior::{BehaviorContext, BehaviorNode, NodeStatus, Selector, Sequence};

// Game implements Positioned/Healthed/Aware on its observation type;
// composes nodes that read from O and emit Action enums.
```

## Key Types

- `BehaviorNode<O, A, C>` — generic tree node trait
- `Selector` / `Sequence` — composite nodes
- `BehaviorContext` / `CooldownState` / `TickCooldown` — runtime context
- `Positioned` / `Healthed` / `Aware` / `Ticked` — observation traits

## Features

| Feature | Description                                                       |
| ------- | ----------------------------------------------------------------- |
| `bevy`  | Adds `Resource`/`Component` derives + future `BehaviorTreePlugin` |

## License

MIT
