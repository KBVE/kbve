//! `bevy_db` — Cross-platform async key-value persistence for Bevy.
//!
//! Uses `redb` (pure Rust B+tree) on native and `rexie` (IndexedDB) on WASM.
//! All I/O is dispatched off the game thread via `bevy_tasker`.
//!
//! # Usage
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
//!     if let Some(ref req) = *pending {
//!         if let Some(result) = req.try_recv() {
//!             // Use result
//!             *pending = None;
//!         }
//!     }
//! }
//! ```

pub mod backend;
pub mod batch;
pub mod error;
pub mod handle;
pub(crate) mod store;
pub(crate) mod task;

pub use error::DbError;
pub use handle::{Db, DbRequest};

use bevy::prelude::*;

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

            let store = backend::BackendStore::open(path).expect("failed to open bevy_db database");
            app.insert_resource(Db::new(store));
        }

        #[cfg(target_arch = "wasm32")]
        {
            let store = backend::BackendStore::new(self.db_name.clone());
            app.insert_resource(Db::new(store));
        }
    }
}
