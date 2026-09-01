//! Minimal exports that prove the Rust -> Unreal link works end to end:
//! symbol resolution, a value round trip, and that the tokio runtime can be
//! built and driven from inside the statically linked library.
//!
//! These stay after real work lands — when a link breaks, a probe that does
//! nothing tells you far more than a bake that does everything.

use std::os::raw::c_char;

use crate::runtime::shared_runtime;

/// Crate version as a NUL-terminated static string.
///
/// The returned pointer has static lifetime; the caller must NOT free it.
#[unsafe(no_mangle)]
pub extern "C" fn unr_version() -> *const c_char {
    concat!(env!("CARGO_PKG_VERSION"), "\0").as_ptr() as *const c_char
}

/// Adds two integers. The cheapest possible proof that the symbol resolved
/// and the ABI agrees.
#[unsafe(no_mangle)]
pub extern "C" fn unr_add(a: i32, b: i32) -> i32 {
    a.wrapping_add(b)
}

/// Sums `0..n` on the tokio blocking pool and blocks until it completes.
///
/// Exists to prove the runtime builds and runs inside the linked library —
/// the part of the chain that a plain arithmetic export does not exercise.
///
/// # Panics
///
/// Blocks the calling thread. Must not be called from a thread already inside
/// the shared runtime.
#[unsafe(no_mangle)]
pub extern "C" fn unr_runtime_probe(n: u32) -> u64 {
    shared_runtime().block_on(async move {
        tokio::task::spawn_blocking(move || (0..u64::from(n)).sum::<u64>())
            .await
            .unwrap_or(0)
    })
}
