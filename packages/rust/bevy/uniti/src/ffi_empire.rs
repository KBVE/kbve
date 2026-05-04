//! Empire snapshot FFI — Unity publishes a serialized
//! [`EmpireSnapshot`](../../../../packages/data/proto/empire/empire.proto)
//! every couple seconds; Rust holds it under a global mutex so the
//! background ticker (Phase 2.5+) can read + mutate it independently
//! of Unity's frame loop, then Unity pulls the updated bytes back via
//! `uniti_empire_take`.
//!
//! Phase 2 lands the byte-buffer plumbing only — the actual strategic
//! tick (mood drift on unloaded cities, tribute scheduling, etc.) is
//! a follow-up. Decoupling the FFI surface from the simulation lets us
//! validate the round-trip first, then drop a `prost`-decoded tick
//! function in without touching Unity.
//!
//! See the crate root for the shared safety contract on opaque handles
//! + buffer pointer/length pairs.

use std::sync::Mutex;

/// Global slot for the latest snapshot crossing the FFI either way.
/// Both publish (Unity → Rust) and take (Rust → Unity) hit the same
/// buffer; tick will eventually rewrite the contents in-place after
/// running mood drift / tribute / spawn logic on unloaded-region
/// cities.
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

/// Strategic tick stub. Phase 2.5+ will decode the published snapshot
/// via `prost`, drift mood / advance tribute on unloaded cities, and
/// re-encode in place. For now this is a no-op so the FFI round-trip
/// can be validated end-to-end.
///
/// Returns `1` if a snapshot is currently held, `0` otherwise.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_empire_tick() -> i32 {
    if SNAPSHOT.lock().ok().map(|g| g.is_some()).unwrap_or(false) {
        1
    } else {
        0
    }
}

/// Drops the cached snapshot — useful when a new world load wants to
/// start with a clean slate.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uniti_empire_reset() {
    if let Ok(mut guard) = SNAPSHOT.lock() {
        *guard = None;
    }
}
