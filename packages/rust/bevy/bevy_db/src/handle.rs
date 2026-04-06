//! `Db` resource and `DbRequest<T>` — the public API for database operations.
//!
//! Systems use `Db` to dispatch async reads/writes via `bevy_tasker`. Each call
//! returns a `DbRequest<T>` that is polled with `try_recv()` on subsequent frames.

use std::sync::Arc;

use bevy::prelude::*;
use crossbeam_channel::{Receiver, TryRecvError, bounded};
use serde::{Serialize, de::DeserializeOwned};

use crate::backend::BackendStore;
use crate::error::DbError;
use crate::store::DbStore;

// ---------------------------------------------------------------------------
// DbRequest — non-blocking result handle
// ---------------------------------------------------------------------------

/// Handle to a pending database operation. Poll with `try_recv()`.
pub struct DbRequest<T> {
    pub(crate) rx: Receiver<Result<T, DbError>>,
}

impl<T> DbRequest<T> {
    /// Non-blocking poll. Returns `None` if the result isn't ready yet.
    pub fn try_recv(&self) -> Option<Result<T, DbError>> {
        match self.rx.try_recv() {
            Ok(result) => Some(result),
            Err(TryRecvError::Empty) => None,
            Err(TryRecvError::Disconnected) => Some(Err(DbError::ChannelClosed)),
        }
    }
}

// ---------------------------------------------------------------------------
// Db — Bevy Resource
// ---------------------------------------------------------------------------

/// Async key-value database resource. Clone is cheap (Arc).
///
/// All operations dispatch to `bevy_tasker` and return a `DbRequest<T>` handle.
/// The game thread never blocks on I/O.
#[derive(Resource, Clone)]
pub struct Db {
    pub(crate) inner: Arc<BackendStore>,
}

impl Db {
    pub(crate) fn new(store: BackendStore) -> Self {
        Self {
            inner: Arc::new(store),
        }
    }

    /// Get a typed value from a table.
    pub fn get<T: DeserializeOwned + Send + 'static>(
        &self,
        table: &str,
        key: &str,
    ) -> DbRequest<Option<T>> {
        let (tx, rx) = bounded(1);
        let store = Arc::clone(&self.inner);
        let table = table.to_owned();
        let key = key.to_owned();

        bevy_tasker::spawn(async move {
            let result = store.get(&table, &key).await;
            let typed = result.and_then(|opt| {
                opt.map(|bytes| {
                    bincode::deserialize(&bytes).map_err(|e| DbError::Serialization(e.to_string()))
                })
                .transpose()
            });
            let _ = tx.send(typed);
        })
        .detach();

        DbRequest { rx }
    }

    /// Put a typed value into a table.
    pub fn put<T: Serialize + Send + Sync + 'static>(
        &self,
        table: &str,
        key: &str,
        value: &T,
    ) -> DbRequest<()> {
        let bytes = match bincode::serialize(value) {
            Ok(b) => b,
            Err(e) => {
                let (tx, rx) = bounded(1);
                let _ = tx.send(Err(DbError::Serialization(e.to_string())));
                return DbRequest { rx };
            }
        };

        let (tx, rx) = bounded(1);
        let store = Arc::clone(&self.inner);
        let table = table.to_owned();
        let key = key.to_owned();

        bevy_tasker::spawn(async move {
            let result = store.put(&table, &key, bytes).await;
            let _ = tx.send(result);
        })
        .detach();

        DbRequest { rx }
    }

    /// Delete a key from a table.
    pub fn delete(&self, table: &str, key: &str) -> DbRequest<()> {
        let (tx, rx) = bounded(1);
        let store = Arc::clone(&self.inner);
        let table = table.to_owned();
        let key = key.to_owned();

        bevy_tasker::spawn(async move {
            let result = store.delete(&table, &key).await;
            let _ = tx.send(result);
        })
        .detach();

        DbRequest { rx }
    }

    /// List all keys in a table matching a prefix.
    pub fn list_keys(&self, table: &str, prefix: &str) -> DbRequest<Vec<String>> {
        let (tx, rx) = bounded(1);
        let store = Arc::clone(&self.inner);
        let table = table.to_owned();
        let prefix = prefix.to_owned();

        bevy_tasker::spawn(async move {
            let result = store.list_keys(&table, &prefix).await;
            let _ = tx.send(result);
        })
        .detach();

        DbRequest { rx }
    }

    /// Start building a batch write.
    pub fn batch(&self) -> crate::batch::WriteBatch {
        crate::batch::WriteBatch::new(Arc::clone(&self.inner))
    }
}
