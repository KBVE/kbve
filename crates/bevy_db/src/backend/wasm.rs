//! WASM backend — rexie (IndexedDB wrapper).
//!
//! Uses a single object store with composite keys (`"table\0key"`) to avoid
//! needing to know all table names at IndexedDB open time.

use once_cell::sync::OnceCell;
use rexie::{ObjectStore, Rexie, TransactionMode};
use wasm_bindgen::JsValue;

use crate::error::DbError;
use crate::store::DbStore;

const STORE_NAME: &str = "kv";
const DB_VERSION: u32 = 1;

/// Composite key format matching the native backend.
fn composite_key(table: &str, key: &str) -> String {
    format!("{table}\0{key}")
}

fn extract_key(composite: &str, table: &str) -> Option<String> {
    let prefix = format!("{table}\0");
    composite.strip_prefix(&prefix).map(|s| s.to_owned())
}

fn js_err(e: rexie::Error) -> DbError {
    DbError::Backend(format!("IndexedDB: {e}"))
}

/// WASM database store backed by IndexedDB via rexie.
pub(crate) struct WasmStore {
    db_name: String,
    /// Lazily initialized. First operation triggers the IndexedDB open.
    db: OnceCell<Rexie>,
}

// Safety: WASM is single-threaded. Rexie handles are !Send but we never
// actually cross threads. This unsafe impl allows Arc<WasmStore> in the
// Db resource which requires Send + Sync.
unsafe impl Send for WasmStore {}
unsafe impl Sync for WasmStore {}

impl WasmStore {
    pub fn new(db_name: String) -> Self {
        Self {
            db_name,
            db: OnceCell::new(),
        }
    }

    async fn get_db(&self) -> Result<&Rexie, DbError> {
        if let Some(db) = self.db.get() {
            return Ok(db);
        }
        let db = Rexie::builder(&self.db_name)
            .version(DB_VERSION)
            .add_object_store(ObjectStore::new(STORE_NAME))
            .build()
            .await
            .map_err(js_err)?;
        // If another call raced and initialized first, that's fine — use theirs.
        let _ = self.db.set(db);
        Ok(self.db.get().unwrap())
    }
}

impl DbStore for WasmStore {
    async fn get(&self, table: &str, key: &str) -> Result<Option<Vec<u8>>, DbError> {
        let db = self.get_db().await?;
        let ck = composite_key(table, key);

        let tx = db
            .transaction(&[STORE_NAME], TransactionMode::ReadOnly)
            .map_err(js_err)?;
        let store = tx.store(STORE_NAME).map_err(js_err)?;

        let result = store.get(JsValue::from_str(&ck)).await.map_err(js_err)?;

        tx.done().await.map_err(js_err)?;

        match result {
            Some(val) => {
                let array = js_sys::Uint8Array::new(&val);
                Ok(Some(array.to_vec()))
            }
            None => Ok(None),
        }
    }

    async fn put(&self, table: &str, key: &str, value: Vec<u8>) -> Result<(), DbError> {
        let db = self.get_db().await?;
        let ck = composite_key(table, key);

        let tx = db
            .transaction(&[STORE_NAME], TransactionMode::ReadWrite)
            .map_err(js_err)?;
        let store = tx.store(STORE_NAME).map_err(js_err)?;

        let js_key = JsValue::from_str(&ck);
        let js_val: JsValue = js_sys::Uint8Array::from(value.as_slice()).into();

        store.put(&js_val, Some(&js_key)).await.map_err(js_err)?;

        tx.done().await.map_err(js_err)?;
        Ok(())
    }

    async fn delete(&self, table: &str, key: &str) -> Result<(), DbError> {
        let db = self.get_db().await?;
        let ck = composite_key(table, key);

        let tx = db
            .transaction(&[STORE_NAME], TransactionMode::ReadWrite)
            .map_err(js_err)?;
        let store = tx.store(STORE_NAME).map_err(js_err)?;

        store.delete(JsValue::from_str(&ck)).await.map_err(js_err)?;

        tx.done().await.map_err(js_err)?;
        Ok(())
    }

    async fn list_keys(&self, table: &str, prefix: &str) -> Result<Vec<String>, DbError> {
        let db = self.get_db().await?;
        let scan_prefix = format!("{table}\0{prefix}");

        let tx = db
            .transaction(&[STORE_NAME], TransactionMode::ReadOnly)
            .map_err(js_err)?;
        let store = tx.store(STORE_NAME).map_err(js_err)?;

        // Get all keys and filter by prefix (IndexedDB doesn't support prefix scans natively)
        let all_keys = store.get_all_keys(None, None).await.map_err(js_err)?;

        let mut keys = Vec::new();
        for js_key in &all_keys {
            if let Some(s) = js_key.as_string() {
                if s.starts_with(&scan_prefix) {
                    if let Some(k) = extract_key(&s, table) {
                        keys.push(k);
                    }
                }
            }
        }

        tx.done().await.map_err(js_err)?;
        Ok(keys)
    }

    async fn write_batch(
        &self,
        ops: Vec<(String, String, Option<Vec<u8>>)>,
    ) -> Result<(), DbError> {
        let db = self.get_db().await?;

        let tx = db
            .transaction(&[STORE_NAME], TransactionMode::ReadWrite)
            .map_err(js_err)?;
        let store = tx.store(STORE_NAME).map_err(js_err)?;

        for (table, key, value) in &ops {
            let ck = composite_key(table, key);
            let js_key = JsValue::from_str(&ck);

            match value {
                Some(bytes) => {
                    let js_val: JsValue = js_sys::Uint8Array::from(bytes.as_slice()).into();
                    store.put(&js_val, Some(&js_key)).await.map_err(js_err)?;
                }
                None => {
                    store.delete(js_key).await.map_err(js_err)?;
                }
            }
        }

        tx.done().await.map_err(js_err)?;
        Ok(())
    }
}
