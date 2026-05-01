# bevy_tasker

Cross-platform async task spawning for Bevy. One API across desktop and WASM (with or without atomics) so game code stays target-agnostic.

## Why

Bevy ships its own task pools, but they assume desktop threading semantics that don't translate cleanly to single-threaded or atomics-WASM browser builds. `bevy_tasker` papers over the difference:

- **Desktop** → crossbeam-channel thread pool sized to [`std::thread::available_parallelism`].
- **WASM (no atomics)** → browser microtask queue (`queueMicrotask`); single-threaded but cooperative.
- **WASM (atomics)** → web worker pool (`Send` futures dispatch via shared work queue) + `Atomics.waitAsync`-pinned `!Send` futures.

Same [`spawn`] / [`spawn_local`] surface across all three. Returns an [`async_task::Task`] you can `await`, drop, or `cancel`.

## Quick start

```rust,ignore
use bevy_tasker::{spawn, spawn_local};

// Send future — pool / web worker
let send_task = spawn(async {
    fetch_remote().await
});

// !Send future — stays on the spawning thread
let local_task = spawn_local(async {
    let cached = std::rc::Rc::new(state);
    cached.compute().await
});

# async fn _example() {
let result = send_task.await;
let local_result = local_task.await;
# }
```

## Surface

| Item                                       | Purpose                                                                           |
| ------------------------------------------ | --------------------------------------------------------------------------------- |
| [`spawn`]                                  | Spawn a `Send + 'static` future. Output requires `Send + 'static`.                |
| [`spawn_local`]                            | Spawn a `!Send` future pinned to the calling thread. Output only needs `'static`. |
| [`worker_count`] (WASM atomics only)       | Reports active web worker count for diagnostics                                   |
| [`worker_entry_point`] (WASM atomics only) | JS-side entry point for spawned web workers                                       |

## Platform matrix

| Target            | `spawn()`                             | `spawn_local()`                                         |
| ----------------- | ------------------------------------- | ------------------------------------------------------- |
| Desktop           | Thread pool (crossbeam)               | Same pool, no thread affinity required                  |
| WASM (no atomics) | Microtask queue                       | Microtask queue (Send is trivially satisfied)           |
| WASM (atomics)    | Web worker pool via shared work queue | Owning thread via `LocalRunnable` + `Atomics.waitAsync` |

## Feature flags

This crate has no Cargo features. Behavior is selected purely by `target_arch` + `target_feature` so consumers don't have to choose. The crate's `Cargo.toml` re-exports the `bevy` feature only when downstream `bevy_*` integration is needed, but `bevy_tasker` itself has no Bevy hard dep.

## License

MIT

[`spawn`]: https://docs.rs/bevy_tasker/latest/bevy_tasker/fn.spawn.html
[`spawn_local`]: https://docs.rs/bevy_tasker/latest/bevy_tasker/fn.spawn_local.html
[`worker_count`]: https://docs.rs/bevy_tasker/latest/bevy_tasker/fn.worker_count.html
[`worker_entry_point`]: https://docs.rs/bevy_tasker/latest/bevy_tasker/fn.worker_entry_point.html
