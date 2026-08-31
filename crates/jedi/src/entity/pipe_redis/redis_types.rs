use crate::entity::serde_arc_str;
use std::{collections::HashMap, sync::Arc};

use serde::{Deserialize, Serialize};

// * KeyValueInput is for GET, SET, DEL aka KV Data.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyValueInput {
    #[serde(with = "serde_arc_str")]
    pub key: Arc<str>,
    #[serde(default, with = "serde_arc_str::option")]
    pub value: Option<Arc<str>>,
    pub ttl: Option<usize>,
}

#[derive(Debug, Serialize)]
pub struct RedisResult {
    #[serde(with = "serde_arc_str")]
    pub key: Arc<str>,
    #[serde(with = "serde_arc_str::option")]
    pub value: Option<Arc<str>>,
}

// * Stream commands (XADD, XREAD)
#[derive(Debug, Deserialize)]
pub struct XAddInput {
    #[serde(with = "serde_arc_str")]
    pub stream: Arc<str>,
    #[serde(default, with = "serde_arc_str::option")]
    pub id: Option<Arc<str>>,
    #[serde(with = "serde_arc_str::map_keys")]
    pub fields: HashMap<Arc<str>, String>,
}

#[derive(Debug, Deserialize)]
pub struct StreamKeySelector {
    #[serde(with = "serde_arc_str")]
    pub stream: Arc<str>,
    #[serde(with = "serde_arc_str")]
    pub id: Arc<str>,
}

#[derive(Debug, Deserialize)]
pub struct XReadStreamInput {
    pub streams: Vec<StreamKeySelector>,
    #[serde(default)]
    pub count: Option<u64>,
    #[serde(default)]
    pub block: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct RedisStream {
    pub streams: Vec<StreamMessages>,
}

#[derive(Debug, Serialize)]
pub struct StreamMessages {
    pub stream: String,
    pub entries: Vec<StreamEntry>,
}

#[derive(Debug, Serialize)]
pub struct StreamEntry {
    pub id: String,
    pub fields: Vec<Field>,
}

#[derive(Debug, Serialize)]
pub struct Field {
    pub key: String,
    pub value: Vec<u8>,
}
