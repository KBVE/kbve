//! `bevy_db` — Cross-platform async key-value persistence.
//!
//! Uses `redb` (pure Rust B+tree) on native and `rexie` (IndexedDB) on WASM.
//!
//! Two consumer-facing shapes, picked by feature flag:
//!
//! ## `bevy-plugin` (default) — Bevy ECS plugin
//!
//! ```rust,ignore
//! app.add_plugins(BevyDbPlugin::default());
//!
//! fn save_system(db: Res<Db>) {
//!     let _req = db.put("players", "hero", &player_state);
//! }
//!
//! fn load_system(db: Res<Db>, mut pending: Local<Option<DbRequest<Option<PlayerState>>>>) {
//!     if pending.is_none() {
//!         *pending = Some(db.get("players", "hero"));
//!     }
//!     if let Some(ref req) = *pending
//!         && let Some(result) = req.try_recv()
//!     {
//!         *pending = None;
//!     }
//! }
//! ```
//!
//! ## `default-features = false` — direct async store
//!
//! For tokio-based services (Discord bots, axum apps, CLIs) that don't
//! run a Bevy `App`. Use [`native::NativeStore`] directly:
//!
//! ```rust,ignore
//! let store = NativeStore::open("/data/app.redb".into())?;
//! store.put("sessions", "abc123", &session).await?;
//! let loaded: Option<Session> = store.get("sessions", "abc123").await?;
//! ```

pub mod backend;
pub mod error;
pub(crate) mod store;

#[cfg(not(target_arch = "wasm32"))]
pub mod native;

#[cfg(feature = "bevy-plugin")]
pub mod batch;
#[cfg(feature = "bevy-plugin")]
pub mod handle;
#[cfg(feature = "bevy-plugin")]
pub(crate) mod task;

pub use error::DbError;

#[cfg(feature = "bevy-plugin")]
pub use handle::{Db, DbRequest};

#[cfg(not(target_arch = "wasm32"))]
pub use native::NativeStore;

#[cfg(feature = "bevy-plugin")]
mod plugin {
    use bevy::prelude::*;

    use crate::backend;
    use crate::handle::Db;

    /// Plugin that initializes the database backend and inserts the `Db` resource.
    pub struct BevyDbPlugin {
        /// Database name. On native this becomes the filename; on WASM the IndexedDB name.
        pub db_name: String,
    }

    impl Default for BevyDbPlugin {
        fn default() -> Self {
            Self {
                db_name: "kbve_db".into(),
            }
        }
    }

    impl Plugin for BevyDbPlugin {
        fn build(&self, app: &mut App) {
            #[cfg(not(target_arch = "wasm32"))]
            {
                let path = dirs::data_local_dir()
                    .unwrap_or_else(|| std::path::PathBuf::from("."))
                    .join(&self.db_name)
                    .with_extension("redb");

                // Prior process may have panic-aborted with the redb lock byte
                // still set in the file header. Recover by moving the stuck
                // file aside and retrying with a fresh database.
                let store = match backend::BackendStore::open(path.clone()) {
                    Ok(s) => s,
                    Err(first_err) => {
                        let suffix = std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .map(|d| d.as_secs())
                            .unwrap_or(0);
                        let stuck = path.with_extension(format!("redb.stuck-{suffix}"));
                        let _ = std::fs::rename(&path, &stuck);
                        backend::BackendStore::open(path).unwrap_or_else(|e| {
                            panic!(
                                "failed to open bevy_db database after stuck-file recovery (first={first_err}, retry={e})"
                            )
                        })
                    }
                };
                app.insert_resource(Db::new(store));
            }

            #[cfg(target_arch = "wasm32")]
            {
                let store = backend::BackendStore::new(self.db_name.clone());
                app.insert_resource(Db::new(store));
            }
        }
    }
}

#[cfg(feature = "bevy-plugin")]
pub use plugin::BevyDbPlugin;
