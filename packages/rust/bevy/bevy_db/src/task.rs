//! Platform-aware task spawning for database operations.
//!
//! On native: `bevy_tasker::spawn` (requires Send).
//! On WASM: `bevy_tasker::spawn_local` (allows !Send futures from IndexedDB/rexie).

use std::future::Future;

/// Spawn a database future and detach it (fire-and-forget).
///
/// Uses `spawn` on native (futures are Send) and `spawn_local` on WASM
/// (IndexedDB futures contain !Send JsValue types).
#[cfg(not(target_arch = "wasm32"))]
pub(crate) fn spawn_db<F>(future: F)
where
    F: Future + Send + 'static,
    F::Output: Send + 'static,
{
    bevy_tasker::spawn(future).detach();
}

#[cfg(target_arch = "wasm32")]
pub(crate) fn spawn_db<F>(future: F)
where
    F: Future + 'static,
    F::Output: 'static,
{
    bevy_tasker::spawn_local(future).detach();
}
