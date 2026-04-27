# bevy_pathfinding

Grid-based flow field pathfinding and chokepoint detection. Pure Rust core with optional Bevy ECS integration.

## Layers

1. **`BlockGrid`** — 2D walkability grid with per-cell height + terrain cost.
2. **`FlowField`** — BFS-computed direction vectors pointing every walkable cell at one or more goals. Agents share a goal and look up moves in O(1) instead of running per-agent A\*.
3. **`FlowGate`** — narrow-passage detector. Useful for ambush AI, territory control, and patrol route generation.

## Usage

```rust
use bevy_pathfinding::{grid::BlockGrid, flow_field::FlowField};

let grid = BlockGrid::new(width, height);
let field = FlowField::compute(&grid, &[goal]);
```

## Features

| Feature | Description                                 |
| ------- | ------------------------------------------- |
| `bevy`  | Adds `Resource` derives for ECS integration |

## License

MIT
