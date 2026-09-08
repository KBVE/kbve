//! bevy_supa — Agnostic Supabase client with optional Bevy integration.
//!
//! # Two clients, two shapes
//!
//! The crate carries two independent clients because Supabase is really two
//! services with opposite calling conventions:
//!
//! | client            | service    | transport         | shape             | wasm32 |
//! |-------------------|------------|-------------------|-------------------|--------|
//! | [`SupaClient`]    | PostgREST  | `reqwest`+rustls  | `async fn` + await| no     |
//! | [`SupabaseClient`]| GoTrue     | `ehttp`           | callback          | yes    |
//!
//! [`SupaClient`] is service-role shaped: a server holds the key, awaits one
//! RPC, and keeps no session. [`SupabaseClient`] is player shaped: it owns a
//! refreshable [`Session`], and its callback transport needs no async runtime,
//! which is what makes it work on wasm's single thread. Neither wraps the
//! other; enable whichever the caller needs.
//!
//! # Feature matrix
//!
//! | feature  | pulls in                              | used by                         |
//! |----------|---------------------------------------|---------------------------------|
//! | `native` | `reqwest` + rustls                    | JNI plugins, servers            |
//! | `auth`   | `ehttp`                               | games, launchers, browser builds|
//! | `wasm`   | alias for `auth`                      | browser builds                  |
//! | `bevy`   | `bevy` + plugins + `Resource` impls   | Bevy games (native or WASM)     |
//!
//! `native` is in the default feature set; everything else is opt-in.
//! A consumer that wants only the type surface (e.g. a build script
//! serializing params) can depend with `default-features = false`.
//!
//! # Non-Bevy PostgREST usage (JNI, CLIs, etc.)
//!
//! ```ignore
//! use bevy_supa::SupaClient;
//!
//! let client = SupaClient::from_env().expect("SUPABASE_URL + _KEY not set");
//! let resp = client
//!     .rpc_schema("service_verify_link", serde_json::json!({
//!         "p_mc_uuid": "...",
//!         "p_code": 123456,
//!     }), "mc")
//!     .await?;
//! ```
//!
//! # Bevy usage
//!
//! ```ignore
//! use bevy::prelude::*;
//! use bevy_supa::{SupaAuthPlugin, SupabaseAuth, AuthEvent};
//!
//! App::new()
//!     .add_plugins(SupaAuthPlugin::new(url, anon_key))
//!     .add_systems(Update, (start_login, on_auth))
//!     .run();
//!
//! fn start_login(auth: Res<SupabaseAuth>) {
//!     auth.sign_in_with_password("player@example.com", "hunter2");
//! }
//!
//! fn on_auth(mut events: MessageReader<AuthEvent>) {
//!     for event in events.read() {
//!         info!("auth: {event:?}");
//!     }
//! }
//! ```

#![cfg_attr(docsrs, feature(doc_cfg))]

// Core types + error are transport-agnostic and always available.
pub mod error;
pub use error::SupaError;

// PostgREST client lives under the native transport gate.
#[cfg(feature = "native")]
mod client;
#[cfg(feature = "native")]
pub use client::{QueryBuilder, SupaClient};

// GoTrue auth + edge functions. `ehttp` compiles for native and wasm32 alike,
// so this module carries no per-target gate of its own.
#[cfg(feature = "auth")]
pub mod supabase;
#[cfg(feature = "auth")]
pub use supabase::*;

// Optional Bevy plugin layer. Each plugin is gated on `bevy` plus the
// transport whose client it installs, so enabling `bevy` alone inserts
// nothing that could not be called.
#[cfg(all(feature = "bevy", feature = "native"))]
mod bevy_plugin;
#[cfg(all(feature = "bevy", feature = "native"))]
pub use bevy_plugin::BevySupaPlugin;

#[cfg(all(feature = "bevy", feature = "auth"))]
mod bevy_auth;
#[cfg(all(feature = "bevy", feature = "auth"))]
pub use bevy_auth::{AuthEvent, SupaAuthPlugin, SupabaseAuth};
