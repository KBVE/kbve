use tokio::sync::{mpsc, watch};
use tokio_util::sync::CancellationToken;

use super::command::{ViewCommand, ViewStatus};
use super::emitter::ViewEmitter;

/// The actor trait. Each view implements this to define its behavior.
///
/// The key principle: the view **owns** its state inside `run()`.
/// No external code ever touches view state directly — everything
/// goes through the mpsc channel as ViewCommand messages.
///
/// This eliminates lock contention entirely. The view's run loop is
/// the single owner/mutator of all view-specific state.
pub trait ViewActor: Send + 'static {
    /// Unique identifier matching the frontend view registry id.
    fn id(&self) -> &'static str;

    /// The actor's main loop. Called once when the view is registered.
    ///
    /// - `cmd_rx`: receives commands from the frontend / ViewManager
    /// - `status_tx`: publishes status changes (subscribers get notified)
    /// - `emitter`: sends events to the frontend via Tauri event system
    /// - `cancel`: signals when the app is shutting down
    ///
    /// Implementors should:
    /// 1. Set status to Running
    /// 2. Loop on cmd_rx.recv() with tokio::select! on cancel
    /// 3. Handle each ViewCommand variant
    /// 4. Use emitter.emit() to push events to the frontend
    /// 5. Set status to Stopped before returning
    fn run(
        self,
        cmd_rx: mpsc::Receiver<ViewCommand>,
        status_tx: watch::Sender<ViewStatus>,
        emitter: ViewEmitter,
        cancel: CancellationToken,
    ) -> impl std::future::Future<Output = ()> + Send;
}
