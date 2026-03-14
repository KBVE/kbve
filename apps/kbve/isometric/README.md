# @kbve/isometric

KBVE isometric multiplayer game built with **Bevy 0.18**, **lightyear** (networking), and **avian3d** (physics). Dual-target: runs as a **WASM web app** (WebGPU) and a **Tauri 2 desktop app**.

License: <https://kbve.com/legal/>

## Project Layout

```
apps/kbve/isometric/
├── src-tauri/                 # Rust crate (isometric-game)
│   ├── src/
│   │   ├── lib.rs             # WASM entry point (wasm_main)
│   │   ├── main.rs            # Tauri desktop entry point
│   │   ├── commands.rs        # WASM-exported functions (JS bridge)
│   │   └── game/              # All game logic (see modules below)
│   │       └── mod.rs         # GamePluginGroup — registers all plugins
│   └── Cargo.toml
├── src/                       # Frontend (React + TypeScript)
├── public/                    # Static assets
├── package.json               # Node scripts (build:wasm, dev, build)
├── project.json               # Nx targets
├── vite.config.ts
└── wasm-pkg/                  # wasm-pack output (gitignored)
```

## Game Modules

All game logic lives in `src-tauri/src/game/`. The `GamePluginGroup` in `mod.rs` registers these plugins (order matters for dependencies):

| Module             | Plugin                      | Purpose                                                                        |
| ------------------ | --------------------------- | ------------------------------------------------------------------------------ |
| `net`              | `NetPlugin`                 | Lightyear client setup, server connection, player replication, username labels |
| `state`            | `GameStatePlugin`           | App state machine (Loading, InGame, etc.)                                      |
| `terrain`          | `TerrainPlugin`             | Ground mesh generation                                                         |
| `camera`           | `IsometricCameraPlugin`     | Isometric camera rig and controls                                              |
| `tilemap`          | `TilemapPlugin`             | Tile-based map rendering                                                       |
| `player`           | `PlayerPlugin`              | Local player spawning, movement, jump physics, input handling                  |
| `object_registry`  | `ObjectRegistryPlugin`      | Shared object type registry                                                    |
| `scene_objects`    | `SceneObjectsPlugin`        | Placeable world objects                                                        |
| `trees`            | `TreesPlugin`               | Tree generation and rendering                                                  |
| `water`            | `WaterPlugin`               | Water tiles and effects                                                        |
| `inventory`        | `InventoryPlugin<ItemKind>` | 16-slot inventory system                                                       |
| `weather`          | `WeatherPlugin`             | Weather effects                                                                |
| `creatures`        | `CreaturesPlugin`           | NPC/mob spawning and AI (has submodules)                                       |
| `virtual_joystick` | `VirtualJoystickPlugin`     | Touch/mobile joystick input                                                    |
| `orb_hud`          | `OrbHudPlugin`              | Health/mana orb HUD                                                            |
| `actions`          | `ActionsPlugin`             | Player action system                                                           |
| `pixelate`         | `PixelatePlugin`            | Pixel-art post-processing shader                                               |

Additional modules without plugins: `grass`, `mushrooms`, `rocks`, `input_bridge`.

## Networking Architecture

- **Protocol crate**: `packages/rust/bevy/bevy_kbve_net` — shared types between client and server
- **Server**: `apps/kbve/axum-kbve/src/gameserver/` — Bevy headless + lightyear server, runs inside axum via `std::thread::spawn`
- **Replication**: lightyear handles component replication (`PlayerPosition`, `PlayerId`, `PlayerName`, etc.) with prediction and interpolation
- **Auth flow**: JWT token → `AuthMessage` → server validates → spawns replicated player entity
- **Profile bridge**: Async channel (`std::sync::mpsc`) bridges Bevy (sync) and tokio (async) for database lookups (username, profiles)
- **Player IDs**: FNV-1a hash of user identity string for stable IDs across sessions

## Local Crate Dependencies

- `bevy_inventory` — `packages/rust/bevy/bevy_inventory`
- `bevy_cam` — `packages/rust/bevy/bevy_cam`
- `bevy_kbve_net` — `packages/rust/bevy/bevy_kbve_net` (protocol, shared types)

## Build & Run

All commands use Nx from the monorepo root (`./kbve.sh -nx` or `pnpm nx`):

| Command                        | What it does                                                       |
| ------------------------------ | ------------------------------------------------------------------ |
| `nx run isometric:dev`         | WASM build (debug) + vite dev server on :1420                      |
| `nx run isometric:quick`       | WASM (dev) + axum gameserver + vite dev (full local stack)         |
| `nx run isometric:build`       | Release WASM build + tsc + vite production build                   |
| `nx run isometric:deploy`      | Build then copy `dist/` → `apps/kbve/astro-kbve/public/isometric/` |
| `nx run isometric:build:tauri` | Tauri desktop build                                                |

### Manual WASM build

```sh
cd apps/kbve/isometric/src-tauri
wasm-pack build --target web --out-dir ../wasm-pkg --out-name isometric_game
```

## Key Technical Notes

- **Bevy 0.18 events**: Uses `Commands::trigger()` + `app.add_observer()` (not EventReader/EventWriter)
- **WASM canvas**: Renders to `#bevy-canvas` element, `fit_canvas_to_parent: true`
- **Physics**: avian3d 0.5 with f32 precision
- **Cargo package name**: `isometric-game` (hyphen, not underscore)
- **Crate lib name**: `isometric_game` (underscore, for wasm-pack)
