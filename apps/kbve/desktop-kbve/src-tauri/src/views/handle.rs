use tokio::sync::{mpsc, oneshot, watch};
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;

use super::ViewError;
use super::command::{ViewCommand, ViewSnapshot, ViewStatus};

/// The external handle to a running view actor.
/// Stored in the ViewManager's DashMap. Contains only channels and
/// control primitives — no mutable state.
#[allow(dead_code)]
pub struct ViewHandle {
    /// Send commands into the view's actor task.
    pub cmd_tx: mpsc::Sender<ViewCommand>,

    /// Watch the view's current status (changes pushed by the actor).
    pub status_rx: watch::Receiver<ViewStatus>,

    /// Token to signal graceful cancellation of the actor task.
    pub cancel: CancellationToken,

    /// Handle to the spawned tokio task (for join on shutdown).
    pub task: JoinHandle<()>,
}

impl ViewHandle {
    /// Send a command to the view actor. Returns error if the actor has exited.
    pub async fn send(&self, cmd: ViewCommand) -> Result<(), ViewError> {
        self.cmd_tx
            .send(cmd)
            .await
            .map_err(|_| ViewError::from("view actor has exited".to_string()))
    }

    /// Request a snapshot from the view actor.
    pub async fn snapshot(&self) -> Result<ViewSnapshot, ViewError> {
        let (tx, rx) = oneshot::channel();
        self.send(ViewCommand::GetSnapshot(tx)).await?;
        rx.await
            .map_err(|_| ViewError::from("view actor dropped snapshot reply".to_string()))
    }

    /// Get the current status without blocking.
    pub fn status(&self) -> ViewStatus {
        *self.status_rx.borrow()
    }

    /// Signal the actor to shut down and wait for it to finish.
    pub async fn shutdown(self) {
        self.cancel.cancel();
        // Ignore join error — the task may have already exited.
        let _ = self.task.await;
    }
}
