# mmorpg

Batteries-included MMORPG toolkit for [Bevy](https://bevy.org).

Each subsystem is its own crate, so a game that wants character control and
nothing else compiles character control and nothing else. This crate is the
front door over all of them.

```toml
mmorpg = { version = "0.1", features = ["character", "npc", "items"] }
```

| feature | crates | what it gives you |
| --- | --- | --- |
| `character` | `bevy_player` | kinematic controller on Avian3D — gravity, jump, collide-and-slide |
| `camera` | `bevy_cam` | isometric follow camera with optional scroll zoom |
| `npc` | `bevy_npc`, `bevy_behavior` | proto-driven NPC registry + behavior trees |
| `items` | `bevy_items`, `bevy_inventory` | item database, equip slots, inventory containers |
| `progress` | `bevy_skills`, `bevy_quests` | skills, XP curves, quest registry |
| `combat` | `bevy_battle` | turn and snapshot combat primitives |
| `social` | `bevy_chat` | IRC-backed chat bridged into ECS events |
| `state` | `bevy_statemachine` | snapshot/restore over Bevy states |
| `net` | `mmorpg_net` | Lightyear protocol — replicated transforms, player input, netcode |

`full` enables all of them. Nothing is on by default.

## Usage

```rust,ignore
use bevy::prelude::*;
use mmorpg::prelude::*;

fn main() {
    App::new()
        .add_plugins(DefaultPlugins)
        .add_plugins(MmorpgPlugins)
        .run();
}
```

`MmorpgPlugins` carries every enabled subsystem that runs without
configuration. `ChatPlugin` needs an IRC endpoint, and `InventoryPlugin` and
`StateSnapshotPlugin` are generic over your own types, so those three are added
by hand.

## License

MIT
