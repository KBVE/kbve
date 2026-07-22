use serde::Serialize;

#[derive(Debug, Clone, Serialize, specta::Type)]
pub enum PtyError {
    NotFound,
    AlreadyExists,
    Spawn(String),
    Io(String),
}

impl std::fmt::Display for PtyError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PtyError::NotFound => write!(f, "pane not found"),
            PtyError::AlreadyExists => write!(f, "pane already exists"),
            PtyError::Spawn(msg) => write!(f, "spawn error: {}", msg),
            PtyError::Io(msg) => write!(f, "io error: {}", msg),
        }
    }
}

impl std::error::Error for PtyError {}
