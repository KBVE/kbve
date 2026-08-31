//! Starting the web workers that back [`crate::spawn`] on WASM+atomics.
//!
//! The pool cannot be started from JavaScript: `App::run` never returns on the
//! web, so code after `await init()` is unreachable. Workers are spawned from
//! `main` instead, and each one instantiates the same module against the same
//! shared memory before parking on the queue.

use wasm_bindgen::JsValue;
use wasm_bindgen::prelude::*;

#[wasm_bindgen(inline_js = r#"
    export function bevy_tasker_spawn_worker(worker_url, bundle_url, module, memory) {
        // `type: 'module'` so the worker can import() the glue, which is an
        // ES module. Cloning a SharedArrayBuffer-backed Memory shares it
        // rather than copying -- that sharing is the whole mechanism.
        const worker = new Worker(worker_url, { type: 'module' });
        worker.postMessage({ bundle: bundle_url, module, memory });
        return worker;
    }

    export function bevy_tasker_hardware_concurrency() {
        return navigator.hardwareConcurrency || 4;
    }

    export function bevy_tasker_console_error(message) {
        console.error(message);
    }

    export function bevy_tasker_is_isolated() {
        return self.crossOriginIsolated === true;
    }

    export function bevy_tasker_is_worker() {
        return typeof WorkerGlobalScope !== 'undefined'
            && self instanceof WorkerGlobalScope;
    }
"#)]
extern "C" {
    fn bevy_tasker_spawn_worker(
        worker_url: &str,
        bundle_url: &str,
        module: JsValue,
        memory: JsValue,
    ) -> JsValue;

    fn bevy_tasker_hardware_concurrency() -> usize;

    fn bevy_tasker_is_worker() -> bool;

    fn bevy_tasker_is_isolated() -> bool;

    #[wasm_bindgen(js_name = bevy_tasker_console_error)]
    fn web_sys_console_error(message: &str);
}

/// Whether this page can share memory with a worker at all.
///
/// A `WebAssembly.Memory` backed by a `SharedArrayBuffer` cannot be
/// structured-cloned outside a cross-origin isolated context, so `postMessage`
/// rejects it with `DataCloneError: The object can not be cloned` -- thrown
/// from inside `main`, which surfaces as an unexplained failure to start.
/// Checked first so the reason is stated instead.
pub fn is_isolated() -> bool {
    bevy_tasker_is_isolated()
}

/// Whether this thread is a web worker rather than the page's main thread.
///
/// Every thread instantiates the same module, and wasm-bindgen runs the start
/// section -- `main`, for a binary -- on each one. Without a guard at the top
/// of `main`, every worker builds its own copy of the application.
///
/// Tests for `WorkerGlobalScope` rather than the absence of `window`, which
/// would also answer "yes" in Node.
pub fn is_worker() -> bool {
    bevy_tasker_is_worker()
}

/// One worker per logical core, minus the main thread -- which is not a spare:
/// it owns the canvas, the event loop and every `wgpu` handle.
pub fn default_worker_count() -> usize {
    bevy_tasker_hardware_concurrency().saturating_sub(1).max(1)
}

/// Starts the worker pool. Call before `App::run`.
///
/// `bundle_url` is passed rather than guessed because a project may ship
/// several bundles from one directory -- a WebGPU one and a WebGL2 one -- and
/// a worker has to instantiate the same one the main thread did.
///
/// Returns the number asked for; `new Worker` is asynchronous past the
/// constructor, so a worker that dies later reports on the console.
pub fn start_workers(worker_url: &str, bundle_url: &str, count: Option<usize>) -> usize {
    if !is_isolated() {
        // Not a panic: a single-threaded run beats no run. Tasks handed to
        // `spawn` will queue with nothing to service them, so a caller that
        // depends on the pool should test this itself.
        web_sys_console_error(
            "bevy_tasker: this page is not cross-origin isolated, so no workers \
             can be started. Serve it with Cross-Origin-Opener-Policy: same-origin \
             and Cross-Origin-Embedder-Policy: require-corp.",
        );
        return 0;
    }

    let count = count.unwrap_or_else(default_worker_count);

    // The compiled module this instance came from, so workers join the binary
    // already running rather than re-fetching and re-compiling it.
    let module = wasm_bindgen::module();
    let memory = wasm_bindgen::memory();

    for _ in 0..count {
        // Dropped on purpose: a worker lives as long as the page, so keeping
        // the handle would mean owning a shutdown path that has no shutdown.
        let _ = bevy_tasker_spawn_worker(worker_url, bundle_url, module.clone(), memory.clone());
    }

    count
}
