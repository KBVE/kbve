# Q Crate Audit & Improvement Plan (v3)

> Audit date: 2026-02-24
> Crate: q v0.1.1 | edition 2024 | Rust 1.85+ | cdylib (GDExtension)
> Files: 30 source files across 7 modules (~2,500+ lines)

---

## Audit Summary

The v2 refactor (dependency swap, folder restructure, core ECS, actor/worker threading, platform consolidation) has been **successfully completed**. The crate is well-organized and follows the planned architecture. This audit identifies the next wave of improvements: bugs, dead code, missing functionality, and hardening.

---

## Section 1: Bugs

### 1.1 `UserData::new()` ignores volume parameters

**File:** `src/data/user_data.rs:37-39`
**Severity:** Medium

```rust
// Constructor receives volume params but always sets 0.0
pub fn new(..., global_music_volume: f32, global_effects_volume: f32, global_sfx_volume: f32) -> Self {
    Self {
        ...
        global_music_volume: 0.0,    // BUG: ignores parameter
        global_effects_volume: 0.0,  // BUG: ignores parameter
        global_sfx_volume: 0.0,      // BUG: ignores parameter
    }
}
```

**Fix:** Use the passed parameters.

### 1.2 `UpdatePosition` loses hex coordinates

**File:** `src/core/actor.rs:68-74`
**Severity:** Medium

```rust
GameRequest::UpdatePosition { id, x, y } => {
    let transform = Transform { q: 0, r: 0, x, y }; // BUG: always resets q/r to 0
    ...
}
```

**Fix:** Fetch existing transform first, preserve q/r, or include q/r in the request.

### 1.3 NPCEntity `update_behavior` uses exact match on bitflags

**File:** `src/entity/npc_entity.rs:57-67`
**Severity:** Medium

```rust
// NPCState is bitflags — multiple states can be set simultaneously.
// This match only works if EXACTLY one flag is set.
match self.data.get_state() {
    NPCState::IDLE => self.handle_idle(),
    ...
}
```

**Fix:** Use `contains()` checks with priority ordering instead of direct match.

### 1.4 Player diagonal movement is faster

**File:** `src/entity/player_entity.rs:74-78`
**Severity:** Low

```rust
if direction.length() > 0.0 {
    self.data.set_velocity(direction * self.speed); // Not normalized!
}
```

**Fix:** Normalize direction before multiplying by speed: `direction.normalized() * self.speed`.

### 1.5 `abstract_data_map` `from_variant_map` can panic

**File:** `src/data/abstract_data_map.rs:39`
**Severity:** Low

```rust
Value::Number(serde_json::Number::from_f64(f as f64).unwrap()) // panics on NaN/Infinity
```

**Fix:** Use `unwrap_or` with a fallback or filter NaN values.

---

## Section 2: Dead Code & Incomplete Features

### 2.1 `EntityManager` fields never used

**File:** `src/manager/entity_manager.rs:13-14`

- `active_npcs: Vec<Gd<NPCEntity>>` — allocated but never populated
- `npc_pool: DashMap<String, Gd<NPCEntity>>` — allocated but never populated

**Action:** Either implement NPC management or remove the fields.

### 2.2 `get_res_response` never called

**File:** `src/platform/browser.rs:169-207`

Custom protocol response handler is defined but never registered with the WebView builder.

**Action:** Wire it up via `.with_custom_protocol()` or remove.

### 2.3 `open_url` does nothing on native

**File:** `src/manager/browser_manager.rs:105-117`

Logs a message but never navigates the webview.

**Action:** Call `webview.load_url()` or `webview.evaluate_script()` to actually navigate.

### 2.4 `play_sfx` handler missing

**File:** `src/manager/music_manager.rs`

`request_play_sfx` emits `sfx_play_requested` and the signal is connected to `play_sfx`, but no `#[func] pub fn play_sfx` method exists.

**Action:** Implement `play_sfx` mirroring `play_effect`.

### 2.5 `UxUiElement` / `MenuButtonData` potentially unused

**File:** `src/data/uxui_data.rs`

Not referenced from any manager or entity.

**Action:** Verify usage from GDScript side; if unused, remove.

### 2.6 `ResourceCache::get_arc` unnecessary

**File:** `src/data/cache.rs:26-30`

Wraps `Gd<T>` in `Arc`, but `Gd<T>` is already reference-counted.

**Action:** Remove or document why Arc wrapping is needed.

### 2.7 Save/load methods not exposed to GDScript

**Files:** `src/entity/player_entity.rs:94-107`, `src/entity/npc_entity.rs:119-132`

`save_player_data`, `load_player_data`, `save_npc_data`, `load_npc_data` lack `#[func]`.

**Action:** Add `#[func]` attribute to make them callable from GDScript.

### 2.8 `GameManager::init()` dead code

**File:** `src/manager/game_manager.rs:34-38`

```rust
let user_data_cache = Some(UserDataCache::new());
if user_data_cache.is_none() { // Always false — just assigned Some(...)
    godot_error!("...");
}
```

**Action:** Remove the dead check.

### 2.9 Commented-out code in `GameManager`

**File:** `src/manager/game_manager.rs:106-108, 123-126`

References to `Maiky` / `ui_manager` that no longer exist.

**Action:** Remove commented code.

---

## Section 3: Structural Improvements

### 3.1 Two disconnected entity systems

**Problem:** `core/ecs::EntityStore` (ULID-keyed DashMap) and `entity/` (GodotClass nodes) operate independently. Spawning via EventBridge doesn't create Godot scene nodes; PlayerEntity/NPCEntity don't register in EntityStore.

**Recommendation:** Bridge them — when EntityStore spawns an entity, emit a signal that EntityManager listens to for creating the corresponding Godot node. When a Godot entity moves, push updates to EntityStore.

### 3.2 Actor thread has no graceful shutdown

**File:** `src/core/actor.rs:30-31`

The actor runs `loop { ... }` forever with no exit condition.

**Recommendation:** Add a shutdown variant to `GameRequest` or use an `AtomicBool` flag. Clean up on `on_level_deinit`.

### 3.3 Hardcoded actor tick rate

**File:** `src/core/actor.rs:32`

`thread::sleep(Duration::from_millis(16))` is fixed at ~60 ticks/sec.

**Recommendation:** Make configurable via constant or init parameter.

### 3.4 String-based request routing in EventBridge

**File:** `src/core/bridge.rs:66-84`

`send_request` parses comma-separated strings. Fragile and not type-safe.

**Recommendation:** Consider accepting a `Dictionary` from GDScript, or at least use JSON parsing for the payload.

### 3.5 MusicManager tight coupling to GameManager

**File:** `src/manager/music_manager.rs:38-49`

MusicManager casts its parent to GameManager to access cache. If re-parented or used standalone, it panics.

**Recommendation:** Accept cache via dependency injection (constructor param or signal) rather than parent casting.

### 3.6 `blend_music` doesn't actually blend

**File:** `src/manager/music_manager.rs:294-349`

Sets idle player to -80dB, starts it, waits for timer, then swaps. No volume interpolation — it's a hard crossfade, not a blend.

**Recommendation:** Implement proper volume interpolation during the blend duration using process() ticks.

### 3.7 `find_game_manager!` macro fragility

**File:** `src/macros.rs:12-42`

Assumes parent node is always a GameManager. If the scene tree changes, it silently fails.

**Recommendation:** Walk up the tree or use Godot's group system (`get_tree().get_first_node_in_group("game_manager")`).

---

## Section 4: Code Quality

### 4.1 Excessive logging

Many `godot_print!` calls in hot paths and init functions. Production builds should be quieter.

**Recommendation:** Use `#[cfg(debug_assertions)]` guards or a log-level system.

### 4.2 `Cargo.toml` repository URL incorrect

```toml
repository = "https://github.com/KBVE/kbve/tree/main/packages/erust"
```

Should be `packages/rust/q`.

### 4.3 Missing `Default` impls

- `EntityStore` — should derive/impl `Default`
- `UserData` — should derive `Default`

### 4.4 Missing `#[must_use]` on pure functions

Functions like `entity_count()`, `get_transform()`, `get_stats()` return values that should not be silently discarded.

### 4.5 `RuntimeManager` uses `Rc<Runtime>` (not `Send`)

**File:** `src/threads/runtime.rs:29`

If RuntimeManager is ever accessed from a non-main thread, this would panic. Consider `Arc<Runtime>`.

### 4.6 Duplicate trait methods in UI extensions

**File:** `src/extensions/ui_extension.rs`

`with_name`, `with_cache`, `with_anchors_preset`, `with_anchor_and_offset`, `with_custom_minimum_size` are duplicated across `ControlExt`, `ButtonExt`, `CanvasLayerExt`.

**Recommendation:** Use a macro to generate common methods or extract a shared trait.

---

## Section 5: Missing Features

### 5.1 No unit tests

Zero `#[cfg(test)]` modules in the entire crate. The `test` target in project.json exists but has nothing to run.

**Recommendation:** Add tests for at minimum:

- `EntityStore` CRUD operations
- `AbstractDataMap` serialization roundtrip
- `GameEvent`/`GameRequest` creation
- Vector serde helpers

### 5.2 No entity iteration / query API

`EntityStore` can get single entities but has no `iter()`, `all_ids()`, or filtered query beyond `entities_in_range`.

**Recommendation:** Add `all_entity_ids() -> Vec<EntityId>` and possibly a query builder.

### 5.3 No bulk operations

No `spawn_many()`, `despawn_many()`, or batch update methods.

**Recommendation:** Add batch methods that reduce lock contention on DashMap.

### 5.4 `UpdatePosition` not routed in `send_request`

**File:** `src/core/bridge.rs:66-84`

Only `spawn_entity` and `despawn_entity` are explicitly handled. `update_position` falls through to `Custom`.

**Recommendation:** Add explicit routing for `update_position`.

### 5.5 Linux platform support

Platform module only handles macOS and Windows. Linux is unaddressed (no transparency, no wry browser).

**Recommendation:** Add `linux.rs` with X11/Wayland support if Linux is a target.

---

## Section 6: Dependency Updates to Investigate

| Dependency          | Current | Action                                                                 |
| ------------------- | ------- | ---------------------------------------------------------------------- |
| `godot`             | 0.3.5   | Check for 0.4.x releases (gdext moves fast)                            |
| `wry`               | 0.53.5  | Check for newer releases                                               |
| `objc2`             | 0.6.3   | Check for newer releases; migrate from deprecated `msg_send!`/`class!` |
| `windows`           | 0.62    | Check for newer releases                                               |
| `tokio`             | 1.49    | Check latest 1.x                                                       |
| `crossbeam-channel` | 0.5     | Pin to specific minor (e.g., 0.5.14)                                   |
| `dashmap`           | 6.1.0   | Appears current                                                        |
| `ulid`              | 1.2.1   | Appears current                                                        |

---

## Proposed Execution Priority

| Priority | Item                                    | Section  | Effort  |
| -------- | --------------------------------------- | -------- | ------- |
| P0       | Fix `UserData::new()` volume bug        | 1.1      | Trivial |
| P0       | Fix `UpdatePosition` losing hex coords  | 1.2      | Small   |
| P0       | Fix NPCEntity bitflags match            | 1.3      | Small   |
| P0       | Implement `play_sfx` handler            | 2.4      | Small   |
| P1       | Fix diagonal movement normalization     | 1.4      | Trivial |
| P1       | Add `#[func]` to save/load methods      | 2.7      | Trivial |
| P1       | Clean dead code (GameManager, comments) | 2.8, 2.9 | Trivial |
| P1       | Add `update_position` routing in bridge | 5.4      | Small   |
| P1       | Fix `Cargo.toml` repository URL         | 4.2      | Trivial |
| P2       | Bridge ECS and Godot entities           | 3.1      | Large   |
| P2       | Actor graceful shutdown                 | 3.2      | Medium  |
| P2       | Add unit tests                          | 5.1      | Medium  |
| P2       | Structured request payloads (JSON/Dict) | 3.4      | Medium  |
| P3       | Decouple MusicManager from GameManager  | 3.5      | Medium  |
| P3       | Real blend_music interpolation          | 3.6      | Medium  |
| P3       | Entity iteration/query API              | 5.2      | Medium  |
| P3       | Reduce logging verbosity                | 4.1      | Small   |
| P3       | UI extension macro dedup                | 4.6      | Small   |
| P4       | Linux platform support                  | 5.5      | Large   |
| P4       | Dependency version bumps                | 6        | Medium  |
| P4       | Wire `get_res_response` or remove       | 2.2      | Small   |
| P4       | Implement `open_url` navigation         | 2.3      | Small   |

---

## v2 Plan Reference (Completed)

The original v2 plan phases (dependency swap, folder restructure, core ECS, actor/worker threading, platform consolidation, lib.rs entry point) have all been executed. The current codebase reflects that completed work. This v3 plan builds on top of the v2 foundation.
