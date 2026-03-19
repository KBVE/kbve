use tokio::sync::{mpsc, watch};
use tokio_util::sync::CancellationToken;

use super::command::{ViewCommand, ViewSnapshot, ViewStatus};
use super::emitter::ViewEmitter;
use super::view::ViewActor;

/// The General settings view actor.
/// Owns its settings state internally — no external locks needed.
pub struct GeneralViewActor {
    theme: String,
    language: String,
    launch_at_login: bool,
    start_minimized: bool,
}

impl GeneralViewActor {
    pub fn new() -> Self {
        Self {
            theme: "dark".to_string(),
            language: "en".to_string(),
            launch_at_login: false,
            start_minimized: false,
        }
    }

    fn snapshot(&self) -> ViewSnapshot {
        ViewSnapshot {
            view_id: self.id().to_string(),
            status: ViewStatus::Running,
            data: serde_json::json!({
                "theme": self.theme,
                "language": self.language,
                "launch_at_login": self.launch_at_login,
                "start_minimized": self.start_minimized,
            }),
        }
    }

    fn handle_config_update(&mut self, config: &serde_json::Value) {
        if let Some(theme) = config.get("theme").and_then(|v| v.as_str()) {
            self.theme = theme.to_string();
        }
        if let Some(lang) = config.get("language").and_then(|v| v.as_str()) {
            self.language = lang.to_string();
        }
        if let Some(v) = config.get("launch_at_login").and_then(|v| v.as_bool()) {
            self.launch_at_login = v;
        }
        if let Some(v) = config.get("start_minimized").and_then(|v| v.as_bool()) {
            self.start_minimized = v;
        }
    }
}

impl ViewActor for GeneralViewActor {
    fn id(&self) -> &'static str {
        "general"
    }

    async fn run(
        mut self,
        mut cmd_rx: mpsc::Receiver<ViewCommand>,
        status_tx: watch::Sender<ViewStatus>,
        emitter: ViewEmitter,
        cancel: CancellationToken,
    ) {
        let _ = status_tx.send(ViewStatus::Running);
        emitter.emit_status(ViewStatus::Running);

        loop {
            tokio::select! {
                _ = cancel.cancelled() => {
                    break;
                }
                cmd = cmd_rx.recv() => {
                    match cmd {
                        None => break,
                        Some(ViewCommand::Start) => {
                            let _ = status_tx.send(ViewStatus::Running);
                            emitter.emit_status(ViewStatus::Running);
                        }
                        Some(ViewCommand::Stop) => {
                            let _ = status_tx.send(ViewStatus::Paused);
                            emitter.emit_status(ViewStatus::Paused);
                        }
                        Some(ViewCommand::UpdateConfig(config)) => {
                            self.handle_config_update(&config);
                            emitter.emit_config(&config);
                        }
                        Some(ViewCommand::GetSnapshot(reply)) => {
                            let _ = reply.send(self.snapshot());
                        }
                        Some(ViewCommand::PushData(_)) => {}
                        Some(ViewCommand::Custom { reply, .. }) => {
                            if let Some(reply) = reply {
                                let _ = reply.send(serde_json::json!({"ok": true}));
                            }
                        }
                    }
                }
            }
        }

        let _ = status_tx.send(ViewStatus::Stopped);
        emitter.emit_status(ViewStatus::Stopped);
    }
}
