//! C FFI bridge from KBVE Bevy game-logic crates to Unity. Bindings on
//! the C# side are generated into `Uniti.g.cs` by [`csbindgen`] at build
//! time and consumed by the Unity project as a native plugin.
//!
//! # Safety
//!
//! All exports are `pub unsafe extern "C" fn` and share one baseline
//! contract:
//!
//! - Opaque `*mut c_void` handles must be valid pointers returned by
//!   the matching `uniti_*_new` / `uniti_*_open` constructor.
//! - Each handle must not yet have been freed.
//! - Handles must not be used concurrently across threads (the world
//!   store's background tick thread is internal and does not break this
//!   rule for callers).
//!
//! Per-function `# Safety` sections list any additional contracts —
//! typically buffer pointer / length pairs that the function dereferences.
//!
//! # Modules
//!
//! - [`ffi_inventory`] — slot-based inventory (add / remove / slot ops).
//! - [`ffi_pathfinding`] — grid + flow-field pathfinding.
//! - [`ffi_world`] — persistent world store with SQLite backing.
//!
//! [`csbindgen`]: https://github.com/Cysharp/csbindgen
#![allow(clippy::missing_safety_doc)]
#![allow(unsafe_op_in_unsafe_fn)]

pub mod ffi_empire;
pub mod ffi_inventory;
pub mod ffi_pathfinding;
pub mod ffi_world;
