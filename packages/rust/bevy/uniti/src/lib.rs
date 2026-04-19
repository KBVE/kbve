// FFI bridge crate: `pub unsafe extern "C" fn` consumed from Unity / C#.
//
// Every exported function carries the same safety contract: opaque
// `*mut c_void` handles must be valid pointers returned by the matching
// `uniti_*_new` constructor, not yet freed, and not used concurrently
// across threads. Per-function `# Safety` docs would all repeat that
// paragraph, and wrapping the handle conversion in an inner `unsafe { }`
// block is ceremony that doesn't change the safety reasoning — the
// caller already assumed the full unsafety contract by invoking the
// function from C.
#![allow(clippy::missing_safety_doc)]
#![allow(unsafe_op_in_unsafe_fn)]

pub mod ffi_inventory;
pub mod ffi_pathfinding;
pub mod ffi_world;
