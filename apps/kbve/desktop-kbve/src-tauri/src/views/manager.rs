use dashmap::DashMap;
use tauri::AppHandle;
use tokio::sync::{mpsc, watch};
use tokio_util::sync::CancellationToken;

use super::ViewError;
use super::command::{ViewCommand, ViewSnapshot, ViewStatus};
use super::emitter::ViewEmitter;
use super::handle::ViewHandle;
use super::view::ViewActor;

/// Central registry of all view actors. Thread-safe, lock-free reads.
/// Stored as Tauri managed state.
pub struct ViewManager {
    views: DashMap<String, ViewHandle>,
    app: AppHandle,
}

impl ViewManager {
    pub fn new(app: AppHandle) -> Self {
        Self {
            views: DashMap::new(),
            app,
        }
    }

    /// Spawn a view actor and register it. The actor immediately starts
    /// processing commands from its channel.
    pub fn register<V: ViewActor>(&self, view: V) {
        let id = view.id().to_string();

        // Bounded channel — backpressure if frontend sends faster than
        // the view can process. 64 is generous for UI command rates.
        let (cmd_tx, cmd_rx) = mpsc::channel::<ViewCommand>(64);
        let (status_tx, status_rx) = watch::channel(ViewStatus::Idle);
        let cancel = CancellationToken::new();
        let cancel_clone = cancel.clone();

        let emitter = ViewEmitter::new(self.app.clone(), &id);

        let task = tokio::spawn(async move {
            view.run(cmd_rx, status_tx, emitter, cancel_clone).await;
        });

        self.views.insert(
            id,
            ViewHandle {
                cmd_tx,
                status_rx,
                cancel,
                task,
            },
        );
    }

    /// Create a ViewEmitter for a given view id.
    #[allow(dead_code)]
    pub fn create_emitter(&self, view_id: &str) -> ViewEmitter {
        ViewEmitter::new(self.app.clone(), view_id)
    }

    /// Send a command to a view by id.
    pub async fn send(&self, view_id: &str, cmd: ViewCommand) -> Result<(), ViewError> {
        let handle = self
            .views
            .get(view_id)
            .ok_or_else(|| ViewError::from(format!("unknown view: {}", view_id)))?;
        handle.send(cmd).await
    }

    /// Get a snapshot from a view by id.
    pub async fn snapshot(&self, view_id: &str) -> Result<ViewSnapshot, ViewError> {
        let handle = self
            .views
            .get(view_id)
            .ok_or_else(|| ViewError::from(format!("unknown view: {}", view_id)))?;
        handle.snapshot().await
    }

    /// Get the current status of a view.
    pub fn status(&self, view_id: &str) -> Result<ViewStatus, ViewError> {
        let handle = self
            .views
            .get(view_id)
            .ok_or_else(|| ViewError::from(format!("unknown view: {}", view_id)))?;
        Ok(handle.status())
    }

    /// List all registered view ids and their statuses.
    pub fn list(&self) -> Vec<(String, ViewStatus)> {
        self.views
            .iter()
            .map(|entry| (entry.key().clone(), entry.value().status()))
            .collect()
    }

    /// Shutdown all views gracefully.
    #[allow(dead_code)]
    pub async fn shutdown_all(&self) {
        let handles: Vec<(String, ViewHandle)> = self
            .views
            .iter()
            .map(|entry| entry.key().clone())
            .collect::<Vec<_>>()
            .into_iter()
            .filter_map(|id| self.views.remove(&id))
            .collect();

        for (_id, handle) in handles {
            handle.shutdown().await;
        }
    }
}
