//! Native backend — redb (pure Rust B+tree embedded database).

use std::path::PathBuf;
use std::sync::Arc;

use redb::{Database, ReadableDatabase, TableDefinition};

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
    /// Open or create the database at the given path. If the file exists but
    /// can't be opened because the on-disk format is from an older redb major
    /// version, the file is rotated to `<name>.bak-<unix-ts>` and a fresh
    /// database is created. Players' progress is preserved on disk (just
    /// inaccessible to the new code) so a future migration tool can recover
    /// it.
    pub fn open(path: PathBuf) -> Result<Self, DbError> {
        match Database::create(&path) {
            Ok(db) => Ok(Self { db: Arc::new(db) }),
            Err(err) if Self::is_upgrade_error(&err) => {
                let backup = rotate_path(&path);
                if path.exists() {
                    std::fs::rename(&path, &backup).map_err(|e| {
                        DbError::Backend(format!(
                            "redb open failed with version mismatch; backup rename also failed: {e}"
                        ))
                    })?;
                }
                eprintln!(
                    "[bevy_db] on-disk redb file from an older version detected; \
                     rotated to {} and creating a fresh database. The old data \
                     stays on disk for manual recovery.",
                    backup.display()
                );
                let db = Database::create(&path)
                    .map_err(|e| DbError::Backend(format!("redb open after rotate: {e}")))?;
                Ok(Self { db: Arc::new(db) })
            }
            Err(e) => Err(DbError::Backend(format!("redb open: {e}"))),
        }
    }

    /// Heuristic match against redb's "Manual upgrade required" wording.
    /// redb stores the file-format version in the file header, so any error
    /// containing the upgrade phrase means the file predates the current
    /// redb major. Other open failures (corruption, IO) intentionally fall
    /// through so they aren't silently rotated away.
    fn is_upgrade_error(err: &redb::DatabaseError) -> bool {
        let msg = err.to_string();
        msg.contains("Manual upgrade required") || msg.contains("file format version")
    }
}

fn rotate_path(path: &std::path::Path) -> PathBuf {
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let mut backup = path.to_path_buf();
    let file_name = path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("kbve_db.redb");
    backup.set_file_name(format!("{file_name}.bak-{ts}"));
    backup
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
