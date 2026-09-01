//! Async chunk job surface: submit work, drain what finished, copy it out.
//!
//! The shape exists to keep the game thread free. `submit` returns a ticket
//! immediately, the bake runs on the tokio blocking pool, and the caller drains
//! completions once a tick. Nothing here blocks, and nothing here calls back
//! into the host -- the host polls, which is what lets both Unreal and the
//! server drive the identical code.
//!
//! # Locking
//!
//! Every lock in this module is taken, used, and dropped before returning to
//! the caller. A guard held across the FFI boundary is a deadlock waiting for
//! the host to re-enter, so the pattern throughout is: lock, move data out,
//! drop, then touch the caller's pointers.
//!
//! The bake is a placeholder until `worldgen` lands: deterministic in
//! `(seed, cx, cy, index)` so tests can assert exact values, and slow enough
//! per sample to be worth moving off the calling thread.

use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

use crate::runtime::shared_runtime;

/// Samples per chunk edge. 33 = 32 cells + 1 shared border vertex, matching
/// the `CellsPerEdge = 32` the Unreal chunk actor already uses.
pub const UNR_CHUNK_EDGE: u32 = 33;

/// Total samples in one chunk payload.
pub const UNR_CHUNK_SAMPLES: u32 = UNR_CHUNK_EDGE * UNR_CHUNK_EDGE;

/// Job finished and its payload is waiting for `unr_chunk_copy_into`.
pub const UNR_CHUNK_OK: u32 = 0;

/// Job was cancelled before it finished. No payload is retained.
pub const UNR_CHUNK_CANCELLED: u32 = 1;

/// One completion record. Plain data by value -- no pointers cross in here, so
/// the host can memcpy an array of these without lifetime questions.
#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct UnrChunkDone {
    pub ticket: u64,
    pub seed: u32,
    pub cx: i32,
    pub cy: i32,
    /// Samples available to copy. Zero when `status` is not `UNR_CHUNK_OK`.
    pub samples: u32,
    pub status: u32,
}

#[derive(Default)]
struct Jobs {
    next_ticket: u64,
    cancels: HashMap<u64, Arc<AtomicBool>>,
    completed: VecDeque<UnrChunkDone>,
    ready: HashMap<u64, Vec<f32>>,
}

static JOBS: OnceLock<Mutex<Jobs>> = OnceLock::new();

fn jobs() -> &'static Mutex<Jobs> {
    JOBS.get_or_init(|| Mutex::new(Jobs::default()))
}

/// Placeholder height sample. Integer mixing only, so it is bit-identical
/// across platforms -- the same property the real generator has to keep.
fn placeholder_sample(seed: u32, cx: i32, cy: i32, index: u32) -> f32 {
    let mut h = seed.wrapping_mul(0x9E37_79B9);
    h = h.wrapping_add((cx as u32).wrapping_mul(0x85EB_CA6B));
    h = h.wrapping_add((cy as u32).wrapping_mul(0xC2B2_AE35));
    h = h.wrapping_add(index.wrapping_mul(0x27D4_EB2F));
    h ^= h >> 15;
    h = h.wrapping_mul(0x2545_F491);
    h ^= h >> 13;
    // Exact power-of-two divide: no rounding to disagree about.
    ((h >> 16) & 0xFFFF) as f32 / 65536.0
}

/// Queue a chunk bake. Returns a ticket immediately; never blocks.
#[unsafe(no_mangle)]
pub extern "C" fn unr_chunk_submit(seed: u32, cx: i32, cy: i32) -> u64 {
    let cancel = Arc::new(AtomicBool::new(false));

    let ticket = {
        let mut j = jobs().lock().unwrap();
        j.next_ticket += 1;
        let ticket = j.next_ticket;
        j.cancels.insert(ticket, Arc::clone(&cancel));
        ticket
    };

    // spawn_blocking, not spawn: this is CPU work, and the runtime has a single
    // async worker that a bake would otherwise monopolise.
    shared_runtime().spawn_blocking(move || {
        let mut out = Vec::with_capacity(UNR_CHUNK_SAMPLES as usize);
        for index in 0..UNR_CHUNK_SAMPLES {
            if cancel.load(Ordering::Relaxed) {
                break;
            }
            out.push(placeholder_sample(seed, cx, cy, index));
        }

        let cancelled = cancel.load(Ordering::Relaxed);
        let mut j = jobs().lock().unwrap();
        j.cancels.remove(&ticket);
        if !cancelled {
            j.ready.insert(ticket, out);
        }
        j.completed.push_back(UnrChunkDone {
            ticket,
            seed,
            cx,
            cy,
            samples: if cancelled { 0 } else { UNR_CHUNK_SAMPLES },
            status: if cancelled {
                UNR_CHUNK_CANCELLED
            } else {
                UNR_CHUNK_OK
            },
        });
    });

    ticket
}

/// Copy up to `cap` completion records into `out`, returning how many were
/// written. Non-blocking; returns 0 when nothing has finished.
///
/// `cap` is the per-tick budget: a burst of completions spreads over frames
/// instead of spiking one.
///
/// # Safety
///
/// `out` must point to at least `cap` writable `UnrChunkDone` slots.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn unr_drain_completed(out: *mut UnrChunkDone, cap: u32) -> u32 {
    if out.is_null() || cap == 0 {
        return 0;
    }

    // Drain under the lock, write to the caller's memory after dropping it.
    let taken: Vec<UnrChunkDone> = {
        let mut j = jobs().lock().unwrap();
        let n = j.completed.len().min(cap as usize);
        j.completed.drain(..n).collect()
    };

    for (i, done) in taken.iter().enumerate() {
        unsafe { out.add(i).write(*done) };
    }
    taken.len() as u32
}

/// Copy a finished payload into caller-owned memory and release it.
///
/// The host allocates, so nothing crosses the allocator boundary and there is
/// no matching free to forget. Returns false when the ticket has no payload or
/// `len` does not match exactly; the payload is retained on a length mismatch
/// so a correctly sized retry still works.
///
/// # Safety
///
/// `out` must point to at least `len` writable `f32` slots.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn unr_chunk_copy_into(ticket: u64, out: *mut f32, len: u32) -> bool {
    if out.is_null() {
        return false;
    }

    let taken = {
        let mut j = jobs().lock().unwrap();
        j.ready.remove(&ticket)
    };

    match taken {
        Some(data) if data.len() == len as usize => {
            unsafe { std::ptr::copy_nonoverlapping(data.as_ptr(), out, data.len()) };
            true
        }
        Some(data) => {
            let mut j = jobs().lock().unwrap();
            j.ready.insert(ticket, data);
            false
        }
        None => false,
    }
}

/// Ask a job to stop. Best effort: a bake already past its last cancel check
/// still completes, and reports `UNR_CHUNK_OK`.
#[unsafe(no_mangle)]
pub extern "C" fn unr_chunk_cancel(ticket: u64) {
    let flag = {
        let j = jobs().lock().unwrap();
        j.cancels.get(&ticket).cloned()
    };
    if let Some(flag) = flag {
        flag.store(true, Ordering::Relaxed);
    }
}

/// Drop a finished payload without copying it -- for results that arrived after
/// the host stopped caring. Without this, abandoning tickets leaks.
#[unsafe(no_mangle)]
pub extern "C" fn unr_chunk_release(ticket: u64) {
    let mut j = jobs().lock().unwrap();
    j.ready.remove(&ticket);
}

/// Samples the host must size its buffer for.
#[unsafe(no_mangle)]
pub extern "C" fn unr_chunk_samples() -> u32 {
    UNR_CHUNK_SAMPLES
}

/// Payloads finished but not yet copied or released. Diagnostics -- a number
/// that only grows means the host is dropping tickets.
#[unsafe(no_mangle)]
pub extern "C" fn unr_chunk_retained() -> u32 {
    jobs().lock().unwrap().ready.len() as u32
}
