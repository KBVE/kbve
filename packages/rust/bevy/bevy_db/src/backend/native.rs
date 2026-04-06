//! Native backend — redb (pure Rust B+tree embedded database).

use std::path::PathBuf;
use std::sync::Arc;

use redb::{Database, TableDefinition};

use crate::error::DbError;
use crate::store::DbStore;

/// Composite key format: `"table\0key"`. Using null byte as separator
/// since it won't appear in valid UTF-8 table/key names.
fn composite_key(table: &str, key: &str) -> String {
    format!("{table}\0{key}")
}

/// Extract the key portion from a composite key.
fn extract_key(composite: &str, table: &str) -> Option<String> {
    let prefix = format!("{table}\0");
    composite.strip_prefix(&prefix).map(|s| s.to_owned())
}

/// Single redb table definition for all data.
const DATA_TABLE: TableDefinition<&str, &[u8]> = TableDefinition::new("data");

/// Native database store backed by redb.
pub(crate) struct NativeStore {
    db: Arc<Database>,
}

impl NativeStore {
    /// Open or create the database at the given path.
    pub fn open(path: PathBuf) -> Result<Self, DbError> {
        let db = Database::create(path).map_err(|e| DbError::Backend(format!("redb open: {e}")))?;
        Ok(Self { db: Arc::new(db) })
    }
}

impl DbStore for NativeStore {
    async fn get(&self, table: &str, key: &str) -> Result<Option<Vec<u8>>, DbError> {
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

    async fn put(&self, table: &str, key: &str, value: Vec<u8>) -> Result<(), DbError> {
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

    async fn delete(&self, table: &str, key: &str) -> Result<(), DbError> {
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

    async fn list_keys(&self, table: &str, prefix: &str) -> Result<Vec<String>, DbError> {
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
                break; // Past the prefix range
            }
            if let Some(key) = extract_key(&composite, table) {
                keys.push(key);
            }
        }

        Ok(keys)
    }

    async fn write_batch(
        &self,
        ops: Vec<(String, String, Option<Vec<u8>>)>,
    ) -> Result<(), DbError> {
        let write_txn = self
            .db
            .begin_write()
            .map_err(|e| DbError::Backend(e.to_string()))?;
        {
            let mut tbl = write_txn
                .open_table(DATA_TABLE)
                .map_err(|e| DbError::Backend(e.to_string()))?;

            for (table, key, value) in &ops {
                let ck = composite_key(table, key);
                match value {
                    Some(bytes) => {
                        tbl.insert(ck.as_str(), bytes.as_slice())
                            .map_err(|e| DbError::Backend(e.to_string()))?;
                    }
                    None => {
                        tbl.remove(ck.as_str())
                            .map_err(|e| DbError::Backend(e.to_string()))?;
                    }
                }
            }
        }
        write_txn
            .commit()
            .map_err(|e| DbError::Backend(e.to_string()))?;
        Ok(())
    }
}
