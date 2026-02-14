use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClickHouseQueryInput {
    pub query: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClickHouseInsertInput {
    pub table: String,
    pub rows: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClickHouseDDLInput {
    pub statement: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClickHouseQueryResult {
    pub rows: Vec<serde_json::Value>,
    pub count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClickHouseDDLResult {
    pub success: bool,
    pub statement: String,
}
