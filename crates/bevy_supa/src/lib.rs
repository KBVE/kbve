//! bevy_supa — Agnostic Supabase (PostgREST) client with optional Bevy
//! integration.
//!
//! # Feature matrix
//!
//! | feature  | pulls in                              | used by                         |
//! |----------|---------------------------------------|---------------------------------|
//! | `native` | `reqwest` + rustls                    | JNI plugins, native Bevy games  |
//! | `wasm`   | *(stub — browser `fetch` TODO)*       | future WASM Bevy builds         |
//! | `bevy`   | `bevy` + `BevySupaPlugin` + Resource  | Bevy games (native or WASM)     |
//!
//! `native` is in the default feature set; everything else is opt-in.
//! A consumer that wants only the type surface (e.g. a build script
//! serializing params) can depend with `default-features = false`.
//!
//! # Non-Bevy usage (JNI, CLIs, etc.)
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
//! use bevy_supa::{BevySupaPlugin, SupaClient};
//!
//! App::new()
//!     .add_plugins(BevySupaPlugin::from_env())
//!     .add_systems(Update, |client: Res<SupaClient>| {
//!         // kick off RPCs from a tokio task / AsyncCompute pool
//!     })
//!     .run();
//! ```

#![cfg_attr(docsrs, feature(doc_cfg))]

// Core types + error are transport-agnostic and always available.
pub mod error;
pub use error::SupaError;

// Client lives under transport-specific gates.
#[cfg(feature = "native")]
mod client;
#[cfg(feature = "native")]
pub use client::SupaClient;

// WASM transport is a deliberate stub — see module for the TODO list.
#[cfg(feature = "wasm")]
pub mod wasm;

// Optional Bevy plugin layer. Gated on `bevy` AND a transport so the
// Resource inserted is actually callable.
#[cfg(all(feature = "bevy", feature = "native"))]
mod bevy_plugin;
#[cfg(all(feature = "bevy", feature = "native"))]
pub use bevy_plugin::BevySupaPlugin;
