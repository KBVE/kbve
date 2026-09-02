//! C FFI bridge from KBVE game-logic crates to Unreal Engine. The C header
//! is generated into `include/unr.h` by [`cbindgen`] at build time and
//! consumed by the `KBVERareIconCore` plugin through its `ThirdParty` tree.
//!
//! # Threading model
//!
//! This crate owns *work*, not *scheduling*. Bulk jobs are meant to be driven
//! by whatever scheduler the host already runs — Unreal's task graph in the
//! client, tokio's blocking pool on the server — so neither host ends up with
//! a second thread pool competing for cores with its renderer.
//!
//! [`runtime`] is the exception and is deliberately small: one worker and a
//! capped blocking pool, for internal tickers and async transports that have
//! nowhere else to live. See its module docs.
//!
//! # Safety
//!
//! All exports are `pub unsafe extern "C" fn` and share one baseline
//! contract:
//!
//! - Opaque `*mut c_void` handles must be valid pointers returned by the
//!   matching `unr_*_new` / `unr_*_open` constructor.
//! - Each handle must not yet have been freed.
//! - Handles must not be used concurrently across threads unless a function
//!   documents otherwise.
//!
//! Per-function `# Safety` sections list any additional contracts.
//!
//! [`cbindgen`]: https://github.com/mozilla/cbindgen
#![allow(clippy::missing_safety_doc)]

pub mod ffi_chunk;
pub mod ffi_probe;
pub mod runtime;
