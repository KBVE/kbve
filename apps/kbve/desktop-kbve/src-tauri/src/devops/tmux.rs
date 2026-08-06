//! tmux session management for DevOps agent sessions.
//!
//! Sessions persist independently in the tmux server, surviving app restarts.
//! Metadata is stored in tmux environment variables for recovery.

use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::HashMap;
use std::process::Command;

/// Session naming prefix for all Handy agent sessions
const SESSION_PREFIX: &str = "handy-agent-";

/// Base prefix for all Handy-related tmux sessions (includes master)
const HANDY_PREFIX: &str = "handy-";

/// Custom socket name to avoid macOS /private/tmp permission issues
const SOCKET_NAME: &str = "handy";

/// Environment variable keys stored in tmux sessions
const ENV_ISSUE_REF: &str = "HANDY_ISSUE_REF";
const ENV_REPO: &str = "HANDY_REPO";
const ENV_WORKTREE: &str = "HANDY_WORKTREE";
const ENV_AGENT_TYPE: &str = "HANDY_AGENT_TYPE";
const ENV_MACHINE_ID: &str = "HANDY_MACHINE_ID";
const ENV_STARTED_AT: &str = "HANDY_STARTED_AT";

/// Status of an agent session
#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq)]
pub enum SessionStatus {
    /// Session is running and agent is active
    Running,
    /// Session exists but agent process has exited
    Stopped,
    /// Session was recovered from metadata (tmux or GitHub)
    Recovered,
}

/// Metadata stored with each agent session
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct AgentMetadata {
    /// Session name (e.g., "handy-agent-42")
    pub session: String,
    /// GitHub issue reference (e.g., "org/repo#42")
    pub issue_ref: Option<String>,
    /// Repository being worked on
    pub repo: Option<String>,
    /// Path to the worktree
    pub worktree: Option<String>,
    /// Type of agent (e.g., "claude", "aider")
    pub agent_type: String,
    /// Machine identifier for multi-machine disambiguation
    pub machine_id: String,
    /// ISO timestamp when session started
    pub started_at: String,
}

/// Information about a tmux session
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct TmuxSession {
    /// Session name
    pub name: String,
    /// Whether the session is attached
    pub attached: bool,
    /// Number of windows in the session
    pub windows: u32,
    /// Session creation time (Unix timestamp)
    pub created: u64,
    /// Agent metadata if this is a Handy session
    pub metadata: Option<AgentMetadata>,
    /// Current status
    pub status: SessionStatus,
}

/// Source of recovered session information
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub enum RecoverySource {
    /// Found in tmux, normal operation
    Tmux,
    /// Recovered from GitHub issue comment
    GitHubIssue,
    /// Confirmed by both sources
    Both,
}

/// Recommended action for a recovered session
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub enum RecoveryAction {
    /// tmux alive, continue monitoring
    Resume,
    /// tmux dead but work incomplete, offer restart
    Restart,
    /// orphan session, offer to kill/remove
    Cleanup,
    /// completed normally, nothing to do
    None,
}

/// A session recovered during startup
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct RecoveredSession {
    pub metadata: AgentMetadata,
    pub source: RecoverySource,
    pub tmux_alive: bool,
    pub worktree_exists: bool,
    pub recommended_action: RecoveryAction,
}

/// Check if tmux server is running
pub fn is_tmux_running() -> bool {
    Command::new("tmux")
        .args(["-L", SOCKET_NAME, "list-sessions"])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Get the current machine's hostname for identification
fn get_machine_id() -> String {
    Command::new("hostname")
        .output()
        .ok()
        .and_then(|o| {
            if o.status.success() {
                Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
            } else {
                None
            }
        })
        .unwrap_or_else(|| "unknown".to_string())
}

/// List all tmux sessions, filtering for Handy agent sessions
pub fn list_sessions() -> Result<Vec<TmuxSession>, String> {
    // Format: session_name, attached, windows, created
    let output = Command::new("tmux")
        .args([
            "-L",
            SOCKET_NAME,
            "list-sessions",
            "-F",
            "#{session_name}\t#{session_attached}\t#{session_windows}\t#{session_created}",
        ])
        .output()
        .map_err(|e| format!("Failed to list tmux sessions: {}", e))?;

    if !output.status.success() {
        // No sessions or tmux not running
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("no server running") || stderr.contains("no sessions") {
            return Ok(vec![]);
        }
        return Err(format!("tmux error: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut sessions = Vec::new();

    for line in stdout.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() >= 4 {
            let name = parts[0].to_string();
            let attached = parts[1] == "1";
            let windows = parts[2].parse().unwrap_or(1);
            let created = parts[3].parse().unwrap_or(0);

            // Only include Handy sessions (agents and master)
            if name.starts_with(HANDY_PREFIX) {
                let metadata = get_session_metadata(&name).ok();
                let status = if check_session_has_active_process(&name) {
                    SessionStatus::Running
                } else {
                    SessionStatus::Stopped
                };

                sessions.push(TmuxSession {
                    name,
                    attached,
                    windows,
                    created,
                    metadata,
                    status,
                });
            }
        }
    }

    Ok(sessions)
}

/// Check if a session has an active process running in its pane
fn check_session_has_active_process(session_name: &str) -> bool {
    // Get the command running in the session's active pane
    Command::new("tmux")
        .args([
            "-L",
            SOCKET_NAME,
            "list-panes",
            "-t",
            session_name,
            "-F",
            "#{pane_current_command}",
        ])
        .output()
        .map(|o| {
            if o.status.success() {
                let cmd = String::from_utf8_lossy(&o.stdout).trim().to_string();
                // Check if it's not just a shell prompt
                !cmd.is_empty() && cmd != "bash" && cmd != "zsh" && cmd != "sh" && cmd != "fish"
            } else {
                false
            }
        })
        .unwrap_or(false)
}

/// Get metadata for a specific session from its environment variables
pub fn get_session_metadata(session_name: &str) -> Result<AgentMetadata, String> {
    let output = Command::new("tmux")
        .args(["-L", SOCKET_NAME, "show-environment", "-t", session_name])
        .output()
        .map_err(|e| format!("Failed to get session environment: {}", e))?;

    if !output.status.success() {
        return Err("Session not found or no environment set".to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut env_vars: HashMap<String, String> = HashMap::new();

    for line in stdout.lines() {
        if let Some((key, value)) = line.split_once('=') {
            if key.starts_with("HANDY_") {
                env_vars.insert(key.to_string(), value.to_string());
            }
        }
    }

    Ok(AgentMetadata {
        session: session_name.to_string(),
        issue_ref: env_vars.get(ENV_ISSUE_REF).cloned(),
        repo: env_vars.get(ENV_REPO).cloned(),
        worktree: env_vars.get(ENV_WORKTREE).cloned(),
        agent_type: env_vars
            .get(ENV_AGENT_TYPE)
            .cloned()
            .unwrap_or_else(|| "unknown".to_string()),
        machine_id: env_vars
            .get(ENV_MACHINE_ID)
            .cloned()
            .unwrap_or_else(get_machine_id),
        started_at: env_vars
            .get(ENV_STARTED_AT)
            .cloned()
            .unwrap_or_else(|| chrono::Utc::now().to_rfc3339()),
    })
}

/// Create a new tmux session with metadata
pub fn create_session(
    session_name: &str,
    working_dir: Option<&str>,
    metadata: &AgentMetadata,
) -> Result<(), String> {
    // Validate session name - must start with handy- prefix (agents or master)
    if !session_name.starts_with(HANDY_PREFIX) {
        return Err(format!("Session name must start with '{}'", HANDY_PREFIX));
    }

    // Check if session already exists
    let existing = list_sessions()?;
    if existing.iter().any(|s| s.name == session_name) {
        return Err(format!("Session '{}' already exists", session_name));
    }

    // Build the create command
    let mut args = vec!["new-session", "-d", "-s", session_name];

    if let Some(dir) = working_dir {
        args.push("-c");
        args.push(dir);
    }

    // Prepend -L flag for custom socket
    let mut full_args = vec!["-L", SOCKET_NAME];
    full_args.extend_from_slice(&args);

    let output = Command::new("tmux")
        .args(&full_args)
        .output()
        .map_err(|e| format!("Failed to create session: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "tmux error: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    // Set environment variables for metadata
    set_session_env(session_name, ENV_AGENT_TYPE, &metadata.agent_type)?;
    set_session_env(session_name, ENV_MACHINE_ID, &metadata.machine_id)?;
    set_session_env(session_name, ENV_STARTED_AT, &metadata.started_at)?;

    if let Some(ref issue_ref) = metadata.issue_ref {
        set_session_env(session_name, ENV_ISSUE_REF, issue_ref)?;
    }
    if let Some(ref repo) = metadata.repo {
        set_session_env(session_name, ENV_REPO, repo)?;
    }
    if let Some(ref worktree) = metadata.worktree {
        set_session_env(session_name, ENV_WORKTREE, worktree)?;
    }

    Ok(())
}

/// Set an environment variable in a tmux session
fn set_session_env(session_name: &str, key: &str, value: &str) -> Result<(), String> {
    let output = Command::new("tmux")
        .args([
            "-L",
            SOCKET_NAME,
            "set-environment",
            "-t",
            session_name,
            key,
            value,
        ])
        .output()
        .map_err(|e| format!("Failed to set environment: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "Failed to set {}: {}",
            key,
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok(())
}

/// Kill a tmux session and any associated Docker containers
pub fn kill_session(session_name: &str) -> Result<(), String> {
    // First, try to get the session metadata to find associated containers
    // We'll try to kill containers before killing the session
    if let Ok(metadata) = get_session_metadata(session_name) {
        // Extract issue number from issue_ref (e.g., "org/repo#123" -> 123)
        if let Some(issue_ref) = &metadata.issue_ref {
            if let Some(issue_num) = issue_ref
                .split('#')
                .last()
                .and_then(|n| n.parse::<u32>().ok())
            {
                // Try to kill sandbox containers (both agent and support worker patterns)
                let container_patterns = [
                    format!("handy-sandbox-{}", issue_num),
                    format!("handy-support-sandbox-{}", issue_num),
                ];

                for container_name in &container_patterns {
                    // Force remove the container (ignore errors - container may not exist)
                    let _ = Command::new("docker")
                        .args(["rm", "-f", container_name])
                        .output();
                    log::debug!("Attempted to remove Docker container: {}", container_name);
                }
            }
        }
    }

    // Now kill the tmux session
    let output = Command::new("tmux")
        .args(["-L", SOCKET_NAME, "kill-session", "-t", session_name])
        .output()
        .map_err(|e| format!("Failed to kill session: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "tmux error: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok(())
}

/// Get recent output from a session's pane
pub fn get_session_output(session_name: &str, lines: Option<u32>) -> Result<String, String> {
    let line_count = lines.unwrap_or(100).to_string();

    let output = Command::new("tmux")
        .args([
            "-L",
            SOCKET_NAME,
            "capture-pane",
            "-t",
            session_name,
            "-p",
            "-S",
            &format!("-{}", line_count),
        ])
        .output()
        .map_err(|e| format!("Failed to capture pane: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "tmux error: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Send a command to a session
/// If the command is empty, sends just Enter key
/// Special key sequences: Enter, Escape, Tab, Space, BSpace, Up, Down, Left, Right, etc.
pub fn send_command(session_name: &str, command: &str) -> Result<(), String> {
    let mut args = vec!["-L", SOCKET_NAME, "send-keys", "-t", session_name];

    // If empty command, just send Enter
    if command.is_empty() {
        args.push("Enter");
    } else {
        args.push(command);
        args.push("Enter");
    }

    let output = Command::new("tmux")
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to send command: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "tmux error: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok(())
}

/// Send raw keys to a session without appending Enter
/// Use this for special keys like Escape, Tab, or partial input
pub fn send_keys(session_name: &str, keys: &str) -> Result<(), String> {
    let output = Command::new("tmux")
        .args(["-L", SOCKET_NAME, "send-keys", "-t", session_name, keys])
        .output()
        .map_err(|e| format!("Failed to send keys: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "tmux error: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok(())
}

/// Recover agent sessions on startup
pub fn recover_sessions() -> Result<Vec<RecoveredSession>, String> {
    let current_machine = get_machine_id();
    let sessions = list_sessions()?;
    let mut recovered = Vec::new();

    for session in sessions {
        if let Some(metadata) = session.metadata {
            // Only recover sessions from this machine
            if metadata.machine_id != current_machine {
                continue;
            }

            let worktree_exists = metadata
                .worktree
                .as_ref()
                .map(|p| std::path::Path::new(p).exists())
                .unwrap_or(false);

            let tmux_alive = session.status == SessionStatus::Running;

            let recommended_action = match (tmux_alive, worktree_exists) {
                (true, _) => RecoveryAction::Resume,
                (false, true) => RecoveryAction::Restart,
                (false, false) => RecoveryAction::Cleanup,
            };

            recovered.push(RecoveredSession {
                metadata,
                source: RecoverySource::Tmux,
                tmux_alive,
                worktree_exists,
                recommended_action,
            });
        }
    }

    Ok(recovered)
}

/// Result of attempting to recover/restart sessions
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct RecoveryResult {
    /// Session name
    pub session: String,
    /// Whether recovery was successful
    pub success: bool,
    /// Action that was taken
    pub action: RecoveryAction,
    /// Error message if recovery failed
    pub error: Option<String>,
}

/// Attempt to recover all sessions that need attention.
///
/// For sessions with `RecoveryAction::Restart`, this will restart the agent.
/// For sessions with `RecoveryAction::Cleanup`, this will kill the session.
/// Sessions with `RecoveryAction::Resume` are left as-is (already running).
///
/// Also cleans up any orphaned Docker containers (containers without corresponding tmux sessions).
///
/// Returns results for each session that was processed.
pub fn recover_all_sessions(
    auto_restart: bool,
    auto_cleanup: bool,
) -> Result<Vec<RecoveryResult>, String> {
    let sessions = recover_sessions()?;
    let mut results = Vec::new();

    for session in sessions {
        let result = match session.recommended_action {
            RecoveryAction::Resume => {
                // Already running, nothing to do
                RecoveryResult {
                    session: session.metadata.session.clone(),
                    success: true,
                    action: RecoveryAction::Resume,
                    error: None,
                }
            }
            RecoveryAction::Restart => {
                if auto_restart {
                    match restart_agent(&session.metadata.session) {
                        Ok(()) => RecoveryResult {
                            session: session.metadata.session.clone(),
                            success: true,
                            action: RecoveryAction::Restart,
                            error: None,
                        },
                        Err(e) => RecoveryResult {
                            session: session.metadata.session.clone(),
                            success: false,
                            action: RecoveryAction::Restart,
                            error: Some(e),
                        },
                    }
                } else {
                    RecoveryResult {
                        session: session.metadata.session.clone(),
                        success: false,
                        action: RecoveryAction::Restart,
                        error: Some("Auto-restart disabled".to_string()),
                    }
                }
            }
            RecoveryAction::Cleanup => {
                if auto_cleanup {
                    match kill_session(&session.metadata.session) {
                        Ok(()) => RecoveryResult {
                            session: session.metadata.session.clone(),
                            success: true,
                            action: RecoveryAction::Cleanup,
                            error: None,
                        },
                        Err(e) => RecoveryResult {
                            session: session.metadata.session.clone(),
                            success: false,
                            action: RecoveryAction::Cleanup,
                            error: Some(e),
                        },
                    }
                } else {
                    RecoveryResult {
                        session: session.metadata.session.clone(),
                        success: false,
                        action: RecoveryAction::Cleanup,
                        error: Some("Auto-cleanup disabled".to_string()),
                    }
                }
            }
            RecoveryAction::None => {
                // Nothing to do
                RecoveryResult {
                    session: session.metadata.session.clone(),
                    success: true,
                    action: RecoveryAction::None,
                    error: None,
                }
            }
        };

        results.push(result);
    }

    // Also clean up orphaned Docker containers
    // This catches containers that were left behind when tmux sessions were killed externally
    if let Ok(orphan_result) = super::docker::cleanup_orphaned_containers() {
        if orphan_result.removed > 0 {
            log::info!(
                "Cleaned up {} orphaned Docker containers during session recovery",
                orphan_result.removed
            );
        }
    }

    Ok(results)
}

/// Port mapping configuration for container
#[derive(Debug, Clone)]
pub struct PortMapping {
    /// Host port to bind
    pub host_port: u16,
    /// Container port to expose
    pub container_port: u16,
    /// Protocol (tcp or udp), defaults to tcp
    pub protocol: Option<String>,
}

impl PortMapping {
    /// Create a new port mapping (same port on host and container)
    pub fn new(port: u16) -> Self {
        Self {
            host_port: port,
            container_port: port,
            protocol: None,
        }
    }

    /// Create a port mapping with different host and container ports
    pub fn mapped(host_port: u16, container_port: u16) -> Self {
        Self {
            host_port,
            container_port,
            protocol: None,
        }
    }

    /// Format as Docker -p argument
    pub fn to_docker_arg(&self) -> String {
        match &self.protocol {
            Some(proto) => format!("-p {}:{}/{}", self.host_port, self.container_port, proto),
            None => format!("-p {}:{}", self.host_port, self.container_port),
        }
    }
}

/// Configuration for sandboxed agent execution
#[derive(Debug, Clone)]
pub struct SandboxedAgentConfig {
    /// Path to the worktree (will be mounted in container)
    pub worktree_path: String,
    /// Container memory limit (e.g., "4g")
    pub memory_limit: Option<String>,
    /// Container CPU limit (e.g., "2")
    pub cpu_limit: Option<String>,
    /// Whether to use --dangerously-skip-permissions (safe in sandbox)
    pub auto_accept: bool,
    /// Port mappings for the container (host:container)
    pub ports: Vec<PortMapping>,
    /// Whether to auto-detect common development ports from the project
    pub auto_detect_ports: bool,
    /// Whether to join the shared agent network for inter-container communication
    pub use_agent_network: bool,
    /// Whether to remap ports to unique ranges (avoids conflicts between agents)
    pub remap_ports: bool,
}

/// Build a Docker command that runs the agent inside a container
///
/// This wraps the agent command in a Docker container with:
/// - The worktree mounted at /workspace
/// - GitHub and Anthropic credentials passed from environment
/// - Resource limits applied
/// - Shared network for inter-container communication (optional)
/// - Port remapping to unique ranges (optional, avoids conflicts)
fn build_sandboxed_agent_command(
    agent_type: &str,
    repo: &str,
    issue_number: u64,
    issue_title: Option<&str>,
    config: &SandboxedAgentConfig,
) -> Result<String, String> {
    use super::docker;

    // First get the base agent command
    let inner_command = build_agent_command_inner(
        agent_type,
        repo,
        issue_number,
        issue_title,
        config.auto_accept,
    )?;

    // Build docker run command
    let container_name = format!("handy-sandbox-{}", issue_number);
    let image = "node:20-bookworm"; // Base image with Node.js for Claude Code

    let mut docker_args = vec![
        "docker run --rm -it".to_string(),
        format!("--name {}", container_name),
        format!("-v {}:/workspace", config.worktree_path),
        "-w /workspace".to_string(),
    ];

    // Join the shared agent network if enabled
    // This allows containers to communicate via container names as hostnames
    if config.use_agent_network {
        // Ensure network exists (will be created if needed)
        if let Err(e) = docker::ensure_agent_network() {
            log::warn!("Failed to create agent network: {}", e);
        } else {
            docker_args.push(format!("--network {}", docker::get_agent_network_name()));
            // Set hostname to container name for easy discovery
            docker_args.push(format!("--hostname {}", container_name));
        }
    }

    // Add resource limits
    if let Some(ref mem) = config.memory_limit {
        docker_args.push(format!("-m {}", mem));
    }
    if let Some(ref cpu) = config.cpu_limit {
        docker_args.push(format!("--cpus {}", cpu));
    }

    // Add port mappings (with optional remapping to unique ranges)
    if config.remap_ports {
        // Remap ports to unique ranges to avoid conflicts between agents
        for port_mapping in &config.ports {
            let host_port = docker::remap_port_to_range(port_mapping.container_port, issue_number);
            let remapped = PortMapping {
                host_port,
                container_port: port_mapping.container_port,
                protocol: port_mapping.protocol.clone(),
            };
            docker_args.push(remapped.to_docker_arg());
        }
    } else {
        // Use ports as-is
        for port_mapping in &config.ports {
            docker_args.push(port_mapping.to_docker_arg());
        }
    }

    // Pass through credentials from host environment
    docker_args.push("-e GH_TOKEN".to_string());
    docker_args.push("-e GITHUB_TOKEN".to_string());
    docker_args.push("-e ANTHROPIC_API_KEY".to_string());

    // Add context env vars
    docker_args.push(format!("-e HANDY_ISSUE_REF={}#{}", repo, issue_number));
    docker_args.push(format!("-e HANDY_AGENT_TYPE={}", agent_type));
    docker_args.push(format!("-e HANDY_CONTAINER_NAME={}", container_name));

    // Add port range info so the agent knows which ports it can use
    if config.remap_ports {
        let (base, end) = docker::allocate_port_range(issue_number);
        docker_args.push(format!("-e HANDY_PORT_RANGE_BASE={}", base));
        docker_args.push(format!("-e HANDY_PORT_RANGE_END={}", end));
    }

    // Add image and command
    docker_args.push(image.to_string());
    docker_args.push("sh -c".to_string());

    // Install Claude Code and run the agent command
    let install_and_run = format!("npm install -g @anthropic/claude-code && {}", inner_command);
    docker_args.push(format!("'{}'", install_and_run.replace('\'', "'\\''")));

    Ok(docker_args.join(" "))
}

/// Build the inner agent command (used both directly and inside containers)
fn build_agent_command_inner(
    agent_type: &str,
    repo: &str,
    issue_number: u64,
    issue_title: Option<&str>,
    auto_accept: bool,
) -> Result<String, String> {
    let title_arg = issue_title
        .map(|t| {
            let escaped = t.replace('\'', "'\\''");
            format!(" --title '{}'", escaped)
        })
        .unwrap_or_default();

    let command = match agent_type.to_lowercase().as_str() {
        "claude" => {
            if auto_accept {
                // In sandbox, we can safely skip permissions
                format!(
                    "claude --dangerously-skip-permissions 'Work on GitHub issue {}#{}: Implement the requirements described in the issue. When done, commit your changes and create a PR.'",
                    repo, issue_number
                )
            } else {
                format!(
                    "claude 'Work on GitHub issue {}#{}: Implement the requirements described in the issue. When done, commit your changes and create a PR.'",
                    repo, issue_number
                )
            }
        }
        "aider" => {
            format!(
                "aider --message 'Work on GitHub issue {}#{}{}. Implement the requirements and commit when done.'",
                repo, issue_number, title_arg
            )
        }
        "codex" | "openai" => {
            format!(
                "codex 'Implement GitHub issue {}#{}{}'",
                repo, issue_number, title_arg
            )
        }
        "gemini" => {
            format!(
                "gemini-cli 'Work on GitHub issue {}#{}{}'",
                repo, issue_number, title_arg
            )
        }
        "ollama" | "local" => {
            format!(
                "ollama run codellama 'Implement GitHub issue {}#{}{}'",
                repo, issue_number, title_arg
            )
        }
        "manual" => {
            format!(
                "echo '🔧 Manual work session for issue {}#{}. The worktree is ready for you to work in.'",
                repo, issue_number
            )
        }
        _ => {
            return Err(format!(
                "Unknown agent type '{}'. Supported types: claude, aider, codex, gemini, ollama, manual",
                agent_type
            ));
        }
    };

    Ok(command)
}

/// Build the command to start an agent based on type and context
///
/// Returns the shell command that should be sent to the tmux session
/// to start the appropriate agent with the issue context.
/// This is for non-sandboxed execution (auto_accept = false).
pub fn build_agent_command(
    agent_type: &str,
    repo: &str,
    issue_number: u64,
    issue_title: Option<&str>,
) -> Result<String, String> {
    // Non-sandboxed mode: don't auto-accept
    build_agent_command_inner(agent_type, repo, issue_number, issue_title, false)
}

/// Start an agent in an existing tmux session
///
/// This sends the appropriate command to the session to start the agent.
/// Call this after create_session() to actually begin agent work.
pub fn start_agent_in_session(
    session_name: &str,
    agent_type: &str,
    repo: &str,
    issue_number: u64,
    issue_title: Option<&str>,
) -> Result<(), String> {
    let command = build_agent_command(agent_type, repo, issue_number, issue_title)?;
    send_command(session_name, &command)
}

/// Start an agent in a Docker container inside a tmux session
///
/// This runs the agent inside a Docker container, which provides:
/// - Filesystem isolation (worktree mounted at /workspace)
/// - Resource limits (memory, CPU)
/// - Safe auto-accept mode (--dangerously-skip-permissions is safe in sandbox)
/// - Credential pass-through from host environment
///
/// The tmux session allows:
/// - Attaching to see agent progress
/// - Recovery if the container stops
/// - Consistent management with non-sandboxed agents
pub fn start_sandboxed_agent_in_session(
    session_name: &str,
    agent_type: &str,
    repo: &str,
    issue_number: u64,
    issue_title: Option<&str>,
    sandbox_config: &SandboxedAgentConfig,
) -> Result<(), String> {
    let command =
        build_sandboxed_agent_command(agent_type, repo, issue_number, issue_title, sandbox_config)?;
    send_command(session_name, &command)
}

/// Restart an agent in an existing session
///
/// Use this for recovery when a session exists but the agent process has stopped.
/// This will attempt to restart the agent with the same context.
pub fn restart_agent(session_name: &str) -> Result<(), String> {
    // Get metadata to rebuild the agent command
    let metadata = get_session_metadata(session_name)?;

    let repo = metadata
        .repo
        .ok_or("Session has no repository metadata - cannot restart")?;

    let issue_number = metadata
        .issue_ref
        .as_ref()
        .and_then(|r| r.split('#').last())
        .and_then(|n| n.parse::<u64>().ok())
        .ok_or("Session has no valid issue reference - cannot restart")?;

    // Start the agent with the stored metadata
    start_agent_in_session(
        session_name,
        &metadata.agent_type,
        &repo,
        issue_number,
        None, // We don't store the title in metadata, agent will fetch from GitHub
    )
}

/// Generate a session name for an issue
pub fn session_name_for_issue(issue_number: u32) -> String {
    format!("{}{}", SESSION_PREFIX, issue_number)
}

/// Generate a session name for a manual (non-issue) session
pub fn session_name_manual(suffix: &str) -> String {
    format!("{}manual-{}", SESSION_PREFIX, suffix)
}

/// Ensure a master tmux session exists for orchestration and management.
/// This session serves as a persistent handler for background tasks.
/// Returns Ok(true) if the session was created, Ok(false) if it already exists.
pub fn ensure_master_session() -> Result<bool, String> {
    const MASTER_SESSION: &str = "handy-master";

    // Check if master session already exists
    // list_sessions() will fail if tmux server isn't running, which is fine
    if let Ok(sessions) = list_sessions() {
        let exists = sessions.iter().any(|s| s.name == MASTER_SESSION);
        if exists {
            return Ok(false);
        }
    }
    // If list_sessions() failed, tmux server isn't running - we'll create the master session

    // Create master session directly (bypassing create_session to avoid list_sessions check)
    let output = Command::new("tmux")
        .args(["-L", SOCKET_NAME, "new-session", "-d", "-s", MASTER_SESSION])
        .output()
        .map_err(|e| format!("Failed to create master session: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "tmux error: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    // Set metadata for the master session
    let machine_id = get_machine_id();
    let started_at = chrono::Utc::now().to_rfc3339();
    set_session_env(MASTER_SESSION, ENV_AGENT_TYPE, "master")?;
    set_session_env(MASTER_SESSION, ENV_MACHINE_ID, &machine_id)?;
    set_session_env(MASTER_SESSION, ENV_STARTED_AT, &started_at)?;

    log::info!("Created master tmux session: {}", MASTER_SESSION);

    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_session_name_generation() {
        assert_eq!(session_name_for_issue(42), "handy-agent-42");
        assert_eq!(session_name_manual("test"), "handy-agent-manual-test");
    }

    #[test]
    fn test_is_tmux_running() {
        // Just ensure it doesn't panic
        let _ = is_tmux_running();
    }
}
