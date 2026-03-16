//! Cross-platform async task spawning for Bevy.
//!
//! On WASM: tasks run via browser microtask queue (`queueMicrotask`).
//! With atomics enabled, `spawn()` dispatches Send futures to web workers
//! via a shared work queue, and `spawn_local()` pins !Send futures to the
//! creating thread.
//!
//! On desktop: tasks run on a thread pool backed by crossbeam channels.

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

// Re-export worker API for JS to call.
#[cfg(all(target_arch = "wasm32", target_feature = "atomics"))]
pub use worker::{worker_count, worker_entry_point};

/// Spawn a Send future. On WASM with atomics it dispatches to web workers
/// via a shared work queue. On WASM without atomics or on desktop it runs
/// on the current thread's microtask queue or thread pool respectively.
pub fn spawn<F>(future: F) -> Task<F::Output>
where
    F: Future + Send + 'static,
    F::Output: Send + 'static,
{
    #[cfg(target_arch = "wasm32")]
    {
        #[cfg(target_feature = "atomics")]
        {
            // Dispatch to web workers via the shared work queue.
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

/// Spawn a !Send future pinned to the current thread.
///
/// On WASM with atomics, uses `LocalRunnable` + `Atomics.waitAsync` to keep
/// execution on the owning thread while allowing cross-thread waking.
///
/// On WASM without atomics (single-threaded), behaves identically to `spawn()`.
///
/// On desktop, runs on the calling thread's executor (same as `spawn()` but
/// the future need not be Send).
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
