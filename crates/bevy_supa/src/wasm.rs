//! WASM (browser) transport — **STUB, not yet implemented.**
//!
//! ============================================================================
//! TODO — native/WASM transport unification
//! ============================================================================
//!
//! The native `SupaClient` in `client.rs` uses `reqwest` + rustls, which does
//! NOT compile for `wasm32-unknown-unknown`. When we're ready to ship Supabase
//! access from browser-hosted Bevy games, the plan is:
//!
//! 1. Introduce a `Transport` trait in `src/transport.rs` with one method:
//!        `async fn post_json(&self, url: &str, headers: HeaderMap,
//!                             body: serde_json::Value) -> Result<Bytes, SupaError>`
//!
//! 2. Move the existing reqwest impl in `client.rs` behind
//!    `#[cfg(feature = "native")]` and make it implement `Transport`.
//!
//! 3. Implement a `WasmFetchTransport` here, backed by `gloo-net::http::Request`
//!    or `web-sys::Fetch`. Use `wasm-bindgen-futures` to bridge the Promise
//!    into an async fn.
//!
//! 4. Parameterize `SupaClient` over `T: Transport` so the public API shape
//!    stays identical across native and wasm. Game code doesn't care which
//!    backend is active.
//!
//! 5. Add a CI matrix target for `wasm32-unknown-unknown` so regressions get
//!    caught immediately.
//!
//! Open questions for that future PR:
//!   - Should the Bevy plugin layer spawn RPCs via `AsyncComputeTaskPool`
//!     on native AND WASM? Bevy's async task pool is cross-platform, but
//!     on WASM there's only one thread so "async compute" is a fiction.
//!   - RLS / auth JWT forwarding: in-browser we'll want the client to
//!     auto-pick up the Supabase session JWT from `window.localStorage`
//!     or a JS-land Bevy resource bridge. Not in scope for the first pass.
//!   - Should we ship a stub in both native and wasm modes that at least
//!     compiles the type shape without a transport, for compile-time API
//!     experiments? Probably not — better to fail loud.
//!
//! Until that work lands, enabling the `wasm` feature is a compile error
//! with a pointer back to this file so nobody gets a mysterious missing
//! symbol at link time.
//! ============================================================================

compile_error!(
    "bevy_supa: the `wasm` feature is a stub placeholder. \
     See packages/rust/bevy/bevy_supa/src/wasm.rs for the implementation plan. \
     Use `default-features = false, features = [\"native\"]` until the \
     browser transport lands."
);
