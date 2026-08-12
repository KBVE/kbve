// The runtime is excluded on wasm, where tokio cannot spawn threads; every
// native target including mobile needs it, since terrain worldgen goes through
// it. This is deliberately not the desktop gate used for the webview.
#[cfg(not(target_family = "wasm"))]
pub mod runtime;
pub mod worker;
