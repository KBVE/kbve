use serde::{Deserialize, Serialize};
use std::future::Future;
use std::pin::Pin;

/// Trait that each backend view module implements.
/// Views are self-contained async units that register their own Tauri commands
/// and manage their own state lifecycle.
pub trait View: Send + Sync + 'static {
    /// Unique identifier matching the frontend view registry id.
    fn id(&self) -> &'static str;

    /// Called once during app startup. Use for async initialization
    /// (spawning background tasks, loading config, etc).
    fn init(&self) -> Pin<Box<dyn Future<Output = Result<(), ViewError>> + Send + '_>> {
        Box::pin(async { Ok(()) })
    }

    /// Called during graceful shutdown. Clean up resources, cancel tasks.
    fn shutdown(&self) -> Pin<Box<dyn Future<Output = ()> + Send + '_>> {
        Box::pin(async {})
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ViewError {
    pub message: String,
}

impl std::fmt::Display for ViewError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for ViewError {}

impl From<String> for ViewError {
    fn from(message: String) -> Self {
        Self { message }
    }
}
