use std::time::Duration;

use tokio::sync::mpsc;
use tokio::time::timeout;

use super::config::PtySpawnConfig;
use super::error::PtyError;
use super::event::PtyEvent;
use super::manager::PtyManager;

fn base_config() -> PtySpawnConfig {
    PtySpawnConfig {
        shell: None,
        args: Vec::new(),
        cwd: None,
        rows: 24,
        cols: 80,
        env: Vec::new(),
    }
}

async fn recv_data(rx: &mut mpsc::Receiver<PtyEvent>, timeout_ms: u64) -> PtyEvent {
    timeout(Duration::from_millis(timeout_ms), rx.recv())
        .await
        .expect("timed out waiting for pty event")
        .expect("event channel closed unexpectedly")
}

#[tokio::test(flavor = "multi_thread")]
async fn spawn_echo_emits_data_then_exit() {
    let (tx, mut rx) = mpsc::channel(64);
    let manager = PtyManager::new(tx);

    let cfg = PtySpawnConfig {
        shell: Some("/bin/echo".to_string()),
        args: vec!["hi".to_string()],
        ..base_config()
    };

    manager.spawn("pane-echo".to_string(), cfg).unwrap();

    let mut collected = Vec::new();
    loop {
        match recv_data(&mut rx, 5000).await {
            PtyEvent::Data { pane_id, bytes } => {
                assert_eq!(pane_id, "pane-echo");
                collected.extend(bytes);
            }
            PtyEvent::Exit { pane_id, .. } => {
                assert_eq!(pane_id, "pane-echo");
                break;
            }
        }
    }

    let output = String::from_utf8_lossy(&collected);
    assert!(
        output.contains("hi"),
        "expected output to contain 'hi', got: {output:?}"
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn interactive_cat_write_and_kill() {
    let (tx, mut rx) = mpsc::channel(64);
    let manager = PtyManager::new(tx);

    let cfg = PtySpawnConfig {
        shell: Some("/bin/cat".to_string()),
        args: Vec::new(),
        ..base_config()
    };

    manager.spawn("pane-cat".to_string(), cfg).unwrap();
    manager.write("pane-cat", b"ping\n").unwrap();

    let mut collected = Vec::new();
    loop {
        match recv_data(&mut rx, 5000).await {
            PtyEvent::Data { bytes, .. } => {
                collected.extend(bytes);
                if String::from_utf8_lossy(&collected).contains("ping") {
                    break;
                }
            }
            PtyEvent::Exit { .. } => panic!("cat exited before echoing input"),
        }
    }

    manager.kill("pane-cat").unwrap();

    loop {
        match recv_data(&mut rx, 5000).await {
            PtyEvent::Exit { pane_id, .. } => {
                assert_eq!(pane_id, "pane-cat");
                break;
            }
            PtyEvent::Data { .. } => continue,
        }
    }

    assert!(manager.pane_ids().is_empty());
}

#[tokio::test(flavor = "multi_thread")]
async fn write_to_unknown_pane_returns_not_found() {
    let (tx, _rx) = mpsc::channel(64);
    let manager = PtyManager::new(tx);

    let result = manager.write("does-not-exist", b"x");
    assert!(matches!(result, Err(PtyError::NotFound)));
}
