//! Internal backend trait — implemented by native (redb) and WASM (rexie) backends.

use crate::error::DbError;

/// Async key-value store contract. Each backend implements this.
/// Keys and tables are strings; values are opaque bytes (bincode-serialized by the handle layer).
pub(crate) trait DbStore: Send + Sync + 'static {
    /// Get a value by table + key. Returns None if not found.
    fn get(
        &self,
        table: &str,
        key: &str,
    ) -> impl std::future::Future<Output = Result<Option<Vec<u8>>, DbError>> + Send;

    /// Put a value at table + key. Overwrites if exists.
    fn put(
        &self,
        table: &str,
        key: &str,
        value: Vec<u8>,
    ) -> impl std::future::Future<Output = Result<(), DbError>> + Send;

    /// Delete a key from a table. No-op if not found.
    fn delete(
        &self,
        table: &str,
        key: &str,
    ) -> impl std::future::Future<Output = Result<(), DbError>> + Send;

    /// List all keys in a table matching a prefix.
    fn list_keys(
        &self,
        table: &str,
        prefix: &str,
    ) -> impl std::future::Future<Output = Result<Vec<String>, DbError>> + Send;

    /// Atomically write a batch of operations.
    /// Each tuple: (table, key, Some(value)) for put or (table, key, None) for delete.
    fn write_batch(
        &self,
        ops: Vec<(String, String, Option<Vec<u8>>)>,
    ) -> impl std::future::Future<Output = Result<(), DbError>> + Send;
}
