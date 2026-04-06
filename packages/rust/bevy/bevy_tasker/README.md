# bevy_tasker

Cross-platform async task spawning for Bevy games.

- **WASM**: tasks run via the browser microtask queue (`queueMicrotask`). With atomics enabled, `spawn()` dispatches `Send` futures to web workers via a shared work queue, while `spawn_local()` pins `!Send` futures to the creating thread.
- **Desktop**: tasks run on a thread pool backed by crossbeam channels.

## Usage

```rust
use bevy_tasker::{spawn, spawn_local};

// Send future — runs on web workers (WASM+atomics) or thread pool (desktop)
let task = spawn(async {
    42
});

// !Send future — stays on the current thread
let task = spawn_local(async {
    "local result"
});
```

## Features

| Platform          | `spawn()`               | `spawn_local()`                        |
| ----------------- | ----------------------- | -------------------------------------- |
| Desktop           | Thread pool (crossbeam) | Calling thread                         |
| WASM (no atomics) | Microtask queue         | Microtask queue                        |
| WASM (atomics)    | Web worker pool         | Current thread via `Atomics.waitAsync` |

## License

MIT
