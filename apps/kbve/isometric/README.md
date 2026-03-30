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
│   │   ├── data/
│   │   │   └── itemdb.json    # Baked item database (generated)
│   │   └── game/              # All game logic (see modules below)
│   │       └── mod.rs         # GamePluginGroup — registers all plugins
│   └── Cargo.toml
├── scripts/
│   └── sync-itemdb.mjs        # Extracts itemdb from Astro MDX → JSON
├── certificates/              # WebTransport TLS certs (local dev)
├── src/                       # Frontend (React + TypeScript)
├── public/                    # Static assets
├── package.json               # Node scripts (build:wasm, dev, build)
├── project.json               # Nx targets
├── vite.config.ts
└── wasm-pkg/                  # wasm-pack output (gitignored)
```

## Game Modules

All game logic lives in `src-tauri/src/game/`. The `GamePluginGroup` in `mod.rs` registers these plugins (order matters for dependencies):

| Module             | Plugin                                          | Purpose                                                    |
| ------------------ | ----------------------------------------------- | ---------------------------------------------------------- |
| `phase`            | `PhasePlugin`                                   | Game phase state machine (Title, Connecting, InGame)       |
| `title_screen`     | `TitleScreenPlugin`                             | Title screen UI and Play Online button                     |
| `net`              | `NetPlugin`                                     | Lightyear client, WS/WT transport, auth flow, replication  |
| `state`            | `GameStatePlugin`                               | Player state tracking                                      |
| `terrain`          | `TerrainPlugin`                                 | Ground mesh generation                                     |
| `camera`           | `IsometricCameraPlugin`                         | Isometric camera rig and controls                          |
| `tilemap`          | `TilemapPlugin`                                 | Tile-based map rendering and collision                     |
| `player`           | `PlayerPlugin`                                  | Local player spawning, movement, jump physics, input       |
| `object_registry`  | `ObjectRegistryPlugin`                          | Shared object type registry                                |
| `scene_objects`    | `SceneObjectsPlugin`                            | World objects (rocks, flowers, mushrooms, trees)           |
| `trees`            | `TreesPlugin`                                   | Tree generation and rendering                              |
| `water`            | `WaterPlugin`                                   | Water tiles and effects                                    |
| `inventory`        | `BevyItemsPlugin` + `InventoryPlugin<ItemKind>` | Proto-driven item database + 16-slot inventory             |
| `weather`          | `WeatherPlugin`                                 | Weather effects, day/night cycle                           |
| `creatures`        | `CreaturesPlugin`                               | Creature spawning and AI (frogs, fireflies)                |
| `virtual_joystick` | `VirtualJoystickPlugin`                         | Touch/mobile joystick input                                |
| `orb_hud`          | `OrbHudPlugin`                                  | Health/mana orb HUD                                        |
| `actions`          | `ActionsPlugin`                                 | Player action dispatch (chop, mine, forage) with animation |
| `pixelate`         | `PixelatePlugin`                                | Pixel-art post-processing shader                           |

Additional modules without plugins: `grass`, `mushrooms`, `rocks`, `input_bridge`, `hover_bvh`, `ui_color`, `telemetry`, `client_profile`.

## Local Crate Dependencies

| Crate            | Path                                | Purpose                                               |
| ---------------- | ----------------------------------- | ----------------------------------------------------- |
| `bevy_inventory` | `packages/rust/bevy/bevy_inventory` | Slot-based inventory system                           |
| `bevy_items`     | `packages/rust/bevy/bevy_items`     | Proto-driven item database (with `inventory` feature) |
| `bevy_cam`       | `packages/rust/bevy/bevy_cam`       | Camera utilities                                      |
| `bevy_kbve_net`  | `packages/rust/bevy/bevy_kbve_net`  | Shared protocol types (with `npcdb` feature)          |
| `bevy_tasker`    | `packages/rust/bevy/bevy_tasker`    | Async task bridge                                     |

## Networking Architecture

- **Protocol crate**: `packages/rust/bevy/bevy_kbve_net` — shared types between client and server
- **Server**: `apps/kbve/axum-kbve/src/gameserver/` — Bevy headless + lightyear server, runs inside axum via `std::thread::spawn`
- **Transports**: WebSocket (`wss://`) primary, WebTransport (QUIC/UDP) when available
- **Auth flow**: JWT token → `AuthMessage` → server validates → spawns replicated player entity
- **Profile bridge**: Async channel (`std::sync::mpsc`) bridges Bevy (sync) and tokio (async) for database lookups
- **Player IDs**: FNV-1a hash of user identity string for stable IDs across sessions

## Item Database

Items are defined as MDX files in `apps/kbve/astro-kbve/src/content/docs/itemdb/` and baked into the binary at compile time via `include_str!()`.

To regenerate after adding or changing items:

```sh
node apps/kbve/isometric/scripts/sync-itemdb.mjs
```

This reads MDX frontmatter and writes `src-tauri/src/data/itemdb.json`.

## Build & Run

All commands use Nx from the monorepo root (`./kbve.sh -nx` or `pnpm nx`):

| Command                        | What it does                                                       |
| ------------------------------ | ------------------------------------------------------------------ |
| `nx run isometric:dev`         | WASM build (debug) + vite dev server on :1420                      |
| `nx run isometric:quick`       | WASM (dev) + axum gameserver + vite dev (full local stack)         |
| `nx run isometric:build`       | Release WASM build + tsc + vite production build                   |
| `nx run isometric:deploy`      | Build then copy `dist/` → `apps/kbve/astro-kbve/public/isometric/` |
| `nx run isometric:build:tauri` | Tauri desktop build                                                |

### Environment Variables

| Variable           | Default                   | Purpose                                 |
| ------------------ | ------------------------- | --------------------------------------- |
| `GAME_SERVER_URL`  | `wss://127.0.0.1:5000`    | Override WebSocket server URL           |
| `GAME_PRIVATE_KEY` | all zeros (dev)           | Hex-encoded 32-byte Netcode private key |
| `GAME_WT_DIGEST`   | `certificates/digest.txt` | Path to WebTransport cert digest file   |

### Connecting to production server (desktop)

```sh
GAME_SERVER_URL=wss://kbve.com/ws cargo run -p isometric-game
```

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
- **Item system**: `ProtoItemKind` from `bevy_items` — backed by baked `itemdb.json`
