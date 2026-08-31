# bevy_behavior

Game-agnostic behavior tree engine. Composable nodes, tick-based cooldown tracking, and observation traits that drive NPCs across Minecraft, Bevy Isometric, Discord MUD, and Unity without game-specific coupling.

## Why

Most behavior tree crates assume a specific framework. `bevy_behavior` separates the **tree** (`BehaviorNode<O, A>` — pure logic) from the **runtime** (Bevy ECS, JNI, FFI). The same tree of nodes drives:

- a Java-side Minecraft NPC AI loop (via JNI),
- a Bevy isometric RTS,
- a Discord MUD bot,
- a Unity native plugin (via `csbindgen`).

Each game supplies its own observation snapshot and action enum; the tree never knows what game it's running in.

## Quick start

```rust
use bevy_behavior::{
    BehaviorNode, BehaviorContext, CooldownState, IsHealthLow, Flee, Selector,
    EntitySnapshot, Healthed, Positioned, Aware,
};

// 1. Your game's action type.
enum BattleAction {
    MoveTo { target: [f64; 3], speed: f64 },
    Attack { entity_id: u64 },
}

// 2. Your game's observation snapshot.
struct MyObs {
    pos: [f64; 3],
    hp: f32,
    nearby: Vec<EntitySnapshot>,
}

impl Positioned for MyObs { fn position(&self) -> [f64; 3] { self.pos } }
impl Healthed for MyObs {
    fn current_health(&self) -> f32 { self.hp }
    fn max_health(&self) -> f32 { 100.0 }
}
impl Aware for MyObs { fn nearby_entities(&self) -> &[EntitySnapshot] { &self.nearby } }

// 3. Compose a tree.
let tree: Box<dyn BehaviorNode<MyObs, BattleAction>> =
    Box::new(Selector {
        children: vec![
            // If hurt, flee from nearest hostile.
            Box::new(Flee {
                flee_distance: 8.0,
                make_move: |target, speed| BattleAction::MoveTo { target, speed },
            }),
        ],
    });

// 4. Evaluate per tick.
// let (status, actions) = tree.evaluate(&observation, &mut ctx);
```

## Surface

| Item                                                   | Purpose                                        |
| ------------------------------------------------------ | ---------------------------------------------- |
| [`BehaviorNode<O, A>`]                                 | Core trait — every tree node implements this   |
| [`Selector`] / [`Sequence`]                            | OR / AND composites                            |
| [`NodeStatus`]                                         | `Success` / `Failure` / `Running`              |
| [`BehaviorContext`]                                    | Per-tick mutable state (tick + cooldowns)      |
| [`CooldownState`] / [`TickCooldown`]                   | Game-agnostic cooldown trait + tick-based impl |
| [`Positioned`] / [`Healthed`] / [`Aware`] / [`Ticked`] | Observation traits                             |
| [`EntitySnapshot`]                                     | Minimal serialized snapshot of a nearby entity |

### Built-in leaves

| Leaf                                            | Requires `O:`           | Notes                             |
| ----------------------------------------------- | ----------------------- | --------------------------------- |
| `IsHealthLow { threshold }`                     | `Healthed`              | Pure condition                    |
| `HasHostileNearby`                              | `Aware`                 | Pure condition                    |
| `Wander { radius, make_move }`                  | `Positioned` + `Ticked` | Deterministic per tick            |
| `Flee { flee_distance, make_move }`             | `Positioned` + `Aware`  | Sprints away from nearest hostile |
| `AttackNearest { range, make_attack }`          | `Positioned` + `Aware`  | Engages nearest hostile in range  |
| `CallAllies { health_threshold, make_actions }` | `Healthed` + `Aware`    | Cooldown-gated broadcast          |

## Features

| Feature | Effect                                                                   |
| ------- | ------------------------------------------------------------------------ |
| `bevy`  | Adds Bevy `Resource` / `Component` derives + future `BehaviorTreePlugin` |

The default feature set is **off** — pure Rust, zero framework dependency. Enable `bevy` only when running inside a Bevy ECS world.

## License

MIT

[`BehaviorNode<O, A>`]: https://docs.rs/bevy_behavior/latest/bevy_behavior/tree/trait.BehaviorNode.html
[`Selector`]: https://docs.rs/bevy_behavior/latest/bevy_behavior/tree/struct.Selector.html
[`Sequence`]: https://docs.rs/bevy_behavior/latest/bevy_behavior/tree/struct.Sequence.html
[`NodeStatus`]: https://docs.rs/bevy_behavior/latest/bevy_behavior/tree/enum.NodeStatus.html
[`BehaviorContext`]: https://docs.rs/bevy_behavior/latest/bevy_behavior/cooldown/struct.BehaviorContext.html
[`CooldownState`]: https://docs.rs/bevy_behavior/latest/bevy_behavior/cooldown/trait.CooldownState.html
[`TickCooldown`]: https://docs.rs/bevy_behavior/latest/bevy_behavior/cooldown/struct.TickCooldown.html
[`Positioned`]: https://docs.rs/bevy_behavior/latest/bevy_behavior/observation/trait.Positioned.html
[`Healthed`]: https://docs.rs/bevy_behavior/latest/bevy_behavior/observation/trait.Healthed.html
[`Aware`]: https://docs.rs/bevy_behavior/latest/bevy_behavior/observation/trait.Aware.html
[`Ticked`]: https://docs.rs/bevy_behavior/latest/bevy_behavior/observation/trait.Ticked.html
[`EntitySnapshot`]: https://docs.rs/bevy_behavior/latest/bevy_behavior/observation/struct.EntitySnapshot.html
