//! Job types for the microtask queue.
//!
//! On single-threaded WASM, a Job is just a Runnable.
//! On multi-threaded WASM (atomics), jobs can be Send runnables or
//! thread-pinned LocalRunnables that wake cross-thread via atomics.

use async_task::Runnable;

#[cfg(target_feature = "atomics")]
use alloc::sync::Weak;

#[cfg(target_feature = "atomics")]
mod local_runnable;

#[cfg(target_feature = "atomics")]
pub(crate) use local_runnable::LocalRunnable;

extern crate alloc;

/// A unit of async work enqueued on the microtask queue.
#[allow(dead_code)] // Send is used in the non-atomics WASM path
pub(crate) enum Job {
    /// A Send runnable — can execute on any thread.
    Send(Runnable),
    /// A !Send runnable — must execute on its owning thread.
    #[cfg(target_feature = "atomics")]
    Local(Weak<LocalRunnable>),
}

impl Job {
    pub(crate) fn run(self) {
        match self {
            Job::Send(runnable) => {
                runnable.run();
            }
            #[cfg(target_feature = "atomics")]
            Job::Local(weak) => {
                // SAFETY: local jobs are only enqueued on the owning thread.
                unsafe { LocalRunnable::run_to_completion(&weak) };
            }
        }
    }
}
