//! Spoken DevOps queries.
//!
//! Deterministic keyword matching over Discord voice transcripts. Read-only
//! operations only — anything that mutates state (spawn, kill, merge) stays
//! behind the UI.

use crate::devops::orchestrator;
use crate::devops::tmux;

pub enum VoiceCommand {
    AgentStatus,
    SessionStatus,
}

/// Match a transcript against the known spoken commands.
pub fn parse(text: &str) -> Option<VoiceCommand> {
    let t = text.to_lowercase();
    let mentions = |words: &[&str]| words.iter().any(|w| t.contains(w));
    if mentions(&[
        "agent status",
        "agent report",
        "list agents",
        "list the agents",
    ]) {
        return Some(VoiceCommand::AgentStatus);
    }
    if mentions(&["session status", "list sessions", "list the sessions"]) {
        return Some(VoiceCommand::SessionStatus);
    }
    None
}

/// Execute a voice command and return the sentence to speak back.
pub fn execute(command: VoiceCommand) -> String {
    match command {
        VoiceCommand::AgentStatus => match orchestrator::list_agent_statuses() {
            Ok(agents) if agents.is_empty() => "No coding agents are running.".to_string(),
            Ok(agents) => {
                let mut parts: Vec<String> = Vec::new();
                for agent in agents.iter().take(5) {
                    let issue = agent
                        .issue_ref
                        .clone()
                        .unwrap_or_else(|| "no issue".to_string());
                    parts.push(format!("{} working on {}", agent.agent_type, issue));
                }
                let mut summary = format!(
                    "{} agent{} running: {}.",
                    agents.len(),
                    if agents.len() == 1 { "" } else { "s" },
                    parts.join(", ")
                );
                if agents.len() > 5 {
                    summary.push_str(" And more.");
                }
                summary
            }
            Err(e) => format!("I could not list the agents: {}", e),
        },
        VoiceCommand::SessionStatus => match tmux::list_sessions() {
            Ok(sessions) if sessions.is_empty() => "No tmux sessions are running.".to_string(),
            Ok(sessions) => {
                let names: Vec<String> = sessions.iter().take(8).map(|s| s.name.clone()).collect();
                format!(
                    "{} session{}: {}.",
                    sessions.len(),
                    if sessions.len() == 1 { "" } else { "s" },
                    names.join(", ")
                )
            }
            Err(e) => format!("I could not list the sessions: {}", e),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn kind(text: &str) -> Option<&'static str> {
        parse(text).map(|c| match c {
            VoiceCommand::AgentStatus => "agents",
            VoiceCommand::SessionStatus => "sessions",
        })
    }

    #[test]
    fn parses_agent_status_phrases() {
        assert_eq!(kind("agent status please"), Some("agents"));
        assert_eq!(kind("Onichan, what's the AGENT REPORT?"), Some("agents"));
        assert_eq!(kind("hey chan, list agents"), Some("agents"));
        assert_eq!(kind("could you list the agents"), Some("agents"));
    }

    #[test]
    fn parses_session_status_phrases() {
        assert_eq!(kind("session status"), Some("sessions"));
        assert_eq!(kind("List Sessions now"), Some("sessions"));
        assert_eq!(kind("list the sessions for me"), Some("sessions"));
    }

    #[test]
    fn ignores_normal_conversation() {
        assert_eq!(kind("hey onichan how are you today"), None);
        assert_eq!(kind("tell me about rust lifetimes"), None);
        assert_eq!(kind("what's on the agenda"), None);
        assert_eq!(kind(""), None);
    }

    #[test]
    fn agent_status_wins_over_session_words() {
        assert_eq!(kind("agent status and session things"), Some("agents"));
    }
}
