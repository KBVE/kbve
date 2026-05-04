//! Empire snapshot FFI — Unity publishes a serialized
//! [`EmpireSnapshot`](../../../../packages/data/proto/empire/empire.proto)
//! every couple seconds; Rust holds it under a global mutex so the
//! background ticker can read + mutate it independently of Unity's
//! frame loop, then Unity pulls the updated bytes back via
//! `uniti_empire_take`.
//!
//! Phase 2.5 lands the strategic tick: prost decodes the cached bytes,
//! drifts each city's `mood` one step toward the Neutral mid-band (50),
//! recomputes the matching `status`, and re-encodes in place. Vassal /
//! Annexed / Razed are sticky end-states and stay put. The actual
//! ledger writes (tribute coin / food deposits) remain Unity-side
//! because they need the live `CapitalLedger` buffer; this tick is the
//! pure-state portion that's safe to run on unloaded-region cities
//! without Unity world data.
//!
//! See the crate root for the shared safety contract on opaque handles
//! + buffer pointer/length pairs.

use std::sync::Mutex;
use std::sync::OnceLock;
use std::sync::atomic::{AtomicBool, Ordering};

use prost::Message;

use crate::proto::empire::{CityStateRecord, CityStateStatusValue, EmpireSnapshot};

#[cfg(not(target_arch = "wasm32"))]
use std::time::Duration;
#[cfg(not(target_arch = "wasm32"))]
use tokio::runtime::{Builder, Runtime};
#[cfg(not(target_arch = "wasm32"))]
use tokio::sync::Notify;

/// Mood band cutoffs (kept in lockstep with `RareIcon.CityStateMoodBand`
/// on the Unity side; both must agree on band membership to avoid the
/// status flapping back and forth on each handoff).
const HOSTILE_MAX: u32 = 33;
const ALLIED_MIN: u32 = 67;

/// Single mood step per tick — slow enough that a player has time to
/// react to a slipping ally, fast enough that a freshly gifted city
/// settles within a handful of cycles.
const DRIFT_STEP: u32 = 1;

/// Mid-Neutral target every non-terminal city drifts toward.
const NEUTRAL_TARGET: u32 = 50;

/// Global slot for the latest snapshot crossing the FFI either way.
/// Both publish (Unity → Rust) and take (Rust → Unity) hit the same
/// buffer; tick decodes, mutates, and re-encodes in place so the
/// next take call already sees the drift result.
static SNAPSHOT: Mutex<Option<Vec<u8>>> = Mutex::new(None);

/// Stores a snapshot published by Unity. `bytes` must point to a
/// proto-encoded `EmpireSnapshot` of length `len`. The function copies
/// the bytes into Rust-owned memory, so the caller is free to release
/// or reuse the source buffer immediately after the call returns.
///
/// Returns `1` on success, `0` if the input is null or empty.
///
/// # Safety
/// `bytes` must be a valid pointer to at least `len` initialised bytes
/// when `len > 0`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_empire_publish(bytes: *const u8, len: usize) -> i32 {
    if bytes.is_null() || len == 0 {
        return 0;
    }
    let slice = unsafe { std::slice::from_raw_parts(bytes, len) };
    let copy = slice.to_vec();
    if let Ok(mut guard) = SNAPSHOT.lock() {
        *guard = Some(copy);
        1
    } else {
        0
    }
}

/// Returns the currently-stored snapshot length (in bytes) without
/// copying. Unity calls this first to size its receive buffer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_empire_snapshot_len() -> usize {
    SNAPSHOT
        .lock()
        .ok()
        .and_then(|g| g.as_ref().map(|v| v.len()))
        .unwrap_or(0)
}

/// Copies the latest snapshot bytes into the caller-provided buffer.
/// `out` must point to at least `out_cap` writable bytes; on success
/// the actual byte count is returned. If the buffer is too small or
/// no snapshot is available the function returns `0` and writes
/// nothing.
///
/// # Safety
/// `out` must be a valid pointer to at least `out_cap` writable bytes
/// when `out_cap > 0`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_empire_take(out: *mut u8, out_cap: usize) -> usize {
    if out.is_null() || out_cap == 0 {
        return 0;
    }
    let Ok(guard) = SNAPSHOT.lock() else {
        return 0;
    };
    let Some(bytes) = guard.as_ref() else {
        return 0;
    };
    if bytes.len() > out_cap {
        return 0;
    }
    unsafe {
        std::ptr::copy_nonoverlapping(bytes.as_ptr(), out, bytes.len());
    }
    bytes.len()
}

/// Strategic tick. Decodes the cached snapshot, drifts each non-terminal
/// city's `mood` one step toward the Neutral target, recomputes
/// `status` against the band cutoffs, bumps `generation`, and
/// re-encodes. Vassal / Annexed / Razed are sticky and skipped.
///
/// Returns `1` on success, `0` when no snapshot is held or decode /
/// encode fails (the cache is left untouched in that case).
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_empire_tick() -> i32 {
    let Ok(mut guard) = SNAPSHOT.lock() else {
        return 0;
    };
    let Some(bytes) = guard.as_ref() else {
        return 0;
    };

    let mut snap = match EmpireSnapshot::decode(bytes.as_slice()) {
        Ok(s) => s,
        Err(_) => return 0,
    };

    snap.generation = snap.generation.wrapping_add(1);
    for city in &mut snap.cities {
        drift_city(city);
    }

    let mut buf = Vec::with_capacity(snap.encoded_len());
    if snap.encode(&mut buf).is_err() {
        return 0;
    }
    *guard = Some(buf);
    1
}

/// Drops the cached snapshot — useful when a new world load wants to
/// start with a clean slate.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_empire_reset() {
    if let Ok(mut guard) = SNAPSHOT.lock() {
        *guard = None;
    }
}

// ---------------------------------------------------------------------------
// Async runtime — opt-in tokio ticker for unloaded-region cities.
// Keeps the synchronous FFI above untouched; Unity continues to publish
// and take whenever it wants. When the runtime is enabled, a background
// tokio task drives `uniti_empire_tick` on a 1s cadence so cities outside
// the active chunk window keep evolving even if Unity stops polling tick.
// ---------------------------------------------------------------------------

#[cfg(not(target_arch = "wasm32"))]
static RUNTIME: OnceLock<Runtime> = OnceLock::new();

#[cfg(not(target_arch = "wasm32"))]
static TICKER_RUNNING: AtomicBool = AtomicBool::new(false);

#[cfg(not(target_arch = "wasm32"))]
static TICKER_STOP: OnceLock<std::sync::Arc<Notify>> = OnceLock::new();

/// Starts the tokio-driven empire ticker. Idempotent — calling twice
/// is a no-op. Returns `1` on success / already-running, `0` if the
/// platform doesn't support a real runtime (WebGL).
#[cfg(not(target_arch = "wasm32"))]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_empire_async_start() -> i32 {
    let runtime = RUNTIME.get_or_init(|| {
        Builder::new_multi_thread()
            .worker_threads(1)
            .enable_time()
            .thread_name("uniti-empire-rt")
            .build()
            .expect("uniti tokio runtime build failed")
    });

    if TICKER_RUNNING.swap(true, Ordering::SeqCst) {
        return 1;
    }

    let notify = TICKER_STOP
        .get_or_init(|| std::sync::Arc::new(Notify::new()))
        .clone();

    runtime.spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(1));
        interval.tick().await;
        loop {
            interval.tick().await;
            if !TICKER_RUNNING.load(Ordering::SeqCst) {
                break;
            }
            unsafe {
                uniti_empire_tick();
            }
        }
        let _ = notify;
    });

    1
}

/// Stops the tokio ticker without tearing down the runtime — leaves
/// the runtime warm so a subsequent start has zero spin-up cost.
#[cfg(not(target_arch = "wasm32"))]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_empire_async_stop() {
    TICKER_RUNNING.store(false, Ordering::SeqCst);
    if let Some(n) = TICKER_STOP.get() {
        n.notify_waiters();
    }
}

/// Per-city mood drift + status recompute. Sticky end-states bail
/// early so diplomacy decisions don't auto-revert.
fn drift_city(city: &mut CityStateRecord) {
    let status = CityStateStatusValue::try_from(city.status)
        .unwrap_or(CityStateStatusValue::CityStateStatusNeutral);
    if matches!(
        status,
        CityStateStatusValue::CityStateStatusVassal
            | CityStateStatusValue::CityStateStatusAnnexed
            | CityStateStatusValue::CityStateStatusRazed
    ) {
        return;
    }

    if city.mood < NEUTRAL_TARGET {
        city.mood = (city.mood + DRIFT_STEP).min(NEUTRAL_TARGET);
    } else if city.mood > NEUTRAL_TARGET {
        city.mood = city.mood.saturating_sub(DRIFT_STEP).max(NEUTRAL_TARGET);
    }

    city.status = if city.mood < HOSTILE_MAX {
        CityStateStatusValue::CityStateStatusHostile as i32
    } else if city.mood >= ALLIED_MIN {
        CityStateStatusValue::CityStateStatusAllied as i32
    } else {
        CityStateStatusValue::CityStateStatusNeutral as i32
    };
}
