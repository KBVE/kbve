//! Desktop async runtime — lightweight thread pool backed by crossbeam.
//!
//! Spawns one worker thread per CPU core. Tasks are distributed via a
//! crossbeam unbounded channel. `spawn_local()` uses `spawn_unchecked`
//! since the pool threads have no special thread-affinity requirements.

use std::sync::OnceLock;
use std::thread;

use async_task::Task;
use crossbeam_channel::{Sender, unbounded};

static POOL: OnceLock<Sender<async_task::Runnable>> = OnceLock::new();

fn sender() -> &'static Sender<async_task::Runnable> {
    POOL.get_or_init(|| {
        let (tx, rx) = unbounded::<async_task::Runnable>();
        let num_threads = thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(4);

        for i in 0..num_threads {
            let rx = rx.clone();
            thread::Builder::new()
                .name(format!("bevy_tasker-{i}"))
                .spawn(move || {
                    while let Ok(runnable) = rx.recv() {
                        runnable.run();
                    }
                })
                .expect("failed to spawn bevy_tasker worker thread");
        }

        tx
    })
}

pub(crate) fn spawn<F>(future: F) -> Task<F::Output>
where
    F: std::future::Future + Send + 'static,
    F::Output: Send + 'static,
{
    let tx = sender().clone();
    let schedule = move |runnable| {
        let _ = tx.send(runnable);
    };
    let (runnable, task) = async_task::spawn(future, schedule);
    runnable.schedule();
    task
}

pub(crate) fn spawn_local<F>(future: F) -> Task<F::Output>
where
    F: std::future::Future + 'static,
    F::Output: 'static,
{
    let tx = sender().clone();
    let schedule = move |runnable| {
        let _ = tx.send(runnable);
    };
    // SAFETY: The thread pool workers have no thread-local state that the
    // future could depend on. The future may run on any pool thread.
    let (runnable, task) = unsafe { async_task::spawn_unchecked(future, schedule) };
    runnable.schedule();
    task
}
