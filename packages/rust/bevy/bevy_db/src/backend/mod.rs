//! Platform-specific database backends.

#[cfg(not(target_arch = "wasm32"))]
mod native;

#[cfg(target_arch = "wasm32")]
mod wasm;

#[cfg(not(target_arch = "wasm32"))]
pub(crate) use native::NativeStore as BackendStore;

#[cfg(target_arch = "wasm32")]
pub(crate) use wasm::WasmStore as BackendStore;
