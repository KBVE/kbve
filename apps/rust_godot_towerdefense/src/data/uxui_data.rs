use godot::prelude::*;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Serialize, Deserialize)]
pub struct UxUiElement {
    pub element_type: String,
    pub id: String,
    pub properties: Value,
}