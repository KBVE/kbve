use std::collections::HashMap;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Emitter};
use tokio::process::Command;
use tokio::sync::{mpsc, watch};
use tokio::time::MissedTickBehavior;

use super::control::{self, Notification};
use super::detector::hysteresis::Smoother;
use super::detector::{AgentActivity, DetectContext, DetectorRegistry};
use super::tmux::{self, AgentMetadata, SessionStatus, TmuxSession};

const REFRESH_INTERVAL: Duration = Duration::from_secs(2);
const FIELD_SEP: &str = "|||";
const LIST_FORMAT: &str = "#{session_name}|||#{session_attached}|||#{session_windows}|||#{session_created}|||#{session_activity}|||#{pane_title}|||#{pane_current_command}";

pub enum ActorCommand {
    Refresh,
}

#[derive(Clone)]
pub struct DevOpsActorHandle {
    cmd_tx: mpsc::UnboundedSender<ActorCommand>,
    snapshot_rx: watch::Receiver<Option<Vec<TmuxSession>>>,
}

impl DevOpsActorHandle {
    pub fn sessions(&self) -> Option<Vec<TmuxSession>> {
        self.snapshot_rx.borrow().clone()
    }

    pub fn poke(&self) {
        let _ = self.cmd_tx.send(ActorCommand::Refresh);
    }
}

struct SessionRow {
    name: String,
    attached: bool,
    windows: u32,
    created: u64,
    activity: Option<u64>,
    pane_title: String,
    pane_command: String,
}

pub fn spawn(app: AppHandle) -> DevOpsActorHandle {
    let (cmd_tx, cmd_rx) = mpsc::unbounded_channel();
    let (snapshot_tx, snapshot_rx) = watch::channel(None);
    tauri::async_runtime::spawn(run(app, cmd_rx, snapshot_tx));
    DevOpsActorHandle {
        cmd_tx,
        snapshot_rx,
    }
}

async fn run(
    app: AppHandle,
    mut cmd_rx: mpsc::UnboundedReceiver<ActorCommand>,
    snapshot_tx: watch::Sender<Option<Vec<TmuxSession>>>,
) {
    let registry = DetectorRegistry::default_stack();
    let mut smoothers: HashMap<String, Smoother> = HashMap::new();
    let mut metadata_cache: HashMap<String, AgentMetadata> = HashMap::new();
    let mut last_published: Option<Vec<TmuxSession>> = None;

    let mut tick = tokio::time::interval(REFRESH_INTERVAL);
    tick.set_missed_tick_behavior(MissedTickBehavior::Skip);

    let (_control_guard, mut notif_rx) = match control::ensure_monitor_session().await {
        Ok(()) => match control::spawn_control_client() {
            Ok((guard, rx)) => (Some(guard), Some(rx)),
            Err(e) => {
                log::warn!("tmux control client unavailable, polling only: {}", e);
                (None, None)
            }
        },
        Err(e) => {
            log::warn!("tmux monitor session unavailable, polling only: {}", e);
            (None, None)
        }
    };

    loop {
        tokio::select! {
            cmd = cmd_rx.recv() => {
                match cmd {
                    Some(ActorCommand::Refresh) => {}
                    None => break,
                }
            }
            notif = recv_notification(&mut notif_rx) => {
                match notif {
                    Some(Notification::Exit) | None => {
                        log::warn!("tmux control client exited, polling only");
                        notif_rx = None;
                        continue;
                    }
                    Some(_) => {}
                }
            }
            _ = tick.tick() => {}
        }

        let sessions =
            refresh(&registry, &mut smoothers, &mut metadata_cache).await;

        if last_published.as_ref() != Some(&sessions) {
            last_published = Some(sessions.clone());
            let _ = snapshot_tx.send(Some(sessions.clone()));
            let _ = app.emit("devops-sessions-updated", &sessions);
        }
    }
}

async fn recv_notification(
    rx: &mut Option<mpsc::UnboundedReceiver<Notification>>,
) -> Option<Notification> {
    match rx {
        Some(rx) => rx.recv().await,
        None => std::future::pending().await,
    }
}

async fn refresh(
    registry: &DetectorRegistry,
    smoothers: &mut HashMap<String, Smoother>,
    metadata_cache: &mut HashMap<String, AgentMetadata>,
) -> Vec<TmuxSession> {
    let rows = list_session_rows().await;

    let live: Vec<&str> = rows.iter().map(|r| r.name.as_str()).collect();
    smoothers.retain(|name, _| live.contains(&name.as_str()));
    metadata_cache.retain(|name, _| live.contains(&name.as_str()));

    let mut sessions = Vec::with_capacity(rows.len());
    for row in rows {
        let metadata = match metadata_cache.get(&row.name) {
            Some(m) => Some(m.clone()),
            None => {
                let name = row.name.clone();
                let fetched = tauri::async_runtime::spawn_blocking(move || {
                    tmux::get_session_metadata(&name)
                })
                .await
                .ok()
                .and_then(|r| r.ok());
                if let Some(m) = &fetched {
                    metadata_cache.insert(row.name.clone(), m.clone());
                }
                fetched
            }
        };

        let activity = if row.name.starts_with(tmux::SESSION_PREFIX) {
            let ansi = capture_pane(&row.name).await;
            let plain = super::detector::strip_ansi(&ansi);
            let last_activity = row
                .activity
                .map(|secs| UNIX_EPOCH + Duration::from_secs(secs));
            let smoother = smoothers.entry(row.name.clone()).or_default();
            let ctx = DetectContext::from_parts(
                &ansi,
                &plain,
                last_activity,
                SystemTime::now(),
                Some(smoother.current()),
                &row.name,
                Some(row.pane_title.as_str()).filter(|t| !t.is_empty()),
                Some(row.pane_command.as_str()).filter(|c| !c.is_empty()),
            );
            let raw = registry.detect(&ctx);
            let smoothed = smoother.observe(raw);
            Some(match smoothed {
                AgentActivity::Unknown => AgentActivity::Idle,
                other => other,
            })
        } else {
            None
        };

        let status = match activity {
            Some(AgentActivity::Idle) | Some(AgentActivity::Done) => {
                if is_shell(&row.pane_command) {
                    SessionStatus::Stopped
                } else {
                    SessionStatus::Running
                }
            }
            Some(_) => SessionStatus::Running,
            None => {
                if row.pane_command.is_empty() || is_shell(&row.pane_command) {
                    SessionStatus::Stopped
                } else {
                    SessionStatus::Running
                }
            }
        };

        sessions.push(TmuxSession {
            name: row.name,
            attached: row.attached,
            windows: row.windows,
            created: row.created,
            metadata,
            status,
            activity,
        });
    }

    sessions
}

fn is_shell(cmd: &str) -> bool {
    matches!(
        cmd,
        "bash" | "zsh" | "sh" | "fish" | "dash" | "ksh" | "tcsh" | "csh" | "nu" | "pwsh"
    )
}

async fn list_session_rows() -> Vec<SessionRow> {
    let output = Command::new("tmux")
        .args([
            "-L",
            tmux::SOCKET_NAME,
            "list-sessions",
            "-F",
            LIST_FORMAT,
        ])
        .kill_on_drop(true)
        .output()
        .await;

    let output = match output {
        Ok(o) if o.status.success() => o,
        _ => return Vec::new(),
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    stdout
        .lines()
        .filter_map(|line| {
            let parts: Vec<&str> = line.split(FIELD_SEP).collect();
            if parts.len() < 7 || !parts[0].starts_with(tmux::HANDY_PREFIX) {
                return None;
            }
            Some(SessionRow {
                name: parts[0].to_string(),
                attached: parts[1] != "0",
                windows: parts[2].parse().unwrap_or(1),
                created: parts[3].parse().unwrap_or(0),
                activity: parts[4].parse().ok(),
                pane_title: parts[5].to_string(),
                pane_command: parts[6].to_string(),
            })
        })
        .collect()
}

async fn capture_pane(session: &str) -> Vec<u8> {
    let output = Command::new("tmux")
        .args([
            "-L",
            tmux::SOCKET_NAME,
            "capture-pane",
            "-p",
            "-e",
            "-J",
            "-t",
            session,
        ])
        .kill_on_drop(true)
        .output()
        .await;

    match output {
        Ok(o) if o.status.success() => o.stdout,
        _ => Vec::new(),
    }
}
