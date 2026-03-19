use serde::{Deserialize, Serialize};
use tokio::sync::oneshot;

/// Commands sent from the frontend (via Tauri) into a view's actor task.
/// Each view receives these through its mpsc channel and handles them
/// within its own task — no shared mutable state needed.
#[derive(Debug)]
#[allow(dead_code)]
pub enum ViewCommand {
    /// Request the view to start its background work.
    Start,

    /// Request the view to pause/stop its background work.
    Stop,

    /// Update view-specific configuration. The payload is a JSON value
    /// so each view can deserialize its own config shape.
    UpdateConfig(serde_json::Value),

    /// Push a data chunk into the view (e.g., audio samples, text input).
    PushData(Vec<u8>),

    /// Request a snapshot of the view's current state.
    /// The view sends the response back through the oneshot channel.
    GetSnapshot(oneshot::Sender<ViewSnapshot>),

    /// Custom command with a string key and JSON payload.
    /// Allows views to define their own command vocabulary without
    /// extending this enum.
    Custom {
        action: String,
        payload: serde_json::Value,
        reply: Option<oneshot::Sender<serde_json::Value>>,
    },
}

/// A point-in-time snapshot of a view's state, returned via GetSnapshot.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ViewSnapshot {
    pub view_id: String,
    pub status: ViewStatus,
    pub data: serde_json::Value,
}

/// The lifecycle status of a view actor.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ViewStatus {
    /// Registered but not yet started.
    Idle,
    /// Actor task is running and processing commands.
    Running,
    /// Temporarily paused but task is still alive.
    Paused,
    /// Task has exited (graceful shutdown or error).
    Stopped,
}

impl Default for ViewStatus {
    fn default() -> Self {
        Self::Idle
    }
}
