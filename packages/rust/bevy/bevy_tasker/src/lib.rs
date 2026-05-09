//! # bevy_tasker
//!
//! Cross-platform async task spawning for Bevy.
//!
//! - **WASM** (no atomics): tasks run via the browser microtask queue
//!   (`queueMicrotask`).
//! - **WASM** (with atomics): [`spawn`] dispatches `Send` futures to
//!   web workers via a shared work queue; [`spawn_local`] pins `!Send`
//!   futures to the spawning thread via `Atomics.waitAsync`.
//! - **Desktop**: tasks run on a thread pool sized to
//!   [`std::thread::available_parallelism`], wired through crossbeam
//!   channels.
//!
//! All paths return an [`async_task::Task`], so calling code is
//! identical across targets — `await` it, drop it to detach, or
//! `.cancel()` it.
//!
//! ## Quick start
//!
//! ```rust,ignore
//! use bevy_tasker::spawn;
//!
//! let task = spawn(async {
//!     // any Send + 'static future
//!     42
//! });
//!
//! // later, in async context:
//! // let result = task.await;
//! ```
//!
//! For futures that aren't `Send` (e.g. ones holding `Rc` or
//! `RefCell`), use [`spawn_local`].

#![cfg_attr(
    all(target_arch = "wasm32", target_feature = "atomics"),
    feature(stdarch_wasm_atomic_wait)
)]

extern crate alloc;

#[cfg(target_arch = "wasm32")]
mod job;
#[cfg(target_arch = "wasm32")]
mod queue;
#[cfg(all(target_arch = "wasm32", target_feature = "atomics"))]
mod worker;

#[cfg(not(target_arch = "wasm32"))]
mod desktop;

use async_task::Task;
use core::future::Future;

#[cfg(all(target_arch = "wasm32", target_feature = "atomics"))]
pub use worker::{worker_count, worker_entry_point};

/// Spawn a `Send + 'static` future on the runtime's executor.
///
/// # Returns
///
/// An [`async_task::Task`] handle. Await it to retrieve the future's
/// output, drop it to detach (the future continues running), or call
/// `.cancel()` to abort.
///
/// # Platform behavior
///
/// - **Desktop** — runs on a shared thread pool sized to
///   [`std::thread::available_parallelism`]. Tasks may execute on any
///   pool thread.
/// - **WASM + atomics** — dispatched to a web worker via the shared
///   work queue.
/// - **WASM (no atomics)** — single-threaded; runs on the current
///   thread's microtask queue (`queueMicrotask`).
pub fn spawn<F>(future: F) -> Task<F::Output>
where
    F: Future + Send + 'static,
    F::Output: Send + 'static,
{
    #[cfg(target_arch = "wasm32")]
    {
        #[cfg(target_feature = "atomics")]
        {
            let schedule = |runnable| worker::push_work(runnable);
            let (runnable, task) = async_task::spawn(future, schedule);
            runnable.schedule();
            task
        }

        #[cfg(not(target_feature = "atomics"))]
        {
            // Single-threaded WASM — run on current thread's microtask queue.
            let schedule = |runnable| queue::enqueue(job::Job::Send(runnable));
            let (runnable, task) = async_task::spawn(future, schedule);
            runnable.schedule();
            task
        }
    }

    #[cfg(not(target_arch = "wasm32"))]
    {
        desktop::spawn(future)
    }
}

/// Spawn a `!Send` future pinned to the calling thread.
///
/// Use when the future captures non-`Send` state (`Rc`, `RefCell`,
/// `*const T`, etc.) but still needs to interoperate with the runtime.
///
/// # Returns
///
/// An [`async_task::Task`] handle. The output type only requires
/// `'static` — no `Send` bound on the output either.
///
/// # Platform behavior
///
/// - **Desktop** — runs on the same thread pool as [`spawn`]. The pool
///   threads have no thread-local state the future could depend on so
///   this is effectively `spawn` minus the `Send` bound.
/// - **WASM + atomics** — uses `LocalRunnable` + `Atomics.waitAsync`
///   so the future executes on its owning thread while still allowing
///   cross-thread waking.
/// - **WASM (no atomics)** — single-threaded; identical to [`spawn`]
///   since `Send` is trivially satisfied.
///
/// # Safety
///
/// Internally calls `async_task::spawn_unchecked`. The unsafety is
/// upheld by each platform's scheduler:
///
/// - the desktop pool has no thread-affinity requirements,
/// - the WASM `LocalRunnable` pins to the owning thread,
/// - single-threaded WASM has only one thread.
pub fn spawn_local<F>(future: F) -> Task<F::Output>
where
    F: Future + 'static,
    F::Output: 'static,
{
    #[cfg(target_arch = "wasm32")]
    {
        #[cfg(target_feature = "atomics")]
        {
            use alloc::sync::Arc;
            use job::{Job, LocalRunnable};

            let local_runnable = LocalRunnable::new();

            let schedule = {
                let lr = local_runnable.clone();
                move |runnable| lr.schedule(runnable)
            };

            // SAFETY: LocalRunnable ensures the runnable only executes on the
            // owning thread.
            let (runnable, task) = unsafe { async_task::spawn_unchecked(future, schedule) };
            runnable.schedule();
            queue::enqueue(Job::Local(Arc::downgrade(&local_runnable)));
            task
        }

        #[cfg(not(target_feature = "atomics"))]
        {
            // Single-threaded WASM — no threading concerns, treat as send.
            let schedule = |runnable| queue::enqueue(job::Job::Send(runnable));

            // SAFETY: single-threaded — Send bound is trivially satisfied.
            let (runnable, task) = unsafe { async_task::spawn_unchecked(future, schedule) };
            runnable.schedule();
            task
        }
    }

    #[cfg(not(target_arch = "wasm32"))]
    {
        desktop::spawn_local(future)
    }
}
