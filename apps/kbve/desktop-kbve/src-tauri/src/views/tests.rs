#[cfg(test)]
mod tests {
    use tokio::sync::{mpsc, watch};
    use tokio_util::sync::CancellationToken;

    use crate::views::command::{ViewCommand, ViewSnapshot, ViewStatus};
    use crate::views::general::GeneralViewActor;
    use crate::views::view::ViewActor;

    /// Helper: spawn a GeneralViewActor and return its command sender,
    /// status receiver, and cancel token. No AppHandle/Emitter needed.
    fn spawn_test_actor() -> (
        mpsc::Sender<ViewCommand>,
        watch::Receiver<ViewStatus>,
        CancellationToken,
    ) {
        let (cmd_tx, cmd_rx) = mpsc::channel::<ViewCommand>(64);
        let (status_tx, status_rx) = watch::channel(ViewStatus::Idle);
        let cancel = CancellationToken::new();
        let cancel_clone = cancel.clone();

        let actor = GeneralViewActor::new_without_emitter();

        tokio::spawn(async move {
            actor
                .run_without_emitter(cmd_rx, status_tx, cancel_clone)
                .await;
        });

        (cmd_tx, status_rx, cancel)
    }

    #[tokio::test]
    async fn actor_starts_in_running_state() {
        let (_cmd_tx, mut status_rx, _cancel) = spawn_test_actor();

        // Wait for the actor to set Running
        status_rx.changed().await.unwrap();
        assert_eq!(*status_rx.borrow(), ViewStatus::Running);
    }

    #[tokio::test]
    async fn actor_responds_to_stop_command() {
        let (cmd_tx, mut status_rx, _cancel) = spawn_test_actor();

        // Wait for Running
        status_rx.changed().await.unwrap();

        // Send Stop
        cmd_tx.send(ViewCommand::Stop).await.unwrap();

        // Wait for status change
        status_rx.changed().await.unwrap();
        assert_eq!(*status_rx.borrow(), ViewStatus::Paused);
    }

    #[tokio::test]
    async fn actor_resumes_after_stop() {
        let (cmd_tx, mut status_rx, _cancel) = spawn_test_actor();

        status_rx.changed().await.unwrap(); // Running

        cmd_tx.send(ViewCommand::Stop).await.unwrap();
        status_rx.changed().await.unwrap(); // Paused
        assert_eq!(*status_rx.borrow(), ViewStatus::Paused);

        cmd_tx.send(ViewCommand::Start).await.unwrap();
        status_rx.changed().await.unwrap(); // Running again
        assert_eq!(*status_rx.borrow(), ViewStatus::Running);
    }

    #[tokio::test]
    async fn actor_returns_snapshot_with_defaults() {
        let (cmd_tx, mut status_rx, _cancel) = spawn_test_actor();

        status_rx.changed().await.unwrap(); // Running

        let (snap_tx, snap_rx) = tokio::sync::oneshot::channel::<ViewSnapshot>();
        cmd_tx
            .send(ViewCommand::GetSnapshot(snap_tx))
            .await
            .unwrap();

        let snapshot = snap_rx.await.unwrap();
        assert_eq!(snapshot.view_id, "general");
        assert_eq!(snapshot.status, ViewStatus::Running);
        assert_eq!(snapshot.data["theme"], "dark");
        assert_eq!(snapshot.data["language"], "en");
        assert_eq!(snapshot.data["launch_at_login"], false);
        assert_eq!(snapshot.data["start_minimized"], false);
    }

    #[tokio::test]
    async fn actor_updates_config() {
        let (cmd_tx, mut status_rx, _cancel) = spawn_test_actor();

        status_rx.changed().await.unwrap(); // Running

        // Update config
        cmd_tx
            .send(ViewCommand::UpdateConfig(serde_json::json!({
                "theme": "light",
                "language": "es",
                "launch_at_login": true,
            })))
            .await
            .unwrap();

        // Small yield to let the actor process the command
        tokio::task::yield_now().await;

        // Get snapshot to verify
        let (snap_tx, snap_rx) = tokio::sync::oneshot::channel::<ViewSnapshot>();
        cmd_tx
            .send(ViewCommand::GetSnapshot(snap_tx))
            .await
            .unwrap();

        let snapshot = snap_rx.await.unwrap();
        assert_eq!(snapshot.data["theme"], "light");
        assert_eq!(snapshot.data["language"], "es");
        assert_eq!(snapshot.data["launch_at_login"], true);
        // start_minimized should remain default
        assert_eq!(snapshot.data["start_minimized"], false);
    }

    #[tokio::test]
    async fn actor_partial_config_update() {
        let (cmd_tx, mut status_rx, _cancel) = spawn_test_actor();

        status_rx.changed().await.unwrap();

        // Only update theme — other fields should stay default
        cmd_tx
            .send(ViewCommand::UpdateConfig(serde_json::json!({
                "theme": "system",
            })))
            .await
            .unwrap();

        tokio::task::yield_now().await;

        let (snap_tx, snap_rx) = tokio::sync::oneshot::channel::<ViewSnapshot>();
        cmd_tx
            .send(ViewCommand::GetSnapshot(snap_tx))
            .await
            .unwrap();

        let snapshot = snap_rx.await.unwrap();
        assert_eq!(snapshot.data["theme"], "system");
        assert_eq!(snapshot.data["language"], "en"); // unchanged
    }

    #[tokio::test]
    async fn actor_shuts_down_on_cancel() {
        let (cmd_tx, mut status_rx, cancel) = spawn_test_actor();

        status_rx.changed().await.unwrap(); // Running

        // Cancel the actor
        cancel.cancel();

        // Wait for Stopped
        status_rx.changed().await.unwrap();
        assert_eq!(*status_rx.borrow(), ViewStatus::Stopped);

        // Channel should be closed now
        let result = cmd_tx.send(ViewCommand::Start).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn actor_shuts_down_on_channel_close() {
        let (cmd_tx, mut status_rx, _cancel) = spawn_test_actor();

        status_rx.changed().await.unwrap(); // Running

        // Drop the sender — actor should detect and exit
        drop(cmd_tx);

        status_rx.changed().await.unwrap();
        assert_eq!(*status_rx.borrow(), ViewStatus::Stopped);
    }

    #[tokio::test]
    async fn view_status_serializes_to_snake_case() {
        let json = serde_json::to_string(&ViewStatus::Running).unwrap();
        assert_eq!(json, "\"running\"");

        let json = serde_json::to_string(&ViewStatus::Idle).unwrap();
        assert_eq!(json, "\"idle\"");

        let json = serde_json::to_string(&ViewStatus::Paused).unwrap();
        assert_eq!(json, "\"paused\"");

        let json = serde_json::to_string(&ViewStatus::Stopped).unwrap();
        assert_eq!(json, "\"stopped\"");
    }

    #[tokio::test]
    async fn view_status_deserializes_from_snake_case() {
        let status: ViewStatus = serde_json::from_str("\"running\"").unwrap();
        assert_eq!(status, ViewStatus::Running);

        let status: ViewStatus = serde_json::from_str("\"idle\"").unwrap();
        assert_eq!(status, ViewStatus::Idle);
    }

    #[test]
    fn view_status_default_is_idle() {
        assert_eq!(ViewStatus::default(), ViewStatus::Idle);
    }

    #[test]
    fn actor_id_is_general() {
        let actor = GeneralViewActor::new_without_emitter();
        assert_eq!(actor.id(), "general");
    }
}
