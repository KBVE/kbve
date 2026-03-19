use serde::Serialize;
use tauri::{AppHandle, Emitter as TauriEmitter, Runtime};

/// A cloneable event emitter that views use to push events to the frontend.
/// Wraps Tauri's AppHandle and enforces the event naming convention:
/// "view:{view_id}:{event_name}"
#[derive(Clone)]
pub struct ViewEmitter<R: Runtime = tauri::Wry> {
    app: AppHandle<R>,
    view_id: String,
}

impl<R: Runtime> ViewEmitter<R> {
    pub fn new(app: AppHandle<R>, view_id: impl Into<String>) -> Self {
        Self {
            app,
            view_id: view_id.into(),
        }
    }

    /// Emit a named event with a serializable payload to the frontend.
    /// The event name is automatically prefixed with "view:{view_id}:".
    pub fn emit<T: Serialize + Clone>(&self, event: &str, payload: T) {
        let full_event = format!("view:{}:{}", self.view_id, event);
        let _ = self.app.emit(&full_event, payload);
    }

    /// Emit a status change event.
    pub fn emit_status(&self, status: super::command::ViewStatus) {
        self.emit("status", status);
    }

    /// Emit a config acknowledgement (echo back the applied config).
    pub fn emit_config(&self, config: &serde_json::Value) {
        self.emit("config", config.clone());
    }
}
