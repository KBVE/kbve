//! Browser microtask queue — drains pending jobs via `queueMicrotask`.
//!
//! When atomics are enabled (multi-threaded WASM), the queue is thread-local
//! so each web worker gets its own independent queue.

#[cfg(target_arch = "wasm32")]
mod wasm {
    use alloc::collections::VecDeque;
    use alloc::rc::Rc;
    use core::cell::{Cell, RefCell};
    use core::mem;
    use core::ops::DerefMut;
    use wasm_bindgen::prelude::*;

    use crate::job::Job;

    extern crate alloc;

    #[wasm_bindgen]
    extern "C" {
        #[wasm_bindgen]
        fn queueMicrotask(closure: &Closure<dyn FnMut(JsValue)>);
    }

    struct QueueState {
        jobs: RefCell<VecDeque<Job>>,
        is_scheduled: Cell<bool>,
    }

    impl QueueState {
        fn run_all(&self) {
            let _was_scheduled = self.is_scheduled.replace(false);
            debug_assert!(_was_scheduled);

            let jobs = mem::take(self.jobs.borrow_mut().deref_mut());
            for job in jobs {
                job.run();
            }
        }
    }

    // Each thread (web worker) gets its own queue.
    #[cfg(target_feature = "atomics")]
    thread_local! {
        static QUEUE: Rc<QueueState> = Rc::new(QueueState {
            jobs: RefCell::new(VecDeque::new()),
            is_scheduled: Cell::new(false),
        });
    }

    // thread_local! works for both single-threaded and multi-threaded WASM.
    // On single-threaded WASM there's only one thread, so thread-local is
    // effectively a global. On multi-threaded WASM each web worker gets its own.
    #[cfg(not(target_feature = "atomics"))]
    thread_local! {
        static QUEUE: Rc<QueueState> = Rc::new(QueueState {
            jobs: RefCell::new(VecDeque::new()),
            is_scheduled: Cell::new(false),
        });
    }

    fn with_queue<R>(f: impl FnOnce(&Rc<QueueState>) -> R) -> R {
        QUEUE.with(|q| f(q))
    }

    /// Add a job to the current thread's microtask queue.
    pub(crate) fn enqueue(job: Job) {
        with_queue(|state| {
            state.jobs.borrow_mut().push_back(job);

            if !state.is_scheduled.get() {
                state.is_scheduled.set(true);

                let state_clone = Rc::clone(state);
                let closure = Closure::once(move |_: JsValue| {
                    state_clone.run_all();
                });
                queueMicrotask(&closure);
                closure.forget();
            }
        });
    }
}

#[cfg(target_arch = "wasm32")]
pub(crate) use wasm::enqueue;
