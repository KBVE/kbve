//! Error types for bevy_db operations.

/// Errors returned by database operations.
#[derive(Debug, Clone)]
pub enum DbError {
    /// Key not found in the store.
    NotFound,
    /// Serialization or deserialization failed.
    Serialization(String),
    /// Backend-specific error (redb I/O, IndexedDB DOM exception, etc.).
    Backend(String),
    /// The result channel was closed before a response arrived.
    ChannelClosed,
}

impl std::fmt::Display for DbError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NotFound => write!(f, "key not found"),
            Self::Serialization(msg) => write!(f, "serialization error: {msg}"),
            Self::Backend(msg) => write!(f, "backend error: {msg}"),
            Self::ChannelClosed => write!(f, "result channel closed"),
        }
    }
}

impl std::error::Error for DbError {}
