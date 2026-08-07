//! DevOps-related Tauri commands.

use crate::devops::{
    DevOpsDependencies, check_all_dependencies,
    github::{
        self, GhAuthStatus, GitHubComment, GitHubIssue, GitHubPullRequest, IssueAgentMetadata,
        IssueWithAgent, PrStatus,
    },
    operations::agent_lifecycle::PrDetectionResult,
    orchestrator::{
        self, AgentStatus, CompleteWorkResult, SpawnConfig, SpawnResult, WorkflowConfig,
    },
    tmux::{self, AgentMetadata, RecoveredSession, RecoveryResult, TmuxSession},
    worktree::{self, CollisionCheck, WorktreeConfig, WorktreeCreateResult, WorktreeInfo},
};
use crate::settings;
use tauri::{AppHandle, Emitter};

/// Check if required DevOps dependencies (gh, tmux) are installed.
/// Runs in a blocking task to avoid freezing the UI.
#[tauri::command]
#[specta::specta]
pub async fn check_devops_dependencies() -> Result<DevOpsDependencies, String> {
    tokio::task::spawn_blocking(check_all_dependencies)
        .await
        .map_err(|e| format!("Failed to check dependencies: {}", e))
}

/// Launch authentication flow for a CLI tool by creating a tmux session.
/// Returns the session name so the user can attach to it.
#[tauri::command]
#[specta::specta]
pub fn launch_cli_auth(tool_name: String) -> Result<String, String> {
    // Use the same socket name as other Handy tmux sessions
    const SOCKET_NAME: &str = "handy";

    let session_name = format!("handy-auth-{}", tool_name);

    // Determine the command to run based on the tool
    let auth_command = match tool_name.as_str() {
        "gh" => "gh auth login",
        "claude" => "claude",
        _ => return Err(format!("Unknown tool: {}", tool_name)),
    };

    // Create a tmux session that runs the auth command
    // The session will stay open so the user can complete the OAuth flow
    let result = std::process::Command::new("tmux")
        .args([
            "-L",
            SOCKET_NAME,
            "new-session",
            "-d",
            "-s",
            &session_name,
            "-x",
            "120",
            "-y",
            "30",
            auth_command,
        ])
        .output();

    match result {
        Ok(output) => {
            if output.status.success() {
                // Open Terminal.app and attach to the session
                let _ = std::process::Command::new("open")
                    .args(["-a", "Terminal"])
                    .spawn();

                // Give Terminal a moment to open, then attach
                std::thread::sleep(std::time::Duration::from_millis(500));

                // Attach using the same socket
                let _ = std::process::Command::new("osascript")
                    .args([
                        "-e",
                        &format!(
                            "tell application \"Terminal\" to do script \"tmux -L {} attach-session -t {}\"",
                            SOCKET_NAME,
                            session_name
                        ),
                    ])
                    .spawn();

                Ok(session_name)
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                Err(format!("Failed to create auth session: {}", stderr))
            }
        }
        Err(e) => Err(format!("Failed to run tmux: {}", e)),
    }
}

/// Attach to an existing tmux session by opening Terminal.app.
#[tauri::command]
#[specta::specta]
pub fn attach_tmux_session(session_name: String) -> Result<(), String> {
    const SOCKET_NAME: &str = "handy";

    // Open Terminal.app
    let _ = std::process::Command::new("open")
        .args(["-a", "Terminal"])
        .spawn();

    // Give Terminal a moment to open, then attach
    std::thread::sleep(std::time::Duration::from_millis(500));

    // Attach to the session using the handy socket
    let result = std::process::Command::new("osascript")
        .args([
            "-e",
            &format!(
                "tell application \"Terminal\" to do script \"tmux -L {} attach-session -t {}\"",
                SOCKET_NAME, session_name
            ),
        ])
        .output();

    match result {
        Ok(output) => {
            if output.status.success() {
                Ok(())
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                Err(format!("Failed to attach to session: {}", stderr))
            }
        }
        Err(e) => Err(format!("Failed to run osascript: {}", e)),
    }
}

/// List all Handy agent tmux sessions.
#[tauri::command]
#[specta::specta]
pub fn list_tmux_sessions(
    actor: tauri::State<'_, crate::devops::actor::DevOpsActorHandle>,
) -> Result<Vec<TmuxSession>, String> {
    match actor.sessions() {
        Some(sessions) => Ok(sessions),
        None => tmux::list_sessions(),
    }
}

/// Get metadata for a specific tmux session.
#[tauri::command]
#[specta::specta]
pub fn get_tmux_session_metadata(session_name: String) -> Result<AgentMetadata, String> {
    tmux::get_session_metadata(&session_name)
}

/// Create a new tmux session with metadata.
#[tauri::command]
#[specta::specta]
pub fn create_tmux_session(
    actor: tauri::State<'_, crate::devops::actor::DevOpsActorHandle>,
    session_name: String,
    working_dir: Option<String>,
    issue_ref: Option<String>,
    repo: Option<String>,
    agent_type: String,
) -> Result<(), String> {
    let metadata = AgentMetadata {
        session: session_name.clone(),
        issue_ref,
        repo,
        worktree: working_dir.clone(),
        agent_type,
        machine_id: hostname::get()
            .map(|h| h.to_string_lossy().to_string())
            .unwrap_or_else(|_| "unknown".to_string()),
        started_at: chrono::Utc::now().to_rfc3339(),
    };

    let result = tmux::create_session(&session_name, working_dir.as_deref(), &metadata);
    if result.is_ok() {
        actor.poke();
    }
    result
}

/// Kill a tmux session.
#[tauri::command]
#[specta::specta]
pub fn kill_tmux_session(
    actor: tauri::State<'_, crate::devops::actor::DevOpsActorHandle>,
    session_name: String,
) -> Result<(), String> {
    let result = tmux::kill_session(&session_name);
    if result.is_ok() {
        actor.poke();
    }
    result
}

/// Get recent output from a tmux session.
#[tauri::command]
#[specta::specta]
pub fn get_tmux_session_output(session_name: String, lines: Option<u32>) -> Result<String, String> {
    tmux::get_session_output(&session_name, lines)
}

/// Send a command to a tmux session (appends Enter key).
/// If command is empty, sends just Enter key.
#[tauri::command]
#[specta::specta]
pub fn send_tmux_command(session_name: String, command: String) -> Result<(), String> {
    tmux::send_command(&session_name, &command)
}

/// Send raw keys to a tmux session without appending Enter.
/// Use for special keys: Enter, Escape, Tab, Space, BSpace, Up, Down, Left, Right, C-c, etc.
#[tauri::command]
#[specta::specta]
pub fn send_tmux_keys(session_name: String, keys: String) -> Result<(), String> {
    tmux::send_keys(&session_name, &keys)
}

/// Recover agent sessions on startup.
#[tauri::command]
#[specta::specta]
pub fn recover_tmux_sessions() -> Result<Vec<RecoveredSession>, String> {
    tmux::recover_sessions()
}

/// Restart an agent in an existing tmux session.
///
/// Use this for recovery when a session exists but the agent process has stopped.
/// This reads the session metadata and restarts the appropriate agent command.
#[tauri::command]
#[specta::specta]
pub fn restart_agent_in_session(session_name: String) -> Result<(), String> {
    tmux::restart_agent(&session_name)
}

/// Recover all sessions that need attention.
///
/// - `auto_restart`: If true, automatically restart agents in stopped sessions
/// - `auto_cleanup`: If true, automatically kill orphaned sessions (no worktree)
///
/// Returns results for each session that was processed.
#[tauri::command]
#[specta::specta]
pub fn recover_all_agent_sessions(
    auto_restart: bool,
    auto_cleanup: bool,
) -> Result<Vec<RecoveryResult>, String> {
    tmux::recover_all_sessions(auto_restart, auto_cleanup)
}

/// Check if tmux server is running.
#[tauri::command]
#[specta::specta]
pub fn is_tmux_running() -> bool {
    tmux::is_tmux_running()
}

/// Ensure a master tmux session exists for orchestration.
/// Returns true if the session was created, false if it already exists.
#[tauri::command]
#[specta::specta]
pub fn ensure_master_tmux_session() -> Result<bool, String> {
    tmux::ensure_master_session()
}

// ============================================================================
// Git Worktree Commands
// ============================================================================

/// List all git worktrees in a repository.
#[tauri::command]
#[specta::specta]
pub fn list_git_worktrees(repo_path: String) -> Result<Vec<WorktreeInfo>, String> {
    worktree::list_worktrees(&repo_path)
}

/// Get information about a specific worktree.
#[tauri::command]
#[specta::specta]
pub fn get_git_worktree_info(
    repo_path: String,
    worktree_path: String,
) -> Result<WorktreeInfo, String> {
    worktree::get_worktree_info(&repo_path, &worktree_path)
}

/// Check for collisions before creating a worktree.
#[tauri::command]
#[specta::specta]
pub fn check_worktree_collision(
    repo_path: String,
    worktree_path: String,
    branch_name: String,
) -> Result<CollisionCheck, String> {
    worktree::check_collision(&repo_path, &worktree_path, &branch_name)
}

/// Create a new git worktree with a new branch.
#[tauri::command]
#[specta::specta]
pub fn create_git_worktree(
    repo_path: String,
    name: String,
    prefix: Option<String>,
    base_path: Option<String>,
    base_branch: Option<String>,
) -> Result<WorktreeCreateResult, String> {
    let config = WorktreeConfig {
        prefix: prefix.unwrap_or_default(),
        base_path,
        delete_branch_on_merge: true,
    };
    worktree::create_worktree(&repo_path, &name, &config, base_branch.as_deref())
}

/// Create a worktree using an existing branch.
#[tauri::command]
#[specta::specta]
pub fn create_git_worktree_existing_branch(
    repo_path: String,
    branch_name: String,
    prefix: Option<String>,
    base_path: Option<String>,
) -> Result<WorktreeCreateResult, String> {
    let config = WorktreeConfig {
        prefix: prefix.unwrap_or_default(),
        base_path,
        delete_branch_on_merge: true,
    };
    worktree::create_worktree_existing_branch(&repo_path, &branch_name, &config)
}

/// Remove a git worktree.
#[tauri::command]
#[specta::specta]
pub fn remove_git_worktree(
    repo_path: String,
    worktree_path: String,
    force: bool,
    delete_branch: bool,
) -> Result<(), String> {
    worktree::remove_worktree(&repo_path, &worktree_path, force, delete_branch)
}

/// Prune stale worktree entries.
#[tauri::command]
#[specta::specta]
pub fn prune_git_worktrees(repo_path: String) -> Result<(), String> {
    worktree::prune_worktrees(&repo_path)
}

/// Get the root directory of a git repository.
#[tauri::command]
#[specta::specta]
pub fn get_git_repo_root(path: String) -> Result<String, String> {
    worktree::get_repo_root(&path)
}

/// Get the default branch of a repository.
#[tauri::command]
#[specta::specta]
pub fn get_git_default_branch(repo_path: String) -> Result<String, String> {
    worktree::get_default_branch(&repo_path)
}

/// Suggest local paths for a GitHub repository.
/// Searches common locations for cloned repos matching the given owner/repo format.
#[tauri::command]
#[specta::specta]
pub fn suggest_local_repo_path(github_repo: String) -> Vec<String> {
    let mut suggestions = Vec::new();

    // Extract repo name from "owner/repo" format
    let repo_name = github_repo.split('/').last().unwrap_or(&github_repo);

    // Get home directory using std::env
    let home = match std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map(std::path::PathBuf::from)
    {
        Ok(h) => h,
        Err(_) => return suggestions,
    };

    // Common locations to search
    let search_paths = vec![
        home.join("Documents/GitHub"),
        home.join("Documents"),
        home.join("Projects"),
        home.join("Code"),
        home.join("repos"),
        home.join("Developer"),
        home.join("dev"),
        home.clone(),
    ];

    for base_path in search_paths {
        if !base_path.exists() {
            continue;
        }

        // Check direct match
        let direct = base_path.join(repo_name);
        if direct.exists() && direct.join(".git").exists() {
            suggestions.push(direct.to_string_lossy().to_string());
        }

        // Also check with owner prefix (e.g., KBVE/kbve -> kbve)
        if github_repo.contains('/') {
            let with_owner = base_path.join(&github_repo.replace('/', "-"));
            if with_owner.exists() && with_owner.join(".git").exists() {
                suggestions.push(with_owner.to_string_lossy().to_string());
            }
        }
    }

    // Also add current working directory if it's a git repo
    if let Ok(cwd) = std::env::current_dir() {
        if cwd.join(".git").exists() {
            let cwd_str = cwd.to_string_lossy().to_string();
            if !suggestions.contains(&cwd_str) {
                suggestions.push(cwd_str);
            }
        }
    }

    suggestions
}

// ============================================================================
// GitHub Issue Commands
// ============================================================================

/// Check GitHub CLI authentication status.
#[tauri::command]
#[specta::specta]
pub fn check_gh_auth() -> GhAuthStatus {
    github::check_auth_status()
}

/// List issues from a GitHub repository.
#[tauri::command]
#[specta::specta]
pub fn list_github_issues(
    repo: String,
    state: Option<String>,
    labels: Option<Vec<String>>,
    limit: Option<u32>,
) -> Result<Vec<GitHubIssue>, String> {
    let state_ref = state.as_deref();
    let labels_ref: Option<Vec<&str>> = labels
        .as_ref()
        .map(|v| v.iter().map(|s| s.as_str()).collect());
    github::list_issues(&repo, state_ref, labels_ref, limit)
}

/// Get details of a specific GitHub issue.
#[tauri::command]
#[specta::specta]
pub fn get_github_issue(repo: String, number: u64) -> Result<GitHubIssue, String> {
    github::get_issue(&repo, number)
}

/// Get issue with agent metadata.
#[tauri::command]
#[specta::specta]
pub fn get_github_issue_with_agent(repo: String, number: u64) -> Result<IssueWithAgent, String> {
    github::get_issue_with_agent(&repo, number)
}

/// Create a new GitHub issue.
#[tauri::command]
#[specta::specta]
pub fn create_github_issue(
    repo: String,
    title: String,
    body: Option<String>,
    labels: Option<Vec<String>>,
) -> Result<GitHubIssue, String> {
    let body_ref = body.as_deref();
    let labels_ref: Option<Vec<&str>> = labels
        .as_ref()
        .map(|v| v.iter().map(|s| s.as_str()).collect());
    github::create_issue(&repo, &title, body_ref, labels_ref)
}

/// Add a comment to a GitHub issue.
#[tauri::command]
#[specta::specta]
pub fn comment_on_github_issue(repo: String, number: u64, body: String) -> Result<(), String> {
    github::add_comment(&repo, number, &body)
}

/// Assign an agent to a GitHub issue (adds metadata comment).
#[tauri::command]
#[specta::specta]
pub fn assign_agent_to_issue(
    repo: String,
    number: u64,
    session: String,
    agent_type: String,
    worktree: Option<String>,
) -> Result<(), String> {
    let metadata = IssueAgentMetadata {
        session,
        machine_id: hostname::get()
            .map(|h| h.to_string_lossy().to_string())
            .unwrap_or_else(|_| "unknown".to_string()),
        worktree,
        agent_type,
        started_at: chrono::Utc::now().to_rfc3339(),
        status: "working".to_string(),
    };
    github::add_agent_metadata_comment(&repo, number, &metadata)
}

/// List comments on a GitHub issue.
#[tauri::command]
#[specta::specta]
pub fn list_github_issue_comments(repo: String, number: u64) -> Result<Vec<GitHubComment>, String> {
    github::list_comments(&repo, number)
}

/// Update labels on a GitHub issue.
#[tauri::command]
#[specta::specta]
pub fn update_github_issue_labels(
    repo: String,
    number: u64,
    add_labels: Vec<String>,
    remove_labels: Vec<String>,
) -> Result<(), String> {
    let add_refs: Vec<&str> = add_labels.iter().map(|s| s.as_str()).collect();
    let remove_refs: Vec<&str> = remove_labels.iter().map(|s| s.as_str()).collect();
    github::update_labels(&repo, number, add_refs, remove_refs)
}

/// Close a GitHub issue.
#[tauri::command]
#[specta::specta]
pub fn close_github_issue(
    repo: String,
    number: u64,
    comment: Option<String>,
) -> Result<(), String> {
    github::close_issue(&repo, number, comment.as_deref())
}

/// Reopen a closed GitHub issue.
#[tauri::command]
#[specta::specta]
pub fn reopen_github_issue(repo: String, number: u64) -> Result<(), String> {
    github::reopen_issue(&repo, number)
}

// ============================================================================
// GitHub Pull Request Commands
// ============================================================================

/// List pull requests from a GitHub repository.
#[tauri::command]
#[specta::specta]
pub fn list_github_prs(
    repo: String,
    state: Option<String>,
    base: Option<String>,
    limit: Option<u32>,
) -> Result<Vec<GitHubPullRequest>, String> {
    let state_ref = state.as_deref();
    let base_ref = base.as_deref();
    github::list_prs(&repo, state_ref, base_ref, limit)
}

/// Get details of a specific GitHub pull request.
#[tauri::command]
#[specta::specta]
pub fn get_github_pr(repo: String, number: u64) -> Result<GitHubPullRequest, String> {
    github::get_pr(&repo, number)
}

/// Get full status of a pull request (PR + checks + reviews).
#[tauri::command]
#[specta::specta]
pub fn get_github_pr_status(repo: String, number: u64) -> Result<PrStatus, String> {
    github::get_pr_status(&repo, number)
}

/// Create a new GitHub pull request.
#[tauri::command]
#[specta::specta]
pub fn create_github_pr(
    repo: String,
    title: String,
    body: Option<String>,
    base: String,
    head: Option<String>,
    draft: bool,
) -> Result<GitHubPullRequest, String> {
    let body_ref = body.as_deref();
    let head_ref = head.as_deref();
    github::create_pr(&repo, &title, body_ref, &base, head_ref, draft)
}

/// Merge a GitHub pull request.
#[tauri::command]
#[specta::specta]
pub fn merge_github_pr(
    repo: String,
    number: u64,
    method: Option<String>,
    delete_branch: bool,
) -> Result<(), String> {
    github::merge_pr(&repo, number, method.as_deref(), delete_branch)
}

/// Close a GitHub pull request without merging.
#[tauri::command]
#[specta::specta]
pub fn close_github_pr(repo: String, number: u64, comment: Option<String>) -> Result<(), String> {
    github::close_pr(&repo, number, comment.as_deref())
}

// ============================================================================
// Agent Orchestration Commands
// ============================================================================

/// Spawn a new agent to work on an issue.
///
/// Creates a worktree, tmux session (or Docker container if sandbox enabled),
/// and updates the issue with metadata.
#[tauri::command]
#[specta::specta]
pub fn spawn_agent(
    app: AppHandle,
    repo: String,
    issue_number: u64,
    agent_type: String,
    repo_path: String,
    session_name: Option<String>,
    worktree_prefix: Option<String>,
    working_labels: Option<Vec<String>>,
    use_sandbox: Option<bool>,
) -> Result<SpawnResult, String> {
    // Get sandbox setting from app settings if not explicitly provided
    let sandbox_enabled = use_sandbox.unwrap_or_else(|| {
        let app_settings = settings::get_settings(&app);
        app_settings.sandbox_enabled
    });

    let config = SpawnConfig {
        repo,
        issue_number,
        agent_type,
        session_name,
        worktree_prefix,
        working_labels: working_labels.unwrap_or_default(),
        use_sandbox: sandbox_enabled,
        sandbox_ports: vec![], // Auto-detect ports from project
    };
    orchestrator::spawn_agent(&config, &repo_path)
}

/// Get status of all active agents.
#[tauri::command]
#[specta::specta]
pub fn list_agent_statuses() -> Result<Vec<AgentStatus>, String> {
    orchestrator::list_agent_statuses()
}

/// Clean up an agent's resources after work is complete.
#[tauri::command]
#[specta::specta]
pub fn cleanup_agent(
    session_name: String,
    repo_path: String,
    remove_worktree: bool,
    delete_branch: bool,
) -> Result<(), String> {
    orchestrator::cleanup_agent(&session_name, &repo_path, remove_worktree, delete_branch)
}

/// Create a PR from an agent's work.
#[tauri::command]
#[specta::specta]
pub fn create_pr_from_agent(
    session_name: String,
    title: String,
    body: Option<String>,
    draft: bool,
) -> Result<GitHubPullRequest, String> {
    orchestrator::create_pr_from_agent(&session_name, &title, body.as_deref(), draft)
}

/// Complete an agent's work with workflow automation.
///
/// Creates PR, updates issue with link, manages labels.
#[tauri::command]
#[specta::specta]
pub fn complete_agent_work(
    session_name: String,
    pr_title: String,
    pr_body: Option<String>,
    working_labels: Vec<String>,
    pr_labels: Vec<String>,
    draft_pr: bool,
) -> Result<CompleteWorkResult, String> {
    let config = WorkflowConfig {
        working_labels,
        pr_labels,
        draft_pr,
        close_on_merge: true,
    };
    orchestrator::complete_agent_work(&session_name, &pr_title, pr_body.as_deref(), &config)
}

/// Check if a PR has been merged and cleanup resources if so.
#[tauri::command]
#[specta::specta]
pub fn check_and_cleanup_merged_pr(
    session_name: String,
    repo_path: String,
    pr_number: u64,
) -> Result<bool, String> {
    orchestrator::check_and_cleanup_merged_pr(&session_name, &repo_path, pr_number)
}

/// Get current machine identifier.
#[tauri::command]
#[specta::specta]
pub fn get_current_machine_id() -> String {
    orchestrator::get_current_machine_id()
}

/// List only agents running on this machine.
#[tauri::command]
#[specta::specta]
pub fn list_local_agent_statuses() -> Result<Vec<AgentStatus>, String> {
    orchestrator::list_local_agent_statuses()
}

/// List agents from other machines (potentially orphaned).
#[tauri::command]
#[specta::specta]
pub fn list_remote_agent_statuses() -> Result<Vec<AgentStatus>, String> {
    orchestrator::list_remote_agent_statuses()
}

/// Toggle an agent type on/off.
#[tauri::command]
#[specta::specta]
pub fn toggle_agent_enabled(
    app: AppHandle,
    agent_type: String,
    enabled: bool,
) -> Result<Vec<String>, String> {
    let mut app_settings = settings::get_settings(&app);

    if enabled {
        // Add to enabled list if not already present
        if !app_settings.enabled_agents.contains(&agent_type) {
            app_settings.enabled_agents.push(agent_type);
        }
    } else {
        // Remove from enabled list
        app_settings.enabled_agents.retain(|a| a != &agent_type);
    }

    let result = app_settings.enabled_agents.clone();
    settings::write_settings(&app, app_settings);
    Ok(result)
}

/// Get list of enabled agents.
#[tauri::command]
#[specta::specta]
pub fn get_enabled_agents(app: AppHandle) -> Vec<String> {
    let app_settings = settings::get_settings(&app);
    app_settings.enabled_agents
}

/// Set the list of enabled agents (bulk update).
#[tauri::command]
#[specta::specta]
pub fn set_enabled_agents(app: AppHandle, agents: Vec<String>) -> Vec<String> {
    let mut app_settings = settings::get_settings(&app);
    app_settings.enabled_agents = agents;
    let result = app_settings.enabled_agents.clone();
    settings::write_settings(&app, app_settings);
    result
}

/// Get whether sandbox mode is enabled for agent spawning.
#[tauri::command]
#[specta::specta]
pub fn get_sandbox_enabled(app: AppHandle) -> bool {
    let app_settings = settings::get_settings(&app);
    app_settings.sandbox_enabled
}

/// Set whether sandbox mode is enabled for agent spawning.
#[tauri::command]
#[specta::specta]
pub fn set_sandbox_enabled(app: AppHandle, enabled: bool) -> bool {
    let mut app_settings = settings::get_settings(&app);
    app_settings.sandbox_enabled = enabled;
    settings::write_settings(&app, app_settings);
    enabled
}

/// Clean up orphaned Docker containers from sandbox execution.
///
/// Finds and removes containers that match `handy-sandbox-*` or `handy-support-sandbox-*`
/// but don't have a corresponding active tmux session.
///
/// Emits `orphan-container-cleaned` events for each cleaned container (for toast notifications).
#[tauri::command]
#[specta::specta]
pub fn cleanup_orphaned_containers(
    app: AppHandle,
) -> Result<crate::devops::docker::OrphanCleanupResult, String> {
    let result = crate::devops::docker::cleanup_orphaned_containers()?;

    // Emit events for each cleaned orphan so UI can show toast notifications
    for orphan in &result.cleaned_orphans {
        let _ = app.emit("orphan-container-cleaned", orphan.clone());
    }

    Ok(result)
}

/// Check the status of the Claude Code authentication volume.
///
/// Returns information about whether the volume exists and has credentials.
#[tauri::command]
#[specta::specta]
pub fn check_claude_auth_volume() -> Result<crate::devops::docker::ClaudeAuthVolumeStatus, String> {
    crate::devops::docker::check_claude_auth_volume()
}

/// Launch an interactive container for Claude Code authentication.
///
/// Opens a new Terminal window with a container where the user can run `claude /login`.
/// Credentials are saved to a persistent Docker volume for future sandbox use.
#[tauri::command]
#[specta::specta]
pub fn launch_claude_auth_setup() -> Result<String, String> {
    crate::devops::docker::launch_claude_auth_in_terminal()
}

// ===== Epic Workflow Operations =====

/// Create a new epic issue with standardized structure
#[tauri::command]
#[specta::specta]
pub async fn create_epic(
    config: crate::devops::operations::EpicConfig,
) -> Result<crate::devops::operations::EpicInfo, String> {
    crate::devops::operations::create_epic(config).await
}

/// Create multiple sub-issues for an epic in batch
#[tauri::command]
#[specta::specta]
pub async fn create_sub_issues(
    epic_number: u32,
    epic_repo: String,
    epic_work_repo: String,
    sub_issues: Vec<crate::devops::operations::SubIssueConfig>,
) -> Result<Vec<crate::devops::operations::SubIssueInfo>, String> {
    crate::devops::operations::create_sub_issues(epic_number, epic_repo, epic_work_repo, sub_issues)
        .await
}

/// Update epic issue progress based on sub-issue completion
#[tauri::command]
#[specta::specta]
pub async fn update_epic_progress(
    epic_number: u32,
    epic_repo: String,
) -> Result<crate::devops::operations::EpicProgress, String> {
    crate::devops::operations::update_epic_progress(epic_number, epic_repo).await
}

/// Spawn an agent for a GitHub issue
#[tauri::command]
#[specta::specta]
pub async fn spawn_agent_from_issue(
    app: AppHandle,
    config: crate::devops::operations::SpawnAgentConfig,
) -> Result<crate::devops::operations::AgentSpawnResult, String> {
    let issue_ref = config.issue_ref.clone();
    let result = crate::devops::operations::spawn_agent_from_issue(config).await;
    if result.is_ok() {
        crate::agent_voice::announce_from_app(&app, &format!("Agent spawned on {}", issue_ref));
    }
    result
}

/// Complete agent work by creating a PR
#[tauri::command]
#[specta::specta]
pub async fn complete_agent_work_with_pr(
    session: String,
    pr_title: Option<String>,
) -> Result<crate::devops::operations::AgentCompletionResult, String> {
    crate::devops::operations::complete_agent_work(session, pr_title).await
}

/// Plan an Epic from a markdown file using AI agent
#[tauri::command]
#[specta::specta]
pub async fn plan_epic_from_markdown(
    app: AppHandle,
    config: crate::devops::operations::PlanFromMarkdownConfig,
) -> Result<crate::devops::operations::PlanResult, String> {
    // Get enabled agents from settings
    let app_settings = crate::settings::get_settings(&app);
    let enabled_agents = app_settings.enabled_agents;

    crate::devops::operations::plan_from_markdown(config, enabled_agents).await
}

/// List all available Epic plan templates from docs/plans directory
#[tauri::command]
#[specta::specta]
pub fn list_epic_plan_templates(
    app: AppHandle,
) -> Result<Vec<crate::devops::operations::PlanTemplate>, String> {
    // In dev mode, look relative to current directory (project root)
    // In production, look relative to the app's resource directory
    #[cfg(debug_assertions)]
    let repo_root = {
        // In dev mode, go up from src-tauri to project root
        let current = std::env::current_dir()
            .map_err(|e| format!("Failed to get current directory: {}", e))?;

        // Check if we're in src-tauri directory
        if current.ends_with("src-tauri") {
            current
                .parent()
                .ok_or_else(|| "Could not find parent directory".to_string())?
                .to_path_buf()
        } else {
            current
        }
    };

    #[cfg(not(debug_assertions))]
    let repo_root = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Failed to get resource directory: {}", e))?;

    crate::devops::operations::list_plan_templates(&repo_root)
}

// ===== Epic Orchestration Commands =====

/// Start orchestration for an epic - creates sub-issues and optionally spawns agents
#[tauri::command]
#[specta::specta]
pub async fn start_epic_orchestration(
    epic: crate::devops::operations::EpicInfo,
    config: crate::devops::operations::StartOrchestrationConfig,
) -> Result<crate::devops::operations::OrchestrationResult, String> {
    crate::devops::operations::start_orchestration(&epic, config).await
}

/// Get status of all phases in an epic
#[tauri::command]
#[specta::specta]
pub async fn get_epic_phase_status(
    epic_number: u32,
    epic_repo: String,
    phases: Vec<crate::devops::operations::PhaseConfig>,
) -> Result<Vec<crate::devops::operations::PhaseStatus>, String> {
    crate::devops::operations::get_epic_phase_status(epic_number, &epic_repo, &phases).await
}

/// Load an existing epic from GitHub by issue number
///
/// Parses the epic's body to extract phases and metadata for orchestration.
#[tauri::command]
#[specta::specta]
pub async fn load_epic(
    repo: String,
    epic_number: u32,
) -> Result<crate::devops::operations::EpicInfo, String> {
    crate::devops::operations::load_epic(repo, epic_number).await
}

/// Update the Epic issue on GitHub with current phase status.
///
/// Call this after phases complete to keep the Epic issue body in sync.
#[tauri::command]
#[specta::specta]
pub async fn update_epic_phase_status_on_github(
    epic_repo: String,
    epic_number: u32,
    phase_statuses: Vec<crate::devops::operations::PhaseStatus>,
) -> Result<(), String> {
    crate::devops::operations::update_epic_phase_status_on_github(
        &epic_repo,
        epic_number,
        &phase_statuses,
    )
    .await
}

/// Load an existing epic with full recovery information
///
/// Fetches the epic, all its sub-issues, and determines what work remains.
/// Useful for recovering/continuing orchestration on an existing epic.
#[tauri::command]
#[specta::specta]
pub async fn load_epic_for_recovery(
    repo: String,
    epic_number: u32,
) -> Result<crate::devops::operations::EpicRecoveryInfo, String> {
    crate::devops::operations::load_epic_for_recovery(repo, epic_number).await
}

/// Manually mark a phase's status on GitHub.
///
/// Use this for phases that were completed manually (without sub-issues)
/// or for recovery when the Epic body status doesn't match actual state.
#[tauri::command]
#[specta::specta]
pub async fn mark_epic_phase_status(
    epic_repo: String,
    epic_number: u32,
    phase_number: u32,
    new_status: String,
) -> Result<(), String> {
    crate::devops::operations::mark_phase_status(&epic_repo, epic_number, phase_number, &new_status)
        .await
}

// ===== Epic State Persistence Commands =====

/// Get the currently active Epic state (persisted across app restarts).
#[tauri::command]
#[specta::specta]
pub fn get_active_epic_state(
    app: AppHandle,
) -> Option<crate::devops::orchestration::ActiveEpicState> {
    crate::devops::orchestration::get_active_epic(&app)
}

/// Set the active Epic from an EpicInfo (when linking an Epic).
#[tauri::command]
#[specta::specta]
pub fn set_active_epic_state(
    app: AppHandle,
    epic_info: crate::devops::operations::EpicInfo,
) -> crate::devops::orchestration::ActiveEpicState {
    crate::devops::orchestration::set_active_epic(&app, &epic_info)
}

/// Set the active Epic from recovery info (more complete data with sub-issues).
#[tauri::command]
#[specta::specta]
pub fn set_active_epic_from_recovery(
    app: AppHandle,
    recovery: crate::devops::operations::EpicRecoveryInfo,
) -> crate::devops::orchestration::ActiveEpicState {
    crate::devops::orchestration::set_active_epic_from_recovery(&app, &recovery)
}

/// Clear the active Epic state. If archive is true, moves to history.
#[tauri::command]
#[specta::specta]
pub fn clear_active_epic_state(
    app: AppHandle,
    archive: bool,
) -> Option<crate::devops::orchestration::ActiveEpicState> {
    crate::devops::orchestration::clear_active_epic(&app, archive)
}

/// Sync the active Epic state with GitHub to get latest sub-issue status.
#[tauri::command]
#[specta::specta]
pub async fn sync_active_epic_state(
    app: AppHandle,
) -> Result<Option<crate::devops::orchestration::ActiveEpicState>, String> {
    crate::devops::orchestration::sync_active_epic(&app).await
}

/// Update a sub-issue's agent assignment in the active Epic.
#[tauri::command]
#[specta::specta]
pub fn update_epic_sub_issue_agent(
    app: AppHandle,
    issue_number: u32,
    session_name: Option<String>,
    agent_type: Option<String>,
) -> Result<(), String> {
    crate::devops::orchestration::update_epic_sub_issue_agent(
        &app,
        issue_number,
        session_name.as_deref(),
        agent_type.as_deref(),
    )
}

/// Update the local repository path for the active Epic.
///
/// This path is used when spawning agents to know where to create worktrees.
#[tauri::command]
#[specta::specta]
pub fn set_epic_local_repo_path(app: AppHandle, local_repo_path: String) -> Result<(), String> {
    crate::devops::orchestration::set_epic_local_repo_path(&app, &local_repo_path)
}

/// Handle pipeline item completion and optionally update Epic on GitHub.
///
/// Call this when a sub-issue is completed (PR merged, issue closed).
/// It syncs Epic state and optionally updates the Epic issue on GitHub
/// with the new phase progress.
#[tauri::command]
#[specta::specta]
pub async fn on_pipeline_item_complete(
    app: AppHandle,
    issue_number: u32,
    update_github: bool,
) -> Result<(), String> {
    let result =
        crate::devops::orchestration::on_pipeline_item_complete(&app, issue_number, update_github)
            .await;
    if result.is_ok() {
        crate::agent_voice::announce_from_app(
            &app,
            &format!("Issue {} completed its pipeline", issue_number),
        );
    }
    result
}

/// Merge a PR for a sub-issue that's in "Ready" state
///
/// This command:
/// 1. Finds the PR associated with the sub-issue
/// 2. Merges the PR (squash merge by default)
/// 3. Syncs the Epic state to update status
/// 4. Returns info about whether next phase can start
#[tauri::command]
#[specta::specta]
pub async fn merge_ready_pr(
    app: AppHandle,
    issue_number: u32,
    merge_method: Option<String>,
    delete_branch: bool,
) -> Result<crate::devops::orchestration::MergeResult, String> {
    let result = crate::devops::orchestration::merge_ready_pr(
        &app,
        issue_number,
        merge_method.as_deref(),
        delete_branch,
    )
    .await;
    if result.is_ok() {
        crate::agent_voice::announce_from_app(
            &app,
            &format!("Pull request for issue {} merged", issue_number),
        );
    }
    result
}

/// Process all "Ready" sub-issues for the active Epic
///
/// This command finds all sub-issues with PRs (Ready state) and merges them.
/// After each merge, it checks if the phase is complete and can start the next phase.
#[tauri::command]
#[specta::specta]
pub async fn process_ready_prs(
    app: AppHandle,
    merge_method: Option<String>,
    delete_branch: bool,
    auto_start_next_phase: bool,
) -> Result<crate::devops::orchestration::ProcessReadyResult, String> {
    crate::devops::orchestration::process_ready_prs(
        &app,
        merge_method.as_deref(),
        delete_branch,
        auto_start_next_phase,
    )
    .await
}

// ============================================================================
// Docker Sandbox Commands
// ============================================================================

/// Check if Docker is available and daemon is running
#[tauri::command]
#[specta::specta]
pub fn is_docker_available() -> bool {
    crate::devops::docker::is_docker_available()
}

/// Spawn a sandboxed agent in a Docker container
///
/// This creates an isolated container where the agent can run with
/// auto-accept permissions safely. The container has:
/// - The worktree mounted at /workspace
/// - GitHub and Anthropic credentials passed as env vars
/// - Resource limits applied
#[tauri::command]
#[specta::specta]
pub fn spawn_sandbox(
    config: crate::devops::docker::SandboxConfig,
) -> Result<crate::devops::docker::SandboxResult, String> {
    crate::devops::docker::spawn_sandbox(&config)
}

/// Get status of a sandbox container
#[tauri::command]
#[specta::specta]
pub fn get_sandbox_status(
    container_name: String,
) -> Result<crate::devops::docker::SandboxStatus, String> {
    crate::devops::docker::get_sandbox_status(&container_name)
}

/// Get logs from a sandbox container
#[tauri::command]
#[specta::specta]
pub fn get_sandbox_logs(container_name: String, tail: Option<u32>) -> Result<String, String> {
    crate::devops::docker::get_sandbox_logs(&container_name, tail)
}

/// Stop a sandbox container
#[tauri::command]
#[specta::specta]
pub fn stop_sandbox(container_name: String) -> Result<(), String> {
    crate::devops::docker::stop_sandbox(&container_name)
}

/// Remove a sandbox container
#[tauri::command]
#[specta::specta]
pub fn remove_sandbox(container_name: String, force: bool) -> Result<(), String> {
    crate::devops::docker::remove_sandbox(&container_name, force)
}

/// List all Handy sandbox containers
#[tauri::command]
#[specta::specta]
pub fn list_sandboxes() -> Result<Vec<crate::devops::docker::SandboxStatus>, String> {
    crate::devops::docker::list_sandboxes()
}

/// Check if devcontainer CLI is available
#[tauri::command]
#[specta::specta]
pub fn is_devcontainer_cli_available() -> bool {
    crate::devops::docker::is_devcontainer_cli_available()
}

/// Setup a devcontainer configuration for a worktree
///
/// Creates a .devcontainer/devcontainer.json file with the official
/// Anthropic Claude Code feature configured.
#[tauri::command]
#[specta::specta]
pub fn setup_devcontainer(
    worktree_path: String,
    issue_ref: String,
    gh_token: Option<String>,
    anthropic_key: Option<String>,
) -> Result<String, String> {
    crate::devops::docker::setup_devcontainer_for_worktree(
        &worktree_path,
        &issue_ref,
        gh_token.as_deref(),
        anthropic_key.as_deref(),
    )
}

/// Start a devcontainer for a workspace
///
/// Uses the devcontainer CLI to build and start the container.
#[tauri::command]
#[specta::specta]
pub fn start_devcontainer(worktree_path: String) -> Result<String, String> {
    crate::devops::docker::start_devcontainer(&worktree_path)
}

/// Execute a command inside a running devcontainer
#[tauri::command]
#[specta::specta]
pub fn exec_in_devcontainer(worktree_path: String, command: String) -> Result<String, String> {
    crate::devops::docker::exec_in_devcontainer(&worktree_path, &command)
}

/// Ensure the shared agent network exists for inter-container communication
///
/// Creates the 'handy-agents' Docker network if it doesn't exist.
/// Agents on this network can communicate using container names as hostnames.
#[tauri::command]
#[specta::specta]
pub fn ensure_agent_network() -> Result<(), String> {
    crate::devops::docker::ensure_agent_network()
}

/// Get network information for a sandboxed agent
///
/// Returns the allocated port range and network hostname for the agent.
/// Use this to know which ports are available and how other agents can reach this one.
#[tauri::command]
#[specta::specta]
pub fn get_agent_network_info(
    issue_number: u64,
    container_ports: Vec<u16>,
) -> crate::devops::docker::AgentNetworkInfo {
    crate::devops::docker::get_agent_network_info(issue_number, &container_ports)
}

/// List all containers on the agent network
///
/// Returns container names that can be used as hostnames for inter-container communication.
#[tauri::command]
#[specta::specta]
pub fn list_network_containers() -> Result<Vec<String>, String> {
    crate::devops::docker::list_network_containers()
}

// ===== Pipeline Orchestration Commands =====

/// Assign an issue to an agent, creating worktree and tmux session.
#[tauri::command]
#[specta::specta]
pub fn assign_issue_to_agent_pipeline(
    app: AppHandle,
    config: crate::devops::orchestration::AssignIssueConfig,
) -> Result<crate::devops::orchestration::AssignIssueResult, String> {
    crate::devops::orchestration::assign_issue_to_agent(&app, &config)
}

/// Skip an issue and update its labels.
#[tauri::command]
#[specta::specta]
pub fn skip_issue(
    app: AppHandle,
    config: crate::devops::orchestration::SkipIssueConfig,
) -> Result<crate::devops::pipeline::PipelineItem, String> {
    crate::devops::orchestration::skip_issue(&app, &config)
}

/// List all pipeline items, aggregating from multiple sources.
#[tauri::command]
#[specta::specta]
pub fn list_pipeline_items(
    app: AppHandle,
    work_repo: Option<String>,
) -> Result<Vec<crate::devops::pipeline::PipelineItem>, String> {
    crate::devops::orchestration::list_pipeline_items(&app, work_repo.as_deref())
}

/// Get pipeline history (completed items).
#[tauri::command]
#[specta::specta]
pub fn get_pipeline_history(
    app: AppHandle,
    limit: Option<usize>,
) -> Vec<crate::devops::pipeline::PipelineItem> {
    crate::devops::orchestration::get_pipeline_history(&app, limit)
}

/// Get pipeline summary statistics.
#[tauri::command]
#[specta::specta]
pub fn get_pipeline_summary(app: AppHandle) -> crate::devops::orchestration::PipelineSummary {
    crate::devops::orchestration::get_pipeline_summary(&app)
}

/// Detect and link PRs to pipeline items.
#[tauri::command]
#[specta::specta]
pub fn detect_and_link_prs(
    app: AppHandle,
    work_repo: String,
) -> Result<Vec<crate::devops::pipeline::PipelineItem>, String> {
    crate::devops::orchestration::detect_and_link_prs(&app, &work_repo)
}

/// Sync PR status for all pipeline items with PRs.
#[tauri::command]
#[specta::specta]
pub fn sync_all_pr_statuses(
    app: AppHandle,
) -> Result<Vec<crate::devops::pipeline::PipelineItem>, String> {
    crate::devops::orchestration::sync_all_pr_statuses(&app)
}

/// Update a specific pipeline item's PR status.
#[tauri::command]
#[specta::specta]
pub fn update_pipeline_item_pr_status(
    app: AppHandle,
    item_id: String,
) -> Result<Option<crate::devops::pipeline::PipelineItem>, String> {
    crate::devops::orchestration::update_pipeline_item_pr_status(&app, &item_id)
}

/// Get a pipeline item by ID.
#[tauri::command]
#[specta::specta]
pub fn get_pipeline_item(
    app: AppHandle,
    item_id: String,
) -> Option<crate::devops::pipeline::PipelineItem> {
    crate::devops::orchestration::get_pipeline_item(&app, &item_id)
}

/// Find a pipeline item by issue.
#[tauri::command]
#[specta::specta]
pub fn find_pipeline_item_by_issue(
    app: AppHandle,
    repo: String,
    issue_number: u64,
) -> Option<crate::devops::pipeline::PipelineItem> {
    crate::devops::orchestration::find_pipeline_item_by_issue(&app, &repo, issue_number)
}

/// Find a pipeline item by session name.
#[tauri::command]
#[specta::specta]
pub fn find_pipeline_item_by_session(
    app: AppHandle,
    session_name: String,
) -> Option<crate::devops::pipeline::PipelineItem> {
    crate::devops::orchestration::find_pipeline_item_by_session(&app, &session_name)
}

/// Link a PR to a pipeline item.
#[tauri::command]
#[specta::specta]
pub fn link_pr_to_pipeline_item(
    app: AppHandle,
    item_id: String,
    pr_number: u64,
    work_repo: String,
) -> Result<crate::devops::pipeline::PipelineItem, String> {
    // Fetch the PR first
    let pr = github::get_pr(&work_repo, pr_number)?;
    crate::devops::orchestration::link_pr_to_pipeline_item(&app, &item_id, &pr)
}

/// Archive a completed pipeline item.
#[tauri::command]
#[specta::specta]
pub fn archive_pipeline_item(
    app: AppHandle,
    item_id: String,
) -> Result<Option<crate::devops::pipeline::PipelineItem>, String> {
    crate::devops::orchestration::archive_pipeline_item(&app, &item_id)
}

/// Remove a pipeline item (for cleanup).
#[tauri::command]
#[specta::specta]
pub fn remove_pipeline_item(
    app: AppHandle,
    item_id: String,
) -> Result<Option<crate::devops::pipeline::PipelineItem>, String> {
    crate::devops::orchestration::remove_pipeline_item(&app, &item_id)
}

/// Check all active agent sessions for PR creation.
///
/// Returns a list of PR detection results for all active sessions.
/// Each result indicates whether a PR was found and if it's newly detected.
#[tauri::command]
#[specta::specta]
pub async fn check_sessions_for_prs(app: AppHandle) -> Result<Vec<PrDetectionResult>, String> {
    crate::devops::orchestration::check_sessions_for_prs(&app).await
}
