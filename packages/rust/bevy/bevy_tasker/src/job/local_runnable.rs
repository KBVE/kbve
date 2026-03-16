//! Thread-pinned runnable for !Send futures on multi-threaded WASM.
//!
//! Uses `memory.atomic.notify` + `Atomics.waitAsync` to wake a promise
//! on the owning thread when a different thread schedules the runnable.

use alloc::sync::{Arc, Weak};
use core::cell::UnsafeCell;
use core::sync::atomic::{AtomicI32, Ordering};

use async_task::Runnable;
use wasm_bindgen::prelude::*;

use crate::job::Job;
use crate::queue;

extern crate alloc;

const WAITING: i32 = 0;
const LOCKED: i32 = 1;
const READY: i32 = 2;

/// A local runner polls a future to completion on a single thread but can be
/// woken from any thread via atomic operations.
pub(crate) struct LocalRunnable {
    state: AtomicI32,
    runnable: UnsafeCell<Option<Runnable>>,
}

// SAFETY: The spin-lock protocol ensures only one thread accesses `runnable`
// at a time. The UnsafeCell is guarded by the atomic state machine.
unsafe impl Send for LocalRunnable {}
unsafe impl Sync for LocalRunnable {}

impl LocalRunnable {
    pub(crate) fn new() -> Arc<Self> {
        Arc::new(Self {
            state: AtomicI32::new(WAITING),
            runnable: UnsafeCell::new(None),
        })
    }

    /// Store a runnable and wake the owning thread's promise.
    /// Called from the `async-task` schedule function (potentially cross-thread).
    pub(crate) fn schedule(&self, runnable: Runnable) {
        // Spin-lock: WAITING → LOCKED
        loop {
            match self.state.swap(LOCKED, Ordering::Relaxed) {
                WAITING => break,
                LOCKED => continue,
                READY => panic!("tried to schedule already-scheduled task"),
                _ => panic!("invalid local runnable state"),
            }
        }

        // SAFETY: spin-lock grants exclusive access.
        let slot = unsafe { &mut *self.runnable.get() };
        debug_assert!(slot.is_none());
        *slot = Some(runnable);

        // Release lock → READY
        let prev = self.state.swap(READY, Ordering::Release);
        debug_assert_eq!(prev, LOCKED);

        // Wake the `waitAsync` promise on the owning thread.
        // SAFETY: `state` is a valid atomic i32.
        unsafe {
            core::arch::wasm32::memory_atomic_notify(self.state.as_ptr(), 1);
        }
    }

    /// Poll the runnable to completion on the owning thread.
    ///
    /// # Safety
    /// Must be called on the thread that created the LocalRunnable.
    pub(crate) unsafe fn run_to_completion(this_weak: &Weak<Self>) {
        let Some(this) = this_weak.upgrade() else {
            return;
        };

        // Spin-lock: READY → LOCKED
        loop {
            match this.state.swap(LOCKED, Ordering::Acquire) {
                WAITING => panic!("tried to run a task that wasn't scheduled"),
                LOCKED => continue,
                READY => break,
                _ => panic!("invalid local runnable state"),
            }
        }

        // SAFETY: spin-lock grants exclusive access.
        let slot = unsafe { &mut *this.runnable.get() };
        let runnable = core::mem::take(slot).unwrap();

        // Release lock → WAITING
        let prev = this.state.swap(WAITING, Ordering::Relaxed);
        debug_assert_eq!(prev, LOCKED);

        // Execute — may re-schedule itself.
        runnable.run();

        // If we're the last strong ref, the future was dropped — exit.
        if this_weak.strong_count() == 1 {
            return;
        }

        // Set up continuation: wait for next schedule, then run again.
        if let Some(promise) = this.wait() {
            let weak_clone = this_weak.clone();
            let continuation =
                Closure::new(move |_| unsafe { LocalRunnable::run_to_completion(&weak_clone) });
            drop(promise.then(&continuation));
        } else {
            // Already re-scheduled — re-enqueue immediately.
            queue::enqueue(Job::Local(this_weak.clone()));
        }
    }

    /// Returns `Some(promise)` if the runnable hasn't been scheduled yet
    /// (promise resolves when `schedule()` is called), or `None` if already ready.
    fn wait(&self) -> Option<js_sys::Promise> {
        let mem = wasm_bindgen::memory().unchecked_into::<js_sys::WebAssembly::Memory>();
        let array = js_sys::Int32Array::new(&mem.buffer());
        let result = Atomics::wait_async(&array, self.state.as_ptr() as u32 / 4, WAITING);
        if result.async_() {
            Some(result.value())
        } else {
            None
        }
    }
}

#[wasm_bindgen]
extern "C" {
    type Atomics;
    type WaitAsyncResult;

    #[wasm_bindgen(static_method_of = Atomics, js_name = waitAsync)]
    fn wait_async(buf: &js_sys::Int32Array, index: u32, value: i32) -> WaitAsyncResult;

    #[wasm_bindgen(method, getter, structural, js_name = async)]
    fn async_(this: &WaitAsyncResult) -> bool;

    #[wasm_bindgen(method, getter, structural)]
    fn value(this: &WaitAsyncResult) -> js_sys::Promise;
}
