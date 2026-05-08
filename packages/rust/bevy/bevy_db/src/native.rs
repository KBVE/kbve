//! Tokio-friendly redb store — public counterpart of the internal
//! `backend::native::NativeStore` used by the Bevy plugin.
//!
//! This is the surface non-Bevy services (axum apps, Discord bots,
//! CLIs) consume when they enable `default-features = false`. It hides
//! the internal `DbStore` trait and presents a small typed API:
//! bincode in, bincode out.
//!
//! Cheap to clone — internally an `Arc<redb::Database>` — so a single
//! `NativeStore` handle can be threaded through application state and
//! cloned per request without re-opening the file.
//!
//! # Caveats
//!
//! redb's transaction API is synchronous. Calls execute on whatever
//! tokio worker thread awaits them; long-running batch writes can
//! block that worker. For typical session-state writes (single small
//! JSON blob, ≤ a few ms per commit) this is fine. If you need to
//! shield the runtime, wrap calls in [`tokio::task::spawn_blocking`].

use std::path::PathBuf;
use std::sync::Arc;

use redb::{Database, ReadableDatabase, TableDefinition};
use serde::{Serialize, de::DeserializeOwned};

use crate::error::DbError;

/// Composite key format mirrors the Bevy plugin's internal layout so a
/// single redb file can be shared between both APIs (e.g. a tool reads
/// what a Bevy app wrote, or vice versa).
fn composite_key(table: &str, key: &str) -> String {
    format!("{table}\0{key}")
}

fn extract_key(composite: &str, table: &str) -> Option<String> {
    let prefix = format!("{table}\0");
    composite.strip_prefix(&prefix).map(|s| s.to_owned())
}

const DATA_TABLE: TableDefinition<&str, &[u8]> = TableDefinition::new("data");

/// Pure-redb async key-value store, suitable for tokio runtimes.
///
/// Cloning is cheap (`Arc<Database>`); pass a clone per worker / request.
#[derive(Clone)]
pub struct NativeStore {
    db: Arc<Database>,
}

impl NativeStore {
    /// Open or create the redb file at the given path. The parent
    /// directory must already exist.
    pub fn open(path: PathBuf) -> Result<Self, DbError> {
        let db = Database::create(path).map_err(|e| DbError::Backend(format!("redb open: {e}")))?;
        Ok(Self { db: Arc::new(db) })
    }

    /// Read a bincode-encoded value at `(table, key)`. Returns
    /// `Ok(None)` for a missing key (or a not-yet-created table) and
    /// `Err(DbError::Serialization(_))` if the bytes can't be decoded
    /// as `T`.
    pub async fn get<T: DeserializeOwned>(
        &self,
        table: &str,
        key: &str,
    ) -> Result<Option<T>, DbError> {
        let bytes = self.get_bytes(table, key).await?;
        match bytes {
            None => Ok(None),
            Some(b) => {
                let (val, _) = bincode::serde::decode_from_slice(&b, bincode::config::standard())
                    .map_err(|e| DbError::Serialization(e.to_string()))?;
                Ok(Some(val))
            }
        }
    }

    /// Write a bincode-encoded value at `(table, key)`. Overwrites any
    /// existing entry.
    pub async fn put<T: Serialize>(
        &self,
        table: &str,
        key: &str,
        value: &T,
    ) -> Result<(), DbError> {
        let bytes = bincode::serde::encode_to_vec(value, bincode::config::standard())
            .map_err(|e| DbError::Serialization(e.to_string()))?;
        self.put_bytes(table, key, bytes).await
    }

    /// Remove `(table, key)`. No-op if the key is absent.
    pub async fn delete(&self, table: &str, key: &str) -> Result<(), DbError> {
        let ck = composite_key(table, key);
        let write_txn = self
            .db
            .begin_write()
            .map_err(|e| DbError::Backend(e.to_string()))?;
        {
            let mut tbl = match write_txn.open_table(DATA_TABLE) {
                Ok(t) => t,
                Err(redb::TableError::TableDoesNotExist(_)) => return Ok(()),
                Err(e) => return Err(DbError::Backend(e.to_string())),
            };
            tbl.remove(ck.as_str())
                .map_err(|e| DbError::Backend(e.to_string()))?;
        }
        write_txn
            .commit()
            .map_err(|e| DbError::Backend(e.to_string()))?;
        Ok(())
    }

    /// All keys in `table` whose ref starts with `prefix`. Empty if the
    /// table doesn't exist yet.
    pub async fn list_keys(&self, table: &str, prefix: &str) -> Result<Vec<String>, DbError> {
        let scan_prefix = format!("{table}\0{prefix}");
        let read_txn = self
            .db
            .begin_read()
            .map_err(|e| DbError::Backend(e.to_string()))?;

        let tbl = match read_txn.open_table(DATA_TABLE) {
            Ok(t) => t,
            Err(redb::TableError::TableDoesNotExist(_)) => return Ok(Vec::new()),
            Err(e) => return Err(DbError::Backend(e.to_string())),
        };

        let mut keys = Vec::new();
        let range = tbl
            .range(scan_prefix.as_str()..)
            .map_err(|e| DbError::Backend(e.to_string()))?;

        for entry in range {
            let (k, _) = entry.map_err(|e| DbError::Backend(e.to_string()))?;
            let composite = k.value().to_string();
            if !composite.starts_with(&scan_prefix) {
                break;
            }
            if let Some(key) = extract_key(&composite, table) {
                keys.push(key);
            }
        }

        Ok(keys)
    }

    // ── Internal byte-level helpers ────────────────────────────────

    async fn get_bytes(&self, table: &str, key: &str) -> Result<Option<Vec<u8>>, DbError> {
        let ck = composite_key(table, key);
        let read_txn = self
            .db
            .begin_read()
            .map_err(|e| DbError::Backend(e.to_string()))?;

        let tbl = match read_txn.open_table(DATA_TABLE) {
            Ok(t) => t,
            Err(redb::TableError::TableDoesNotExist(_)) => return Ok(None),
            Err(e) => return Err(DbError::Backend(e.to_string())),
        };

        match tbl.get(ck.as_str()) {
            Ok(Some(val)) => Ok(Some(val.value().to_vec())),
            Ok(None) => Ok(None),
            Err(e) => Err(DbError::Backend(e.to_string())),
        }
    }

    async fn put_bytes(&self, table: &str, key: &str, value: Vec<u8>) -> Result<(), DbError> {
        let ck = composite_key(table, key);
        let write_txn = self
            .db
            .begin_write()
            .map_err(|e| DbError::Backend(e.to_string()))?;
        {
            let mut tbl = write_txn
                .open_table(DATA_TABLE)
                .map_err(|e| DbError::Backend(e.to_string()))?;
            tbl.insert(ck.as_str(), value.as_slice())
                .map_err(|e| DbError::Backend(e.to_string()))?;
        }
        write_txn
            .commit()
            .map_err(|e| DbError::Backend(e.to_string()))?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::{Deserialize, Serialize};

    #[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
    struct Sample {
        name: String,
        score: u32,
    }

    fn temp_db() -> NativeStore {
        use std::sync::atomic::{AtomicU64, Ordering};
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        let id = COUNTER.fetch_add(1, Ordering::Relaxed);
        let mut path = std::env::temp_dir();
        path.push(format!("bevy_db_test_{}_{}.redb", std::process::id(), id));
        let _ = std::fs::remove_file(&path);
        NativeStore::open(path).expect("open redb")
    }

    #[tokio::test]
    async fn round_trip_typed_value() {
        let db = temp_db();
        let v = Sample {
            name: "alice".into(),
            score: 42,
        };
        db.put("samples", "a", &v).await.unwrap();
        let got: Option<Sample> = db.get("samples", "a").await.unwrap();
        assert_eq!(got, Some(v));
    }

    #[tokio::test]
    async fn missing_key_returns_none() {
        let db = temp_db();
        let got: Option<Sample> = db.get("samples", "missing").await.unwrap();
        assert!(got.is_none());
    }

    #[tokio::test]
    async fn delete_removes_entry() {
        let db = temp_db();
        let v = Sample {
            name: "bob".into(),
            score: 1,
        };
        db.put("samples", "b", &v).await.unwrap();
        db.delete("samples", "b").await.unwrap();
        let got: Option<Sample> = db.get("samples", "b").await.unwrap();
        assert!(got.is_none());
    }

    #[tokio::test]
    async fn list_keys_filters_by_prefix() {
        let db = temp_db();
        for k in ["alpha", "alfa", "beta"] {
            db.put(
                "samples",
                k,
                &Sample {
                    name: k.into(),
                    score: 0,
                },
            )
            .await
            .unwrap();
        }
        let mut keys = db.list_keys("samples", "al").await.unwrap();
        keys.sort();
        assert_eq!(keys, vec!["alfa".to_string(), "alpha".to_string()]);
    }
}
