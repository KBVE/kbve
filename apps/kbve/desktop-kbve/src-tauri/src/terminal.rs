use std::sync::Arc;

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::mpsc;

use crate::pty::{PtyError, PtyEvent, PtyManager, PtySpawnConfig};

#[derive(Serialize, Clone)]
struct ExitPayload {
    code: Option<i32>,
}

pub fn coalesce(events: Vec<PtyEvent>) -> Vec<PtyEvent> {
    let mut result: Vec<PtyEvent> = Vec::new();

    for event in events {
        match event {
            PtyEvent::Data { pane_id, bytes } => {
                if let Some(PtyEvent::Data {
                    pane_id: last_pane_id,
                    bytes: last_bytes,
                }) = result.last_mut()
                {
                    if *last_pane_id == pane_id {
                        last_bytes.extend(bytes);
                        continue;
                    }
                }
                result.push(PtyEvent::Data { pane_id, bytes });
            }
            PtyEvent::Exit { pane_id, code } => {
                result.push(PtyEvent::Exit { pane_id, code });
            }
        }
    }

    result
}

pub fn spawn_event_pump(app: AppHandle, mut rx: mpsc::Receiver<PtyEvent>) {
    tauri::async_runtime::spawn(async move {
        let mut buf = Vec::with_capacity(64);
        loop {
            let count = rx.recv_many(&mut buf, 64).await;
            if count == 0 {
                break;
            }

            for event in coalesce(std::mem::take(&mut buf)) {
                match event {
                    PtyEvent::Data { pane_id, bytes } => {
                        let event_name = format!("terminal://data/{}", pane_id);
                        let encoded = STANDARD.encode(bytes);
                        if let Err(e) = app.emit(&event_name, encoded) {
                            eprintln!("terminal event emit failed: {e}");
                        }
                    }
                    PtyEvent::Exit { pane_id, code } => {
                        let event_name = format!("terminal://exit/{}", pane_id);
                        if let Err(e) = app.emit(&event_name, ExitPayload { code }) {
                            eprintln!("terminal event emit failed: {e}");
                        }
                    }
                }
            }
        }
    });
}

#[tauri::command]
#[specta::specta]
pub async fn terminal_open(
    pane_id: String,
    cols: u16,
    rows: u16,
    cwd: Option<String>,
    state: State<'_, Arc<PtyManager>>,
) -> Result<(), PtyError> {
    let cfg = PtySpawnConfig {
        shell: None,
        args: vec![],
        cwd,
        rows,
        cols,
        env: vec![("TERM".into(), "xterm-256color".into())],
    };
    state.spawn(pane_id, cfg)
}

#[tauri::command]
#[specta::specta]
pub fn terminal_write(
    pane_id: String,
    data: String,
    state: State<'_, Arc<PtyManager>>,
) -> Result<(), PtyError> {
    state.write(&pane_id, data.as_bytes())
}

#[tauri::command]
#[specta::specta]
pub fn terminal_resize(
    pane_id: String,
    rows: u16,
    cols: u16,
    state: State<'_, Arc<PtyManager>>,
) -> Result<(), PtyError> {
    state.resize(&pane_id, rows, cols)
}

#[tauri::command]
#[specta::specta]
pub fn terminal_close(pane_id: String, state: State<'_, Arc<PtyManager>>) -> Result<(), PtyError> {
    state.kill(&pane_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn merges_consecutive_data_for_same_pane() {
        let events = vec![
            PtyEvent::Data {
                pane_id: "a".to_string(),
                bytes: b"hello".to_vec(),
            },
            PtyEvent::Data {
                pane_id: "a".to_string(),
                bytes: b" world".to_vec(),
            },
        ];

        let result = coalesce(events);

        assert_eq!(result.len(), 1);
        match &result[0] {
            PtyEvent::Data { pane_id, bytes } => {
                assert_eq!(pane_id, "a");
                assert_eq!(bytes, b"hello world");
            }
            _ => panic!("expected Data event"),
        }
    }

    #[test]
    fn keeps_interleaved_panes_grouped_in_order() {
        let events = vec![
            PtyEvent::Data {
                pane_id: "a".to_string(),
                bytes: b"a1".to_vec(),
            },
            PtyEvent::Data {
                pane_id: "b".to_string(),
                bytes: b"b1".to_vec(),
            },
            PtyEvent::Data {
                pane_id: "a".to_string(),
                bytes: b"a2".to_vec(),
            },
        ];

        let result = coalesce(events);

        assert_eq!(result.len(), 3);
        match &result[0] {
            PtyEvent::Data { pane_id, bytes } => {
                assert_eq!(pane_id, "a");
                assert_eq!(bytes, b"a1");
            }
            _ => panic!("expected Data event"),
        }
        match &result[1] {
            PtyEvent::Data { pane_id, bytes } => {
                assert_eq!(pane_id, "b");
                assert_eq!(bytes, b"b1");
            }
            _ => panic!("expected Data event"),
        }
        match &result[2] {
            PtyEvent::Data { pane_id, bytes } => {
                assert_eq!(pane_id, "a");
                assert_eq!(bytes, b"a2");
            }
            _ => panic!("expected Data event"),
        }
    }

    #[test]
    fn exit_terminates_group_and_is_not_merged() {
        let events = vec![
            PtyEvent::Data {
                pane_id: "a".to_string(),
                bytes: b"data".to_vec(),
            },
            PtyEvent::Exit {
                pane_id: "a".to_string(),
                code: Some(0),
            },
        ];

        let result = coalesce(events);

        assert_eq!(result.len(), 2);
        match &result[0] {
            PtyEvent::Data { pane_id, bytes } => {
                assert_eq!(pane_id, "a");
                assert_eq!(bytes, b"data");
            }
            _ => panic!("expected Data event"),
        }
        match &result[1] {
            PtyEvent::Exit { pane_id, code } => {
                assert_eq!(pane_id, "a");
                assert_eq!(*code, Some(0));
            }
            _ => panic!("expected Exit event"),
        }
    }

    #[test]
    fn data_after_exit_for_same_pane_starts_new_group() {
        let events = vec![
            PtyEvent::Data {
                pane_id: "a".to_string(),
                bytes: b"first".to_vec(),
            },
            PtyEvent::Exit {
                pane_id: "a".to_string(),
                code: None,
            },
            PtyEvent::Data {
                pane_id: "a".to_string(),
                bytes: b"second".to_vec(),
            },
        ];

        let result = coalesce(events);

        assert_eq!(result.len(), 3);
        match &result[2] {
            PtyEvent::Data { pane_id, bytes } => {
                assert_eq!(pane_id, "a");
                assert_eq!(bytes, b"second");
            }
            _ => panic!("expected Data event"),
        }
    }
}
