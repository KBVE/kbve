use std::io::{Read, Write};
use std::sync::{Arc, Mutex};

use dashmap::DashMap;
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use super::config::PtySpawnConfig;
use super::error::PtyError;
use super::event::PtyEvent;
use super::handle::PaneHandle;

const READ_CHUNK_SIZE: usize = 8192;

pub struct PtyManager {
    panes: Arc<DashMap<String, PaneHandle>>,
    event_tx: mpsc::Sender<PtyEvent>,
}

impl PtyManager {
    pub fn new(event_tx: mpsc::Sender<PtyEvent>) -> Self {
        Self {
            panes: Arc::new(DashMap::new()),
            event_tx,
        }
    }

    pub fn spawn(&self, pane_id: String, cfg: PtySpawnConfig) -> Result<(), PtyError> {
        if self.panes.contains_key(&pane_id) {
            return Err(PtyError::AlreadyExists);
        }

        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: cfg.rows,
                cols: cfg.cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| PtyError::Spawn(e.to_string()))?;

        let mut cmd = CommandBuilder::new(cfg.resolved_shell());
        cmd.args(&cfg.args);
        if let Some(cwd) = &cfg.cwd {
            cmd.cwd(cwd);
        }
        for (key, value) in &cfg.env {
            cmd.env(key, value);
        }

        let mut child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| PtyError::Spawn(e.to_string()))?;
        drop(pair.slave);

        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| PtyError::Spawn(e.to_string()))?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|e| PtyError::Spawn(e.to_string()))?;
        let killer = child.clone_killer();

        let cancel = CancellationToken::new();

        let handle = PaneHandle {
            master: Mutex::new(pair.master),
            writer: Mutex::new(writer),
            killer: Mutex::new(killer),
            cancel: cancel.clone(),
        };
        self.panes.insert(pane_id.clone(), handle);

        let event_tx = self.event_tx.clone();
        let read_pane_id = pane_id.clone();
        let read_cancel = cancel.clone();
        tokio::task::spawn_blocking(move || {
            read_loop(read_pane_id, reader, event_tx, read_cancel);
        });

        let event_tx = self.event_tx.clone();
        let panes = self.panes.clone();
        tokio::task::spawn_blocking(move || {
            let status = child.wait();
            let code = status.ok().map(|s| s.exit_code() as i32);
            cancel.cancel();
            panes.remove(&pane_id);
            let _ = event_tx.blocking_send(PtyEvent::Exit { pane_id, code });
        });

        Ok(())
    }

    pub fn write(&self, pane_id: &str, bytes: &[u8]) -> Result<(), PtyError> {
        let pane = self.panes.get(pane_id).ok_or(PtyError::NotFound)?;
        let mut writer = pane
            .writer
            .lock()
            .map_err(|_| PtyError::Io("writer lock poisoned".to_string()))?;
        writer
            .write_all(bytes)
            .map_err(|e| PtyError::Io(e.to_string()))?;
        writer.flush().map_err(|e| PtyError::Io(e.to_string()))
    }

    pub fn resize(&self, pane_id: &str, rows: u16, cols: u16) -> Result<(), PtyError> {
        let pane = self.panes.get(pane_id).ok_or(PtyError::NotFound)?;
        let master = pane
            .master
            .lock()
            .map_err(|_| PtyError::Io("master lock poisoned".to_string()))?;
        master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| PtyError::Io(e.to_string()))
    }

    pub fn kill(&self, pane_id: &str) -> Result<(), PtyError> {
        let pane = self.panes.get(pane_id).ok_or(PtyError::NotFound)?;
        let mut killer = pane
            .killer
            .lock()
            .map_err(|_| PtyError::Io("killer lock poisoned".to_string()))?;
        killer.kill().map_err(|e| PtyError::Io(e.to_string()))?;
        pane.cancel.cancel();
        Ok(())
    }

    pub fn pane_ids(&self) -> Vec<String> {
        self.panes.iter().map(|entry| entry.key().clone()).collect()
    }
}

fn read_loop(
    pane_id: String,
    mut reader: Box<dyn Read + Send>,
    event_tx: mpsc::Sender<PtyEvent>,
    cancel: CancellationToken,
) {
    let mut buf = [0u8; READ_CHUNK_SIZE];
    loop {
        if cancel.is_cancelled() {
            break;
        }

        match reader.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                let bytes = buf[..n].to_vec();
                if event_tx
                    .blocking_send(PtyEvent::Data {
                        pane_id: pane_id.clone(),
                        bytes,
                    })
                    .is_err()
                {
                    break;
                }
            }
            Err(_) => break,
        }
    }
}
