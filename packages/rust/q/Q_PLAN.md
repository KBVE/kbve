# Q Crate Refactor Plan (v2)

## Goal

Refactor Q into a clean, game-agnostic Godot-Rust GDExtension library that provides:

- Lightweight custom ECS (no bevy_ecs)
- Lock-free actor/worker threading (crossbeam channels, WASM-safe)
- DashMap-backed concurrent data structures (replacing papaya)
- Platform-gated native features (wry, tokio) only where needed

Reference implementation: `cityvote/rust/` (proven patterns running in production)

---

## Phase 1: Dependency Swap

**Drop:**

- `bevy_ecs` (0.15.1) — heavy, pulls massive dep tree, only used for basic Transform/TileType storage
- `papaya` (0.2.3) — replace with dashmap for consistency with cityvote
- `rstar` (0.12.2) — spatial indexing not needed in core lib (game-specific)

**Add:**

- `dashmap` (6.1.0) — concurrent hashmap, WASM-safe, cityvote-proven
- `crossbeam-channel` (0.5) — lock-free MPMC channels, WASM-safe via emscripten pthreads
- `ulid` (1.2.1) — entity IDs (same as cityvote)

**Keep:**

- `godot` (0.3.5), `rand` (0.10.0), `serde`/`serde_json`, `bitflags`
- `tokio` (macOS/Windows only), `wry`, `objc2`, `windows`, `http`, `infer`
- `raw-window-handle`

**Cargo.toml changes:**

```toml
[dependencies]
rand = "0.10.0"
godot = { version = "0.3.5", features = ["experimental-wasm", "experimental-threads"] }
dashmap = "6.1.0"
crossbeam-channel = "0.5"
ulid = "1.2.1"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
bitflags = { version = "2.9.0", features = ["serde"] }
```

---

## Phase 2: Folder Restructure

### Current layout (28 files, ~3,377 lines)

```
src/
├── lib.rs
├── macros.rs
├── data/           # cache, player_data, npc_data, user_data, etc.
├── entity/         # player_entity, npc_entity
├── extensions/     # ecs_extension, wry_extension, ui_extension, timer_extension
├── manager/        # game_manager, music_manager, gui_manager, browser_manager, etc.
├── threads/        # runtime.rs (tokio), asyncnode.rs
├── macos/          # macos_gui_options, macos_wry_browser_options
└── windows/        # windows_gui_options, windows_wry_browser_options
```

### New layout

```
src/
├── lib.rs                      # GDExtension entry, module declarations, singleton registration
├── macros.rs                   # Shared macros
│
├── core/
│   ├── mod.rs
│   ├── ecs.rs                  # Lightweight DashMap-backed ECS (entity storage, components, queries)
│   ├── event.rs                # GameEvent / GameRequest enums (generic, game-agnostic)
│   ├── bridge.rs               # UnifiedEventBridge — Godot <-> Rust channel bridge node
│   └── actor.rs                # Actor coordinator — owns state, dispatches to workers
│
├── threads/
│   ├── mod.rs
│   ├── worker.rs               # crossbeam worker pool (all platforms, WASM-safe)
│   └── runtime.rs              # tokio runtime (cfg native-only, for wry/networking)
│
├── manager/
│   ├── mod.rs
│   ├── game_manager.rs         # Central hub node (children: music, cache, gui, etc.)
│   ├── music_manager.rs        # Audio playback, blending, volume
│   ├── cache_manager.rs        # Texture/audio cache (extracted from data/cache.rs)
│   └── gui_manager.rs          # UI framework node
│
├── entity/
│   ├── mod.rs
│   ├── player.rs               # PlayerEntity GodotClass
│   └── npc.rs                  # NPCEntity GodotClass
│
├── data/
│   ├── mod.rs
│   ├── abstract_data_map.rs    # Trait for serializable data
│   ├── player_data.rs          # Player state
│   ├── npc_data.rs             # NPC state
│   └── user_data.rs            # User/profile data
│
├── platform/
│   ├── mod.rs                  # cfg-gated re-exports
│   ├── browser.rs              # GodotBrowser (wry WebView, shared logic)
│   ├── macos.rs                # macOS wry options + gui options (merged)
│   └── windows.rs              # Windows wry options + gui options (merged)
│
└── extensions/
    ├── mod.rs
    ├── timer.rs                # ClockMaster / frame timing
    └── ui.rs                   # UI helpers
```

### Files removed

- `extensions/ecs_extension.rs` — replaced by `core/ecs.rs`
- `extensions/wry_extension.rs` — moved to `platform/browser.rs`
- `extensions/gui_manager_extension.rs` — merged into `manager/gui_manager.rs`
- `threads/asyncnode.rs` — replaced by `core/bridge.rs` (crossbeam polling)
- `data/cache.rs` — promoted to `manager/cache_manager.rs`
- `data/gui_data.rs` — empty, delete
- `data/uxui_data.rs` — merge into `extensions/ui.rs` if needed
- `data/shader_data.rs` — merge into `manager/cache_manager.rs` if needed
- `data/vector_data.rs` — inline into `data/mod.rs` or `core/ecs.rs`
- `manager/ecs_manager.rs` — replaced by `core/ecs.rs` + `core/bridge.rs`
- `manager/entity_manager.rs` — replaced by `core/ecs.rs`
- `manager/browser_manager.rs` — moved to `platform/browser.rs`
- `macos/macos_gui_options.rs` + `macos/macos_wry_browser_options.rs` — merged into `platform/macos.rs`
- `windows/windows_gui_options.rs` + `windows/windows_wry_browser_options.rs` — merged into `platform/windows.rs`

---

## Phase 3: Core ECS (replacing bevy_ecs)

Lightweight, DashMap-backed entity-component storage. No systems/schedules — just data + queries.

### Design (modeled from cityvote's EntityData/EntityStats)

```rust
// core/ecs.rs

pub type EntityId = Vec<u8>; // ULID bytes

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Transform {
    pub q: i32,        // hex column
    pub r: i32,        // hex row
    pub x: f32,        // world x
    pub y: f32,        // world y
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EntityStats {
    pub hp: f32,
    pub max_hp: f32,
    pub attack: f32,
    pub defense: f32,
    pub speed: f32,
    // extensible via bitflags or additional fields
}

pub struct EntityStore {
    transforms: DashMap<EntityId, Transform>,
    stats: DashMap<EntityId, EntityStats>,
    states: DashMap<EntityId, u32>,  // bitflags
    // Additional component maps added as needed
}

impl EntityStore {
    pub fn spawn(&self, id: EntityId, transform: Transform, stats: EntityStats) { ... }
    pub fn despawn(&self, id: &EntityId) { ... }
    pub fn get_transform(&self, id: &EntityId) -> Option<Transform> { ... }
    pub fn get_stats(&self, id: &EntityId) -> Option<EntityStats> { ... }
    pub fn update_transform(&self, id: &EntityId, transform: Transform) { ... }
    pub fn entities_in_range(&self, center: (i32, i32), radius: i32) -> Vec<EntityId> { ... }
}
```

No world, no archetype storage, no system scheduler. Just typed DashMaps. Games add their own component maps by wrapping EntityStore.

---

## Phase 4: Actor + Worker Threading

Port cityvote's actor-coordinator pattern into a game-agnostic form.

### Actor (core/actor.rs)

```rust
pub struct Actor {
    entity_store: Arc<EntityStore>,
    request_rx: Receiver<GameRequest>,
    event_tx: Sender<GameEvent>,
    // Worker channels (game-specific workers register themselves)
}

impl Actor {
    pub fn spawn(request_rx: Receiver<GameRequest>, event_tx: Sender<GameEvent>) -> JoinHandle<()> {
        std::thread::spawn(move || {
            let mut actor = Actor::new(request_rx, event_tx);
            loop {
                actor.tick();
                std::thread::sleep(Duration::from_millis(16)); // ~60 ticks/sec
            }
        })
    }

    fn tick(&mut self) {
        // Drain requests, dispatch to workers, collect results, emit events
    }
}
```

### Bridge (core/bridge.rs)

```rust
// Replaces asyncnode.rs — no tokio needed

static CHANNELS: Lazy<Channels> = Lazy::new(|| {
    let (req_tx, req_rx) = crossbeam_channel::unbounded();
    let (evt_tx, evt_rx) = crossbeam_channel::unbounded();
    Actor::spawn(req_rx, evt_tx);
    Channels { req_tx, evt_rx }
});

#[derive(GodotClass)]
#[class(base = Node)]
pub struct EventBridge { ... }

#[godot_api]
impl INode for EventBridge {
    fn process(&mut self, _delta: f64) {
        // Non-blocking try_recv() loop, emit Godot signals
        while let Ok(event) = CHANNELS.evt_rx.try_recv() {
            self.emit_event(event);
        }
    }
}
```

### Worker Pool (threads/worker.rs)

```rust
pub fn spawn_worker<Req, Resp>(
    name: &str,
    rx: Receiver<Req>,
    tx: Sender<Resp>,
    handler: impl Fn(Req) -> Resp + Send + 'static,
) -> JoinHandle<()> {
    std::thread::spawn(move || {
        while let Ok(request) = rx.recv() {
            let _ = tx.send(handler(request));
        }
    })
}
```

Generic worker spawner. Games define their own request/response types and handler functions.

---

## Phase 5: Platform Consolidation

### platform/mod.rs

```rust
#[cfg(target_os = "macos")]
pub mod macos;

#[cfg(target_os = "windows")]
pub mod windows;

#[cfg(any(target_os = "macos", target_os = "windows"))]
pub mod browser;
```

Merge the 4 separate macos/windows files into 2 (one per platform). The GodotBrowser node in `platform/browser.rs` contains the shared wry logic.

### threads/runtime.rs

Keep tokio runtime behind cfg:

```rust
#[cfg(any(target_os = "macos", target_os = "windows"))]
pub struct RuntimeManager { ... }
```

Only used for wry webview and native networking. Game logic never touches tokio.

---

## Phase 6: lib.rs Entry Point

```rust
mod core;
mod threads;
mod manager;
mod entity;
mod data;
mod extensions;
mod macros;

#[cfg(any(target_os = "macos", target_os = "windows"))]
mod platform;

struct Q;

#[gdextension]
unsafe impl ExtensionLibrary for Q {
    fn on_level_init(level: InitLevel) {
        if level == InitLevel::Scene {
            // Register RuntimeManager singleton (native only)
            // EventBridge auto-spawns actor on first use (lazy)
        }
    }
}
```

---

## Execution Order

| Step | What                                                                                   | Risk | Notes                                  |
| ---- | -------------------------------------------------------------------------------------- | ---- | -------------------------------------- |
| 1    | Update Cargo.toml (add dashmap, crossbeam-channel, ulid; drop bevy_ecs, papaya, rstar) | Low  | Dep swap only                          |
| 2    | Create `core/ecs.rs` with EntityStore                                                  | Low  | New file, no breaking changes          |
| 3    | Create `core/event.rs` with GameEvent/GameRequest enums                                | Low  | New file                               |
| 4    | Create `core/actor.rs` with Actor coordinator                                          | Low  | New file                               |
| 5    | Create `core/bridge.rs` with EventBridge node                                          | Med  | Replaces asyncnode.rs                  |
| 6    | Create `threads/worker.rs` with generic worker spawner                                 | Low  | New file                               |
| 7    | Migrate `extensions/ecs_extension.rs` → use core/ecs.rs                                | Med  | Rewrite ecs_manager to use EntityStore |
| 8    | Migrate platform files (merge macos/windows into platform/)                            | Low  | File moves + merges                    |
| 9    | Clean up manager/ (extract cache_manager, remove entity_manager)                       | Low  | Reorganization                         |
| 10   | Update lib.rs module declarations                                                      | Low  | Wire everything together               |
| 11   | Delete dead files                                                                      | Low  | Cleanup                                |
| 12   | cargo check                                                                            | —    | Verify compilation                     |
| 13   | rustfmt                                                                                | —    | Pass lint-staged                       |

---

## Dependency Comparison

| Dep               | Current Q       | After Refactor  | CityVote                    |
| ----------------- | --------------- | --------------- | --------------------------- |
| godot             | 0.3.5           | 0.3.5           | 0.3.5                       |
| bevy_ecs          | 0.15.1          | **removed**     | not used                    |
| papaya            | 0.2.3           | **removed**     | 0.2.3 (keeping in cityvote) |
| rstar             | 0.12.2          | **removed**     | not used                    |
| dashmap           | —               | **6.1.0**       | 6.1.0                       |
| crossbeam-channel | —               | **0.5**         | 0.5                         |
| ulid              | —               | **1.2.1**       | 1.2.1                       |
| rand              | 0.10.0          | 0.10.0          | 0.9.2                       |
| tokio             | 1.49 (native)   | 1.49 (native)   | 1.43 (native)               |
| wry               | 0.53.5 (native) | 0.53.5 (native) | 0.53.5 (native)             |
| windows           | 0.62            | 0.62            | 0.59                        |

---

## What Q Is NOT

Q is a **library/framework**, not a game. It provides:

- ECS primitives (EntityStore, components, queries)
- Actor/worker threading infrastructure
- Godot bridge (EventBridge node, signal emission)
- Manager nodes (GameManager, MusicManager, CacheManager)
- Platform abstractions (wry browser, native window)

Games (like cityvote) build on top of Q by:

- Defining their own GameRequest/GameEvent variants
- Registering custom workers with the Actor
- Adding game-specific component maps to EntityStore
- Creating game-specific GodotClass nodes
