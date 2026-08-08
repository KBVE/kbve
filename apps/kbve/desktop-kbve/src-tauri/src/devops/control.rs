use std::process::Stdio;

use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::mpsc;

use super::tmux;

pub const MONITOR_SESSION: &str = "__handy_monitor";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Notification {
    SessionsChanged,
    SessionChanged,
    SessionRenamed,
    SessionClosed,
    SessionWindowChanged,
    WindowAdd,
    WindowClose,
    WindowRenamed,
    Exit,
}

#[derive(Debug, Default)]
pub struct ControlParser {
    in_block: bool,
}

impl ControlParser {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn parse_line(&mut self, line: &str) -> Option<Notification> {
        if self.in_block {
            if line.starts_with("%end") || line.starts_with("%error") {
                self.in_block = false;
            }
            return None;
        }
        if line.starts_with("%begin") {
            self.in_block = true;
            return None;
        }

        let word = line.split_whitespace().next()?;
        match word {
            "%sessions-changed" => Some(Notification::SessionsChanged),
            "%session-changed" => Some(Notification::SessionChanged),
            "%session-renamed" => Some(Notification::SessionRenamed),
            "%session-closed" => Some(Notification::SessionClosed),
            "%session-window-changed" => Some(Notification::SessionWindowChanged),
            "%window-add" => Some(Notification::WindowAdd),
            "%window-close" => Some(Notification::WindowClose),
            "%window-renamed" => Some(Notification::WindowRenamed),
            "%exit" => Some(Notification::Exit),
            _ => None,
        }
    }
}

pub struct ControlClientGuard {
    child: Child,
}

impl Drop for ControlClientGuard {
    fn drop(&mut self) {
        let _ = self.child.start_kill();
    }
}

pub async fn ensure_monitor_session() -> Result<(), String> {
    let output = Command::new("tmux")
        .args([
            "-L",
            tmux::SOCKET_NAME,
            "new-session",
            "-d",
            "-s",
            MONITOR_SESSION,
        ])
        .kill_on_drop(true)
        .output()
        .await
        .map_err(|e| format!("Failed to create monitor session: {}", e))?;

    if output.status.success() {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&output.stderr);
    if stderr.contains("already exists") || stderr.contains("duplicate session") {
        return Ok(());
    }
    Err(format!("Failed to create monitor session: {}", stderr))
}

pub fn spawn_control_client()
-> Result<(ControlClientGuard, mpsc::UnboundedReceiver<Notification>), String> {
    let mut child = Command::new("tmux")
        .args([
            "-L",
            tmux::SOCKET_NAME,
            "-C",
            "attach-session",
            "-t",
            MONITOR_SESSION,
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("Failed to spawn tmux control client: {}", e))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "No stdout on tmux control client".to_string())?;

    let (tx, rx) = mpsc::unbounded_channel();

    tauri::async_runtime::spawn(async move {
        let mut parser = ControlParser::new();
        let mut lines = BufReader::new(stdout).lines();
        loop {
            match lines.next_line().await {
                Ok(Some(line)) => {
                    if let Some(notif) = parser.parse_line(&line) {
                        let is_exit = notif == Notification::Exit;
                        if tx.send(notif).is_err() || is_exit {
                            break;
                        }
                    }
                }
                Ok(None) | Err(_) => {
                    let _ = tx.send(Notification::Exit);
                    break;
                }
            }
        }
    });

    Ok((ControlClientGuard { child }, rx))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lifecycle_notifications_parse() {
        let mut p = ControlParser::new();
        assert_eq!(
            p.parse_line("%sessions-changed"),
            Some(Notification::SessionsChanged)
        );
        assert_eq!(
            p.parse_line("%session-changed $3 handy-agent-42"),
            Some(Notification::SessionChanged)
        );
        assert_eq!(
            p.parse_line("%session-closed $3"),
            Some(Notification::SessionClosed)
        );
        assert_eq!(
            p.parse_line("%window-renamed @1 build"),
            Some(Notification::WindowRenamed)
        );
        assert_eq!(p.parse_line("%exit"), Some(Notification::Exit));
    }

    #[test]
    fn output_and_unknown_lines_are_ignored() {
        let mut p = ControlParser::new();
        assert_eq!(p.parse_line("%output %5 hello\\033[31m"), None);
        assert_eq!(p.parse_line("%layout-change @1 abcd"), None);
        assert_eq!(p.parse_line(""), None);
        assert_eq!(p.parse_line("plain text"), None);
    }

    #[test]
    fn command_block_interior_is_swallowed() {
        let mut p = ControlParser::new();
        assert_eq!(p.parse_line("%begin 1622 1 0"), None);
        assert_eq!(p.parse_line("%sessions-changed"), None);
        assert_eq!(p.parse_line("some output"), None);
        assert_eq!(p.parse_line("%end 1622 1 0"), None);
        assert_eq!(
            p.parse_line("%sessions-changed"),
            Some(Notification::SessionsChanged)
        );
    }

    #[test]
    fn error_block_terminates_too() {
        let mut p = ControlParser::new();
        assert_eq!(p.parse_line("%begin 1622 1 0"), None);
        assert_eq!(p.parse_line("%error 1622 1 0"), None);
        assert_eq!(
            p.parse_line("%session-closed $1"),
            Some(Notification::SessionClosed)
        );
    }
}
