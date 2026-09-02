//! Shared tokio runtime for the internal async consumers in this crate.
//!
//! Deliberately small. Unreal already sizes its own task graph to the machine,
//! so a `worker_threads(core_count)` runtime inside the client process would
//! oversubscribe every core the renderer wants. One worker plus a capped
//! blocking pool is enough for tickers and transports; bulk CPU work belongs
//! on the host's scheduler instead, driven through the job surface.
//!
//! Single runtime dropped once at process exit keeps shutdown semantics
//! uniform across platforms.

use std::sync::OnceLock;

use tokio::runtime::{Builder, Runtime};

static RUNTIME: OnceLock<Runtime> = OnceLock::new();

/// Lazily initialise and return the crate-wide tokio runtime. After the first
/// call this is a single atomic load.
pub fn shared_runtime() -> &'static Runtime {
    RUNTIME.get_or_init(|| {
        // Half the machine, floor 2, ceiling 8. The host is a game engine with
        // its own game, render and task-graph threads; taking every core would
        // win the bake and lose the frame. One async worker is enough because
        // no CPU work runs there -- bakes go to the blocking pool.
        let cores = std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(4);
        let blocking = (cores / 2).clamp(2, 8);

        Builder::new_multi_thread()
            .worker_threads(1)
            .max_blocking_threads(blocking)
            .enable_time()
            .thread_name("unr-rt")
            .build()
            .expect("unr tokio runtime build failed")
    })
}
