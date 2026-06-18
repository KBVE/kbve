use std::collections::HashMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum GameEventKind {
    Chat,
    Join,
    Leave,
    Command,
    Stats,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameEvent {
    pub kind: GameEventKind,
    pub player: Option<String>,
    pub text: String,
    pub raw: String,
    pub fields: HashMap<String, String>,
}

impl GameEvent {
    pub fn field(&self, key: &str) -> Option<&str> {
        self.fields.get(key).map(String::as_str)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IrcMessage {
    pub nick: String,
    pub channel: String,
    pub text: String,
}
