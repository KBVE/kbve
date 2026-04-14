//! Ship state persistence via JSON file store.
//!
//! Stores ship metadata (owner, anchor, heading, schematic name) so
//! ships survive server restarts. Block-level data is NOT stored here —
//! the blocks exist in the Minecraft world. This tracks which ships
//! exist and where they are.
//!
//! Uses a simple JSON file (`ships.json`) for dev. The API is designed
//! so the backend can be swapped to SQLite or PostgreSQL later without
//! changing the Java-side JNI interface.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tracing::{error, info};

/// Ship record for persistence.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShipRecord {
    pub ship_id: String,
    pub owner_uuid: String,
    pub ship_name: String,
    pub anchor_x: i32,
    pub anchor_y: i32,
    pub anchor_z: i32,
    pub heading: f32,
    pub block_count: i32,
    pub integrity: f32,
}

/// Thread-safe JSON file store.
pub struct ShipDb {
    path: PathBuf,
    records: Mutex<Vec<ShipRecord>>,
}

impl ShipDb {
    /// Open or create the ship store at the given path.
    pub fn open(path: &str) -> Result<Self, String> {
        let path = PathBuf::from(path);

        let records = if path.exists() {
            let data = fs::read_to_string(&path)
                .map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;
            serde_json::from_str(&data).unwrap_or_else(|e| {
                error!(
                    "[ShipDB] Failed to parse {}: {} — starting fresh",
                    path.display(),
                    e
                );
                Vec::new()
            })
        } else {
            Vec::new()
        };

        info!(
            "[ShipDB] Opened {} ({} ships)",
            path.display(),
            records.len()
        );
        Ok(Self {
            path,
            records: Mutex::new(records),
        })
    }

    /// Flush to disk.
    fn save(&self, records: &[ShipRecord]) -> Result<(), String> {
        let json = serde_json::to_string_pretty(records)
            .map_err(|e| format!("Failed to serialize ships: {}", e))?;
        fs::write(&self.path, json)
            .map_err(|e| format!("Failed to write {}: {}", self.path.display(), e))?;
        Ok(())
    }

    /// Insert or replace a ship record.
    pub fn upsert(&self, ship: &ShipRecord) -> Result<(), String> {
        let mut records = self.records.lock().map_err(|e| e.to_string())?;
        if let Some(existing) = records.iter_mut().find(|r| r.ship_id == ship.ship_id) {
            *existing = ship.clone();
        } else {
            records.push(ship.clone());
        }
        self.save(&records)
    }

    /// Delete a ship record.
    pub fn delete(&self, ship_id: &str) -> Result<(), String> {
        let mut records = self.records.lock().map_err(|e| e.to_string())?;
        records.retain(|r| r.ship_id != ship_id);
        self.save(&records)
    }

    /// Load all ships.
    pub fn load_all(&self) -> Result<Vec<ShipRecord>, String> {
        let records = self.records.lock().map_err(|e| e.to_string())?;
        Ok(records.clone())
    }

    /// Delete all ships.
    pub fn delete_all(&self) -> Result<usize, String> {
        let mut records = self.records.lock().map_err(|e| e.to_string())?;
        let count = records.len();
        records.clear();
        self.save(&records)?;
        Ok(count)
    }
}
