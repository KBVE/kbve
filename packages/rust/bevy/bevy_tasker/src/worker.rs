//! Web Worker spawning and shared work queue for WASM+atomics.
//!
//! Workers are spawned from JS and call `worker_entry_point()` to start
//! polling the shared work queue. The main thread (or any thread) pushes
//! runnables to the shared queue and wakes a sleeping worker via
//! `memory.atomic.notify`.

#[cfg(all(target_arch = "wasm32", target_feature = "atomics"))]
mod wasm_threads {
    use alloc::vec::Vec;
    use core::sync::atomic::{AtomicI32, AtomicUsize, Ordering};

    use async_task::Runnable;
    use wasm_bindgen::prelude::*;

    extern crate alloc;

    /// Shared work queue state — lives in a static, accessible from all threads.
    struct SharedQueue {
        /// Spin-locked work queue. Workers and producers acquire this to push/pop.
        lock: AtomicI32,
        /// Notification flag — workers wait on this via Atomics.waitAsync.
        notify: AtomicI32,
        /// Number of active workers (for diagnostics).
        worker_count: AtomicUsize,
    }

    // The actual queue data protected by the spin-lock.
    // Using a separate static because UnsafeCell in a static requires manual Sync.
    static SHARED: SharedQueue = SharedQueue {
        lock: AtomicI32::new(0),
        notify: AtomicI32::new(0),
        worker_count: AtomicUsize::new(0),
    };

    // We use a thread-local buffer to store runnables pulled from the shared queue.
    // The shared queue itself uses a simple Vec behind a spin-lock.
    use core::cell::UnsafeCell;

    struct LockedVec {
        inner: UnsafeCell<Vec<Runnable>>,
    }
    unsafe impl Send for LockedVec {}
    unsafe impl Sync for LockedVec {}

    static WORK_VEC: LockedVec = LockedVec {
        inner: UnsafeCell::new(Vec::new()),
    };

    const UNLOCKED: i32 = 0;
    const LOCKED: i32 = 1;

    fn acquire_lock() {
        loop {
            if SHARED
                .lock
                .compare_exchange_weak(UNLOCKED, LOCKED, Ordering::Acquire, Ordering::Relaxed)
                .is_ok()
            {
                break;
            }
            core::hint::spin_loop();
        }
    }

    fn release_lock() {
        SHARED.lock.store(UNLOCKED, Ordering::Release);
    }

    /// Push a runnable to the shared work queue and wake one sleeping worker.
    pub(crate) fn push_work(runnable: Runnable) {
        acquire_lock();
        // SAFETY: spin-lock grants exclusive access.
        unsafe {
            (*WORK_VEC.inner.get()).push(runnable);
        }
        release_lock();

        // Bump the notify counter and wake one waiting worker.
        SHARED.notify.fetch_add(1, Ordering::Release);
        unsafe {
            core::arch::wasm32::memory_atomic_notify(SHARED.notify.as_ptr(), 1);
        }
    }

    /// Try to pop a runnable from the shared work queue.
    fn pop_work() -> Option<Runnable> {
        acquire_lock();
        // SAFETY: spin-lock grants exclusive access.
        let runnable = unsafe { (*WORK_VEC.inner.get()).pop() };
        release_lock();
        runnable
    }

    /// Entry point called by each web worker after instantiating the WASM module.
    /// Sets up a polling loop using Atomics.waitAsync to sleep until notified.
    #[wasm_bindgen]
    pub fn worker_entry_point() {
        SHARED.worker_count.fetch_add(1, Ordering::Relaxed);

        // Start the poll loop.
        poll_shared_queue();
    }

    /// Poll the shared queue for work items and set up async wait for more.
    fn poll_shared_queue() {
        // Drain all available work.
        while let Some(runnable) = pop_work() {
            runnable.run();
        }

        // Set up Atomics.waitAsync to be notified when new work arrives.
        let current = SHARED.notify.load(Ordering::Acquire);
        let mem = wasm_bindgen::memory().unchecked_into::<js_sys::WebAssembly::Memory>();
        let array = js_sys::Int32Array::new(&mem.buffer());
        let index = SHARED.notify.as_ptr() as u32 / 4;

        let result = atomics_wait_async(&array, index, current);

        if wait_result_async(&result) {
            // Not yet notified — set up continuation.
            let continuation = Closure::new(move |_: JsValue| {
                poll_shared_queue();
            });
            let _ = wait_result_value(&result).then(&continuation);
            continuation.forget();
        } else {
            // Already notified (work arrived between pop and wait) — poll again immediately.
            let continuation = Closure::once(move |_: JsValue| {
                poll_shared_queue();
            });
            queue_microtask(&continuation);
            continuation.forget();
        }
    }

    /// Returns the number of active worker threads.
    #[wasm_bindgen]
    pub fn worker_count() -> usize {
        SHARED.worker_count.load(Ordering::Relaxed)
    }

    #[wasm_bindgen]
    extern "C" {
        #[wasm_bindgen(js_name = queueMicrotask)]
        fn queue_microtask(closure: &Closure<dyn FnMut(JsValue)>);
    }

    #[wasm_bindgen(inline_js = r#"
        export function atomics_wait_async(buf, index, value) {
            return Atomics.waitAsync(buf, index, value);
        }
        export function wait_result_async(result) {
            return result.async;
        }
        export function wait_result_value(result) {
            return result.value;
        }
    "#)]
    extern "C" {
        fn atomics_wait_async(buf: &js_sys::Int32Array, index: u32, value: i32) -> JsValue;
        fn wait_result_async(result: &JsValue) -> bool;
        fn wait_result_value(result: &JsValue) -> js_sys::Promise;
    }
}

#[cfg(all(target_arch = "wasm32", target_feature = "atomics"))]
pub(crate) use wasm_threads::push_work;

// Re-export worker_entry_point so it's accessible from the crate root.
#[cfg(all(target_arch = "wasm32", target_feature = "atomics"))]
pub use wasm_threads::worker_count;
#[cfg(all(target_arch = "wasm32", target_feature = "atomics"))]
pub use wasm_threads::worker_entry_point;
