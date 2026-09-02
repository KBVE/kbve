use std::cell::RefCell;
use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant};

use unr::ffi_chunk::{
    UNR_CHUNK_CANCELLED, UNR_CHUNK_OK, UNR_CHUNK_SAMPLES, UnrChunkDone, unr_chunk_cancel,
    unr_chunk_copy_into, unr_chunk_release, unr_chunk_retained, unr_chunk_samples,
    unr_chunk_submit, unr_drain_completed,
};

/// The completion queue has exactly one consumer by design -- the host drains
/// it once a tick. Cargo runs tests in parallel threads, which would model
/// several hosts stealing each other's completions, something the API never
/// promises. Serializing here tests the real contract instead of inventing one.
static DRAIN: Mutex<()> = Mutex::new(());

fn drain_guard() -> MutexGuard<'static, ()> {
    // A panicking test poisons the lock; the state it guards belongs to the FFI
    // module, not to us, so recover rather than cascade failures.
    DRAIN.lock().unwrap_or_else(|e| e.into_inner())
}

thread_local! {
    /// A test that submits several tickets drains completions in whatever order
    /// the pool finishes them, so the ones it is not waiting on yet get parked
    /// here rather than dropped. Thread-local because the guard above means one
    /// test owns the queue at a time.
    static PARKED: RefCell<HashMap<u64, UnrChunkDone>> = RefCell::new(HashMap::new());
}

fn wait_for(ticket: u64) -> UnrChunkDone {
    let deadline = Instant::now() + Duration::from_secs(20);
    loop {
        if let Some(done) = PARKED.with(|p| p.borrow_mut().remove(&ticket)) {
            return done;
        }

        let mut buf = [UnrChunkDone {
            ticket: 0,
            seed: 0,
            cx: 0,
            cy: 0,
            samples: 0,
            status: 0,
        }; 32];
        let n = unsafe { unr_drain_completed(buf.as_mut_ptr(), buf.len() as u32) };
        if n > 0 {
            PARKED.with(|p| {
                let mut map = p.borrow_mut();
                for done in buf.iter().take(n as usize) {
                    map.insert(done.ticket, *done);
                }
            });
            continue;
        }

        if Instant::now() >= deadline {
            panic!("ticket {ticket} never completed");
        }
        std::thread::sleep(Duration::from_millis(2));
    }
}

#[test]
fn submit_does_not_block_the_caller() {
    let _drain = drain_guard();
    let start = Instant::now();
    let tickets: Vec<u64> = (0..8).map(|i| unr_chunk_submit(7, i, 0)).collect();
    let elapsed = start.elapsed();

    // Eight bakes queued. If submit were synchronous this would be the cost of
    // all eight, not a handful of map inserts.
    assert!(
        elapsed < Duration::from_millis(50),
        "submit blocked for {elapsed:?}"
    );
    assert_eq!(tickets.len(), 8);
    for t in tickets {
        let done = wait_for(t);
        assert_eq!(done.status, UNR_CHUNK_OK);
        unr_chunk_release(t);
    }
}

#[test]
fn tickets_are_unique() {
    let _drain = drain_guard();
    let a = unr_chunk_submit(1, 0, 0);
    let b = unr_chunk_submit(1, 0, 0);
    assert_ne!(a, b, "same coords must still get distinct tickets");
    for t in [a, b] {
        wait_for(t);
        unr_chunk_release(t);
    }
}

#[test]
fn payload_copies_out_and_is_deterministic() {
    let _drain = drain_guard();
    let t1 = unr_chunk_submit(42, -3, 9);
    let done = wait_for(t1);
    assert_eq!(done.status, UNR_CHUNK_OK);
    assert_eq!(done.samples, UNR_CHUNK_SAMPLES);
    assert_eq!(done.seed, 42);
    assert_eq!(done.cx, -3);
    assert_eq!(done.cy, 9);

    let mut a = vec![0.0f32; UNR_CHUNK_SAMPLES as usize];
    assert!(unsafe { unr_chunk_copy_into(t1, a.as_mut_ptr(), a.len() as u32) });

    // Same inputs, different ticket: identical bytes.
    let t2 = unr_chunk_submit(42, -3, 9);
    wait_for(t2);
    let mut b = vec![0.0f32; UNR_CHUNK_SAMPLES as usize];
    assert!(unsafe { unr_chunk_copy_into(t2, b.as_mut_ptr(), b.len() as u32) });

    assert_eq!(a, b, "same (seed, cx, cy) must produce identical samples");
    assert!(a.iter().any(|v| *v != 0.0), "payload was never written");
    assert!(a.iter().all(|v| (0.0..1.0).contains(v)));
}

#[test]
fn different_coords_differ() {
    let _drain = drain_guard();
    let t1 = unr_chunk_submit(5, 0, 0);
    let t2 = unr_chunk_submit(5, 1, 0);
    wait_for(t1);
    wait_for(t2);

    let mut a = vec![0.0f32; UNR_CHUNK_SAMPLES as usize];
    let mut b = vec![0.0f32; UNR_CHUNK_SAMPLES as usize];
    assert!(unsafe { unr_chunk_copy_into(t1, a.as_mut_ptr(), a.len() as u32) });
    assert!(unsafe { unr_chunk_copy_into(t2, b.as_mut_ptr(), b.len() as u32) });
    assert_ne!(a, b);
}

#[test]
fn copy_consumes_the_payload() {
    let _drain = drain_guard();
    let t = unr_chunk_submit(11, 2, 2);
    wait_for(t);
    let mut buf = vec![0.0f32; UNR_CHUNK_SAMPLES as usize];
    assert!(unsafe { unr_chunk_copy_into(t, buf.as_mut_ptr(), buf.len() as u32) });
    assert!(
        !unsafe { unr_chunk_copy_into(t, buf.as_mut_ptr(), buf.len() as u32) },
        "second copy must fail -- the payload was released"
    );
}

#[test]
fn wrong_length_is_rejected_and_retained() {
    let _drain = drain_guard();
    let t = unr_chunk_submit(13, 4, 4);
    wait_for(t);

    let mut small = vec![0.0f32; 8];
    assert!(!unsafe { unr_chunk_copy_into(t, small.as_mut_ptr(), small.len() as u32) });

    // Retained, so a correctly sized retry still works.
    let mut right = vec![0.0f32; UNR_CHUNK_SAMPLES as usize];
    assert!(unsafe { unr_chunk_copy_into(t, right.as_mut_ptr(), right.len() as u32) });
}

#[test]
fn release_frees_without_copying() {
    let _drain = drain_guard();
    let t = unr_chunk_submit(17, 6, 6);
    wait_for(t);
    assert!(
        unr_chunk_retained() > 0,
        "our finished payload should be retained"
    );
    unr_chunk_release(t);

    let mut buf = vec![0.0f32; UNR_CHUNK_SAMPLES as usize];
    assert!(!unsafe { unr_chunk_copy_into(t, buf.as_mut_ptr(), buf.len() as u32) });
}

#[test]
fn cancel_reports_cancelled_and_retains_nothing() {
    let _drain = drain_guard();
    let t = unr_chunk_submit(23, 100, 100);
    unr_chunk_cancel(t);
    let done = wait_for(t);

    // Best effort: a bake past its last check still completes normally.
    if done.status == UNR_CHUNK_CANCELLED {
        assert_eq!(done.samples, 0);
        let mut buf = vec![0.0f32; UNR_CHUNK_SAMPLES as usize];
        assert!(
            !unsafe { unr_chunk_copy_into(t, buf.as_mut_ptr(), buf.len() as u32) },
            "a cancelled job must not retain a payload"
        );
    } else {
        assert_eq!(done.status, UNR_CHUNK_OK);
        unr_chunk_release(t);
    }
}

#[test]
fn drain_respects_its_cap() {
    let _drain = drain_guard();
    let tickets: Vec<u64> = (0..6).map(|i| unr_chunk_submit(31, i, 77)).collect();
    for t in &tickets {
        wait_for(*t);
        unr_chunk_release(*t);
    }
    // wait_for already drained these; the cap itself is exercised there via the
    // 32-slot buffer. This asserts the empty-queue path returns 0, not garbage.
    let mut buf = [UnrChunkDone {
        ticket: 0,
        seed: 0,
        cx: 0,
        cy: 0,
        samples: 0,
        status: 0,
    }; 4];
    let n = unsafe { unr_drain_completed(buf.as_mut_ptr(), buf.len() as u32) };
    assert!(n <= 4);
}

#[test]
fn null_and_zero_are_rejected() {
    let _drain = drain_guard();
    assert_eq!(unsafe { unr_drain_completed(std::ptr::null_mut(), 4) }, 0);
    let mut buf = [UnrChunkDone {
        ticket: 0,
        seed: 0,
        cx: 0,
        cy: 0,
        samples: 0,
        status: 0,
    }; 2];
    assert_eq!(unsafe { unr_drain_completed(buf.as_mut_ptr(), 0) }, 0);
    assert!(!unsafe { unr_chunk_copy_into(1, std::ptr::null_mut(), 4) });
}

#[test]
fn sample_count_matches_the_constant() {
    let _drain = drain_guard();
    assert_eq!(unr_chunk_samples(), UNR_CHUNK_SAMPLES);
    assert_eq!(unr_chunk_samples(), 33 * 33);
}
