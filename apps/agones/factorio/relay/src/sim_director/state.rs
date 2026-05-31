use std::collections::HashMap;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimSnapshot {
    #[serde(skip_deserializing, default = "Utc::now")]
    pub captured_at: DateTime<Utc>,
    pub tick: u64,
    pub evolution: f64,
    pub players: u32,
    pub pollution: f64,
    pub ups: f64,
    #[serde(default)]
    pub surfaces: HashMap<String, f64>,
}

impl SimSnapshot {
    pub fn parse(body: &str) -> serde_json::Result<Self> {
        let mut s: SimSnapshot = serde_json::from_str(body.trim())?;
        s.captured_at = Utc::now();
        Ok(s)
    }
}
