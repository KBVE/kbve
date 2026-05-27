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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IrcMessage {
    pub nick: String,
    pub channel: String,
    pub text: String,
}
