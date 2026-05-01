//! Optional Bevy integration — gated on `feature = "bevy"`.
//!
//! Exposes a single `BevySupaPlugin` that inserts a [`SupaClient`] as a
//! Bevy `Resource`. That's all it does on purpose: the lean
//! resource-insertion shape stays out of the way of game-side code,
//! which is free to add its own systems that call `rpc` / `rpc_schema`
//! from async task pools, poll responses into events, etc.
//!
//! # Example
//!
//! ```ignore
//! use bevy::prelude::*;
//! use bevy_supa::{BevySupaPlugin, SupaClient};
//!
//! App::new()
//!     // Pulls SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from the env.
//!     .add_plugins(BevySupaPlugin::from_env())
//!     // Or construct explicitly:
//!     // .add_plugins(BevySupaPlugin::with_client(
//!     //     SupaClient::new("http://kong.kilobase.svc.cluster.local:8000", key)
//!     // ))
//!     .add_systems(Update, use_supa)
//!     .run();
//!
//! fn use_supa(client: Res<SupaClient>) {
//!     // Bevy 0.18 has no built-in async system adapter — callers typically
//!     // hand the client off to an `AsyncComputeTaskPool` task.
//!     let _ = client.clone();
//! }
//! ```

use bevy::ecs::resource::Resource;
use bevy::prelude::*;

use crate::client::SupaClient;

// Make SupaClient a Bevy Resource under the `bevy` feature. Wrapping in
// a newtype is tempting, but leaving the Resource impl on SupaClient
// itself means game code uses the same type as JNI / CLI consumers —
// no shim, no awkward `.0`.
impl Resource for SupaClient {}

/// Plugin that inserts a [`SupaClient`] resource into the Bevy world.
///
/// Construct via [`Self::from_env`] (env-var driven, soft-fails with
/// a warning) or [`Self::with_client`] (explicit, hard requirement).
pub struct BevySupaPlugin {
    client: Option<SupaClient>,
}

impl BevySupaPlugin {
    /// Build the plugin from `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.
    ///
    /// If either env var is missing or empty the plugin logs a
    /// warning at `Plugin::build` time and installs nothing — games
    /// that want hard-fail behavior should construct
    /// [`SupaClient::from_env`] themselves and pass to
    /// [`Self::with_client`].
    pub fn from_env() -> Self {
        Self {
            client: SupaClient::from_env(),
        }
    }

    /// Build the plugin with an already-constructed client.
    ///
    /// Useful when you want explicit URL / key (e.g. an in-cluster
    /// Kong endpoint) instead of env-driven config.
    pub fn with_client(client: SupaClient) -> Self {
        Self {
            client: Some(client),
        }
    }
}

impl Plugin for BevySupaPlugin {
    fn build(&self, app: &mut App) {
        match &self.client {
            Some(client) => {
                app.insert_resource(client.clone());
                tracing::info!("bevy_supa: SupaClient resource installed");
            }
            None => {
                tracing::warn!(
                    "bevy_supa: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — \
                     SupaClient resource NOT installed. Systems that call \
                     Res<SupaClient> will fail to schedule."
                );
            }
        }
    }
}
