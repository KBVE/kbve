use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ItemData {
    pub id: String,
    pub name: String,
    pub item_type: String,
    pub img: String,
    pub description: String,
    pub bonuses: HashMap<String, f64>,
    pub durability: u32,
    pub weight: f64,
    pub actions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NPCData {
    pub id: String,
    pub name: String,
    pub avatar: String,
    pub slug: String,
    pub actions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DialogueOption {
    pub id: String,
    pub title: String,
    pub next_dialogue_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DialogueNode {
    pub id: String,
    pub title: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub player_response: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub background_image: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub options: Option<Vec<DialogueOption>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpeedResponse {
    pub time_ms: u64,
}
