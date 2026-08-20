//! Where a failure is recorded, separate from what sends it.
//!
//! Capture has to work from anywhere in the crate — a placement worker thread, a
//! panic hook with no Godot bindings, a field's late_init — so it cannot hold a
//! `Gd<T>` or know a node exists. It parks records in a process-wide queue and
//! `TelemetryManager` drains them on the main thread.

use std::backtrace::Backtrace;
use std::panic;
use std::sync::{Mutex, OnceLock};

/// Bounded because an error that fires every frame must not grow without limit
/// while the node that drains it is absent — which is exactly the case when the
/// extension failed to load and nothing is draining at all.
const MAX_QUEUE: usize = 64;

static QUEUE: OnceLock<Mutex<Vec<Report>>> = OnceLock::new();
static HOOK: OnceLock<()> = OnceLock::new();

pub struct Report {
    pub error_type: String,
    pub message: String,
    pub stack: String,
    pub handled: bool,
}

fn queue() -> &'static Mutex<Vec<Report>> {
    QUEUE.get_or_init(|| Mutex::new(Vec::new()))
}

fn push(report: Report) {
    if let Ok(mut queue) = queue().lock()
        && queue.len() < MAX_QUEUE
    {
        queue.push(report);
    }
}

/// Records a failure the code saw and handled. Prefer the `q_error!` macro, which
/// also puts it in the Godot log where a developer running locally will see it.
pub fn report(error_type: &str, message: impl Into<String>) {
    push(Report {
        error_type: error_type.to_string(),
        message: message.into(),
        stack: String::new(),
        handled: true,
    });
}

pub fn install_panic_hook() {
    HOOK.get_or_init(|| {
        let previous = panic::take_hook();
        panic::set_hook(Box::new(move |info| {
            let message = info
                .payload()
                .downcast_ref::<&str>()
                .map(|s| (*s).to_string())
                .or_else(|| info.payload().downcast_ref::<String>().cloned())
                .unwrap_or_else(|| "panic".to_string());
            let location = info
                .location()
                .map(|l| format!(" ({}:{}:{})", l.file(), l.line(), l.column()))
                .unwrap_or_default();
            push(Report {
                error_type: "RustPanic".to_string(),
                message: format!("{message}{location}"),
                stack: Backtrace::force_capture().to_string(),
                handled: false,
            });
            // Chained rather than replaced: gdext's own hook is what turns a panic
            // into a readable Godot error instead of an abort, and dropping it
            // would trade a crash report for a silent process death.
            previous(info);
        }));
    });
}

pub fn drain() -> Vec<Report> {
    match queue().lock() {
        Ok(mut queue) => std::mem::take(&mut *queue),
        Err(_) => Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// One test, not two: the queue is process-wide, so a second test draining it
    /// on another thread would empty this one's records out from under it.
    #[test]
    fn reports_queue_up_bounded_and_drain_once() {
        drain();

        report("TreeField", "compute compile failed");
        let out = drain();
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].error_type, "TreeField");
        assert!(out[0].handled);
        assert!(drain().is_empty(), "draining twice must not repeat it");

        for i in 0..(MAX_QUEUE * 2) {
            report("Flood", format!("{i}"));
        }
        assert_eq!(
            drain().len(),
            MAX_QUEUE,
            "an error firing every frame must not grow the queue without limit"
        );
    }
}
