//! `WriteBatch` — builder for atomic multi-key writes.

use std::sync::Arc;

use crossbeam_channel::bounded;
use serde::Serialize;

use crate::backend::BackendStore;
use crate::error::DbError;
use crate::handle::DbRequest;
use crate::store::DbStore;

/// Accumulates put/delete operations and executes them atomically.
pub struct WriteBatch {
    store: Arc<BackendStore>,
    ops: Vec<(String, String, Option<Vec<u8>>)>,
}

impl WriteBatch {
    pub(crate) fn new(store: Arc<BackendStore>) -> Self {
        Self {
            store,
            ops: Vec::new(),
        }
    }

    /// Queue a put operation.
    pub fn put<T: Serialize>(
        &mut self,
        table: &str,
        key: &str,
        value: &T,
    ) -> Result<&mut Self, DbError> {
        let bytes = bincode::serde::encode_to_vec(value, bincode::config::standard())
            .map_err(|e| DbError::Serialization(e.to_string()))?;
        self.ops
            .push((table.to_owned(), key.to_owned(), Some(bytes)));
        Ok(self)
    }

    /// Queue a delete operation.
    pub fn delete(&mut self, table: &str, key: &str) -> &mut Self {
        self.ops.push((table.to_owned(), key.to_owned(), None));
        self
    }

    /// Execute all queued operations atomically. Returns a `DbRequest<()>` handle.
    pub fn execute(self) -> DbRequest<()> {
        let (tx, rx) = bounded(1);
        let store = self.store;
        let ops = self.ops;

        crate::task::spawn_db(async move {
            let result = store.write_batch(ops).await;
            let _ = tx.send(result);
        });

        DbRequest { rx }
    }
}
