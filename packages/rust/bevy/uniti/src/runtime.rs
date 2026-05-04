//! Shared tokio runtime used by every async / blocking-pool consumer in
//! this crate (empire ticker, world-store ticker, future MP transports).
//! Single multi-thread runtime with one worker keeps cross-platform
//! shutdown semantics uniform — drop the runtime once at process exit
//! and every spawned task / blocking job winds down with it.
//!
//! `spawn_blocking` jobs run on a separate blocking pool (default 512
//! threads, capped here at 4) so the synchronous `rusqlite` writes in
//! `ffi_world` don't starve the async worker that drives `ffi_empire`.
//!
//! Excluded on `wasm32` because the WebGL build can't host a real
//! runtime; callers gate any tokio-dependent path behind the same cfg.

#![cfg(not(target_arch = "wasm32"))]

use std::sync::OnceLock;

use tokio::runtime::{Builder, Runtime};

static RUNTIME: OnceLock<Runtime> = OnceLock::new();

/// Lazily initialise + return the crate-wide tokio runtime. Cheap on
/// the hot path: after the first call this is a single atomic load.
pub fn shared_runtime() -> &'static Runtime {
    RUNTIME.get_or_init(|| {
        Builder::new_multi_thread()
            .worker_threads(1)
            .max_blocking_threads(4)
            .enable_time()
            .thread_name("uniti-rt")
            .build()
            .expect("uniti tokio runtime build failed")
    })
}
