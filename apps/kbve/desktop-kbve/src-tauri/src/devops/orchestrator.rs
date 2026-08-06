//! Agent orchestration for multi-agent workflows.
//!
//! This module coordinates the spawning and management of coding agents,
//! tying together issues, worktrees, and tmux sessions.

use serde::{Deserialize, Serialize};
use specta::Type;

use super::docker;
use super::github::{self, GitHubIssue, IssueAgentMetadata};
use super::tmux::{self, AgentMetadata, PortMapping, SandboxedAgentConfig};
use super::worktree::{self, WorktreeConfig, WorktreeCreateResult};
use std::path::Path;

/// Configuration for spawning an agent.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct SpawnConfig {
    /// Repository in owner/repo format
    pub repo: String,
    /// Issue number to work on
    pub issue_number: u64,
    /// Agent type (e.g., "claude", "gpt", "codex")
    pub agent_type: String,
    /// Optional custom session name (auto-generated if not provided)
    pub session_name: Option<String>,
    /// Optional worktree prefix
    pub worktree_prefix: Option<String>,
    /// Labels to add when agent starts working
    pub working_labels: Vec<String>,
    /// Whether to run in Docker sandbox (if available)
    #[serde(default)]
    pub use_sandbox: bool,
    /// Optional manual port mappings (host:container format, e.g., ["3000:3000", "8080:80"])
    /// If not specified, ports are auto-detected from project files
    #[serde(default)]
    pub sandbox_ports: Vec<String>,
}

/// Result of spawning an agent.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct SpawnResult {
    /// The issue being worked on
    pub issue: GitHubIssue,
    /// The created worktree
    pub worktree: WorktreeCreateResult,
    /// The tmux session name (or container name if sandboxed)
    pub session_name: String,
    /// Machine ID where agent is running
    pub machine_id: String,
    /// Whether agent is running in Docker sandbox
    #[serde(default)]
    pub is_sandboxed: bool,
    /// Container ID if sandboxed
    pub container_id: Option<String>,
}

/// Status of an active agent.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct AgentStatus {
    /// Session name
    pub session: String,
    /// Issue reference (owner/repo#number)
    pub issue_ref: Option<String>,
    /// Repository
    pub repo: Option<String>,
    /// Issue number
    pub issue_number: Option<u64>,
    /// Worktree path
    pub worktree: Option<String>,
    /// Agent type
    pub agent_type: String,
    /// Machine ID
    pub machine_id: String,
    /// Started timestamp
    pub started_at: String,
    /// Whether session is attached
    pub is_attached: bool,
    /// Whether this agent is on the current machine
    pub is_local: bool,
}

/// Result of completing agent work.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CompleteWorkResult {
    /// The created pull request
    pub pull_request: github::GitHubPullRequest,
    /// Whether the issue was updated with PR link
    pub issue_updated: bool,
    /// Whether working labels were removed
    pub labels_updated: bool,
}

/// Configuration for workflow automation.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct WorkflowConfig {
    /// Labels to remove when work is complete
    pub working_labels: Vec<String>,
    /// Labels to add when PR is created
    pub pr_labels: Vec<String>,
    /// Whether to create PR as draft
    pub draft_pr: bool,
    /// Whether to auto-close issue when PR merges
    pub close_on_merge: bool,
}

/// Get the current machine's identifier.
pub fn get_current_machine_id() -> String {
    hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|_| "unknown".to_string())
}

/// Common development ports by project type
const COMMON_PORTS: &[(u16, &str)] = &[
    (3000, "React/Next.js/Node.js"),
    (3001, "React dev server alternate"),
    (4200, "Angular"),
    (5000, "Flask/Python"),
    (5173, "Vite"),
    (5174, "Vite HMR"),
    (8000, "Django/FastAPI"),
    (8080, "Generic web server"),
    (8081, "Metro bundler (React Native)"),
    (9000, "PHP-FPM"),
    (19000, "Expo"),
    (19001, "Expo DevTools"),
    (24678, "Vite HMR WebSocket"),
];

/// Parse port mapping strings into PortMapping structs.
///
/// Accepts formats:
/// - "3000" - same port on host and container
/// - "3000:3000" - explicit host:container
/// - "8080:80" - different host and container ports
/// - "3000:3000/udp" - with protocol
fn parse_port_mappings(port_strings: &[String]) -> Vec<PortMapping> {
    let mut ports = Vec::new();

    for port_str in port_strings {
        let port_str = port_str.trim();
        if port_str.is_empty() {
            continue;
        }

        // Check for protocol suffix
        let (port_part, protocol) = if port_str.contains('/') {
            let parts: Vec<&str> = port_str.splitn(2, '/').collect();
            (parts[0], Some(parts.get(1).unwrap_or(&"tcp").to_string()))
        } else {
            (port_str, None)
        };

        // Parse host:container or just port
        if port_part.contains(':') {
            let parts: Vec<&str> = port_part.splitn(2, ':').collect();
            if let (Ok(host), Ok(container)) = (parts[0].parse::<u16>(), parts[1].parse::<u16>()) {
                ports.push(PortMapping {
                    host_port: host,
                    container_port: container,
                    protocol,
                });
            }
        } else if let Ok(port) = port_part.parse::<u16>() {
            ports.push(PortMapping {
                host_port: port,
                container_port: port,
                protocol,
            });
        }
    }

    ports
}

/// Detect common development ports based on project files.
///
/// This examines the worktree for common configuration files and
/// returns appropriate port mappings for the detected project type.
fn detect_project_ports(worktree_path: &str) -> Vec<PortMapping> {
    let path = Path::new(worktree_path);
    let mut ports = Vec::new();

    // Check for package.json (Node.js projects)
    let package_json = path.join("package.json");
    if package_json.exists() {
        if let Ok(content) = std::fs::read_to_string(&package_json) {
            // Next.js / React
            if content.contains("\"next\"") {
                ports.push(PortMapping::new(3000));
            }
            // Vite
            if content.contains("\"vite\"") {
                ports.push(PortMapping::new(5173));
                ports.push(PortMapping::new(5174)); // HMR
                ports.push(PortMapping::new(24678)); // WebSocket
            }
            // Create React App
            if content.contains("\"react-scripts\"") {
                ports.push(PortMapping::new(3000));
            }
            // Angular
            if content.contains("\"@angular/core\"") {
                ports.push(PortMapping::new(4200));
            }
            // Expo (React Native)
            if content.contains("\"expo\"") {
                ports.push(PortMapping::new(19000));
                ports.push(PortMapping::new(19001));
                ports.push(PortMapping::new(8081)); // Metro
            }
            // Generic Node.js server
            if ports.is_empty()
                && (content.contains("\"express\"")
                    || content.contains("\"fastify\"")
                    || content.contains("\"koa\""))
            {
                ports.push(PortMapping::new(3000));
            }
        }
    }

    // Check for Python projects
    let pyproject = path.join("pyproject.toml");
    let requirements = path.join("requirements.txt");
    let manage_py = path.join("manage.py");

    if manage_py.exists() {
        // Django
        ports.push(PortMapping::new(8000));
    } else if pyproject.exists() || requirements.exists() {
        // Check for FastAPI or Flask
        let check_files = [pyproject, requirements];
        for file in &check_files {
            if file.exists() {
                if let Ok(content) = std::fs::read_to_string(file) {
                    if content.contains("fastapi") || content.contains("uvicorn") {
                        ports.push(PortMapping::new(8000));
                        break;
                    }
                    if content.contains("flask") {
                        ports.push(PortMapping::new(5000));
                        break;
                    }
                }
            }
        }
    }

    // Check for Go projects
    let go_mod = path.join("go.mod");
    if go_mod.exists() {
        // Go web servers commonly use 8080
        ports.push(PortMapping::new(8080));
    }

    // Check for Rust projects with Tauri
    let cargo_toml = path.join("Cargo.toml");
    if cargo_toml.exists() {
        if let Ok(content) = std::fs::read_to_string(&cargo_toml) {
            if content.contains("tauri") {
                // Tauri typically uses Vite or another bundler
                ports.push(PortMapping::new(1420)); // Tauri dev server
                ports.push(PortMapping::new(5173)); // Vite
            }
            // Actix/Axum/Rocket web frameworks
            if content.contains("actix") || content.contains("axum") || content.contains("rocket") {
                ports.push(PortMapping::new(8080));
            }
        }
    }

    // Check for docker-compose.yml for additional ports
    let docker_compose = path.join("docker-compose.yml");
    let docker_compose_yaml = path.join("docker-compose.yaml");
    for compose_file in &[docker_compose, docker_compose_yaml] {
        if compose_file.exists() {
            if let Ok(content) = std::fs::read_to_string(compose_file) {
                // Simple regex-free port extraction (looks for "ports:" sections)
                // Format: - "3000:3000" or - 3000:3000
                for line in content.lines() {
                    let trimmed = line.trim().trim_start_matches('-').trim();
                    if trimmed.starts_with('"')
                        || trimmed.chars().next().map_or(false, |c| c.is_ascii_digit())
                    {
                        let port_str = trimmed.trim_matches('"');
                        if let Some((host, _container)) = port_str.split_once(':') {
                            if let Ok(port) = host.parse::<u16>() {
                                // Don't duplicate
                                if !ports.iter().any(|p| p.host_port == port) {
                                    ports.push(PortMapping::new(port));
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Deduplicate
    let mut seen = std::collections::HashSet::new();
    ports.retain(|p| seen.insert(p.host_port));

    log::info!(
        "Detected {} ports for project at {}: {:?}",
        ports.len(),
        worktree_path,
        ports.iter().map(|p| p.host_port).collect::<Vec<_>>()
    );

    ports
}

/// Spawn a new agent to work on an issue.
///
/// This creates a worktree and a tmux session. If sandbox mode is enabled
/// and Docker is available, the agent runs inside a Docker container
/// within the tmux session (allowing attach/detach and visibility).
pub fn spawn_agent(config: &SpawnConfig, repo_path: &str) -> Result<SpawnResult, String> {
    // 1. Fetch the issue to ensure it exists
    let issue = github::get_issue(&config.repo, config.issue_number)?;

    // 2. Generate session name if not provided
    let session_name = config.session_name.clone().unwrap_or_else(|| {
        format!(
            "handy-issue-{}-{}",
            config.issue_number,
            chrono::Utc::now().timestamp()
        )
    });

    // 3. Create worktree for isolated work
    let worktree_name = format!("issue-{}", config.issue_number);
    let worktree_config = WorktreeConfig {
        prefix: config.worktree_prefix.clone().unwrap_or_default(),
        base_path: None,
        delete_branch_on_merge: true,
    };
    let worktree = worktree::create_worktree(repo_path, &worktree_name, &worktree_config, None)?;

    // 4. Get machine ID
    let machine_id = hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|_| "unknown".to_string());

    // 5. Create tmux session (always - for both sandboxed and non-sandboxed)
    let metadata = AgentMetadata {
        session: session_name.clone(),
        issue_ref: Some(format!("{}#{}", config.repo, config.issue_number)),
        repo: Some(config.repo.clone()),
        worktree: Some(worktree.path.clone()),
        agent_type: config.agent_type.clone(),
        machine_id: machine_id.clone(),
        started_at: chrono::Utc::now().to_rfc3339(),
    };
    tmux::create_session(&session_name, Some(&worktree.path), &metadata)?;

    // 6. Start agent in the tmux session (sandboxed or direct)
    let is_sandboxed = config.use_sandbox && docker::is_docker_available();

    if is_sandboxed {
        // Sandbox mode: run agent inside Docker container within tmux
        // Use manual ports if provided, otherwise auto-detect from project files
        let ports = if !config.sandbox_ports.is_empty() {
            parse_port_mappings(&config.sandbox_ports)
        } else {
            detect_project_ports(&worktree.path)
        };

        let sandbox_config = SandboxedAgentConfig {
            worktree_path: worktree.path.clone(),
            memory_limit: Some("4g".to_string()),
            cpu_limit: Some("2".to_string()),
            auto_accept: true, // Safe in sandbox
            ports,
            auto_detect_ports: config.sandbox_ports.is_empty(),
            use_agent_network: true, // Enable inter-container communication
            remap_ports: true,       // Avoid port conflicts between agents
        };

        tmux::start_sandboxed_agent_in_session(
            &session_name,
            &config.agent_type,
            &config.repo,
            config.issue_number,
            Some(&issue.title),
            &sandbox_config,
        )?;
    } else {
        // Direct mode: run agent directly in tmux
        tmux::start_agent_in_session(
            &session_name,
            &config.agent_type,
            &config.repo,
            config.issue_number,
            Some(&issue.title),
        )?;
    }

    // 7. Add agent metadata comment to the issue
    let issue_metadata = IssueAgentMetadata {
        session: session_name.clone(),
        machine_id: machine_id.clone(),
        worktree: Some(worktree.path.clone()),
        agent_type: config.agent_type.clone(),
        started_at: chrono::Utc::now().to_rfc3339(),
        status: if is_sandboxed {
            "working (sandboxed)".to_string()
        } else {
            "working".to_string()
        },
    };
    github::add_agent_metadata_comment(&config.repo, config.issue_number, &issue_metadata)?;

    // 8. Add working labels to the issue
    if !config.working_labels.is_empty() {
        let labels_refs: Vec<&str> = config.working_labels.iter().map(|s| s.as_str()).collect();
        github::update_labels(&config.repo, config.issue_number, labels_refs, vec![])?;
    }

    Ok(SpawnResult {
        issue,
        worktree,
        session_name,
        machine_id,
        is_sandboxed,
        container_id: None, // Container is managed by tmux session now
    })
}

/// Get status of all active agents.
pub fn list_agent_statuses() -> Result<Vec<AgentStatus>, String> {
    // list_sessions() returns error if tmux isn't running, treat as empty list
    let sessions = tmux::list_sessions().unwrap_or_else(|_| vec![]);
    let current_machine = get_current_machine_id();
    let mut statuses = Vec::new();

    for session in sessions {
        // Try to get metadata for each session
        let metadata = tmux::get_session_metadata(&session.name).ok();

        let agent_machine_id = metadata
            .as_ref()
            .map(|m| m.machine_id.clone())
            .unwrap_or_else(|| "unknown".to_string());

        let status = AgentStatus {
            session: session.name.clone(),
            issue_ref: metadata.as_ref().and_then(|m| m.issue_ref.clone()),
            repo: metadata.as_ref().and_then(|m| m.repo.clone()),
            issue_number: metadata.as_ref().and_then(|m| {
                m.issue_ref
                    .as_ref()
                    .and_then(|r| r.split('#').last().and_then(|n| n.parse().ok()))
            }),
            worktree: metadata.as_ref().and_then(|m| m.worktree.clone()),
            agent_type: metadata
                .as_ref()
                .map(|m| m.agent_type.clone())
                .unwrap_or_else(|| "unknown".to_string()),
            machine_id: agent_machine_id.clone(),
            started_at: metadata
                .as_ref()
                .map(|m| m.started_at.clone())
                .unwrap_or_else(|| "unknown".to_string()),
            is_attached: session.attached,
            is_local: agent_machine_id == current_machine,
        };

        statuses.push(status);
    }

    Ok(statuses)
}

/// Get status of agents on the current machine only.
pub fn list_local_agent_statuses() -> Result<Vec<AgentStatus>, String> {
    let all_statuses = list_agent_statuses()?;
    Ok(all_statuses.into_iter().filter(|s| s.is_local).collect())
}

/// Get status of agents from other machines (potentially orphaned).
pub fn list_remote_agent_statuses() -> Result<Vec<AgentStatus>, String> {
    let all_statuses = list_agent_statuses()?;
    Ok(all_statuses.into_iter().filter(|s| !s.is_local).collect())
}

/// Clean up an agent's resources after work is complete.
///
/// This kills the tmux session and optionally removes the worktree.
pub fn cleanup_agent(
    session_name: &str,
    repo_path: &str,
    remove_worktree: bool,
    delete_branch: bool,
) -> Result<(), String> {
    // Get session metadata to find the worktree
    let metadata = tmux::get_session_metadata(session_name).ok();

    // Kill the tmux session
    tmux::kill_session(session_name)?;

    // Remove worktree if requested
    if remove_worktree {
        if let Some(ref meta) = metadata {
            if let Some(ref worktree_path) = meta.worktree {
                worktree::remove_worktree(repo_path, worktree_path, true, delete_branch)?;
            }
        }
    }

    Ok(())
}

/// Create a PR from an agent's work.
pub fn create_pr_from_agent(
    session_name: &str,
    title: &str,
    body: Option<&str>,
    draft: bool,
) -> Result<github::GitHubPullRequest, String> {
    // Get session metadata
    let metadata = tmux::get_session_metadata(session_name)?;

    let repo = metadata
        .repo
        .ok_or("Session has no associated repository")?;
    let worktree_path = metadata
        .worktree
        .ok_or("Session has no associated worktree")?;

    // Get worktree info to find the branch
    let worktree_info = worktree::get_worktree_info(&worktree_path, &worktree_path)?;
    let branch = worktree_info.branch.ok_or("Worktree has no branch")?;

    // Get default branch for base
    let default_branch = worktree::get_default_branch(&worktree_path)?;

    // Create PR
    github::create_pr(&repo, title, body, &default_branch, Some(&branch), draft)
}

/// Complete an agent's work by creating a PR and updating the issue.
///
/// This is the main workflow automation function that:
/// 1. Creates a PR from the agent's branch
/// 2. Updates the issue with a link to the PR
/// 3. Updates labels (removes working labels, adds PR labels)
/// 4. Adds a completion comment to the issue
pub fn complete_agent_work(
    session_name: &str,
    pr_title: &str,
    pr_body: Option<&str>,
    workflow_config: &WorkflowConfig,
) -> Result<CompleteWorkResult, String> {
    // Get session metadata
    let metadata = tmux::get_session_metadata(session_name)?;

    let repo = metadata
        .repo
        .clone()
        .ok_or("Session has no associated repository")?;
    let worktree_path = metadata
        .worktree
        .clone()
        .ok_or("Session has no associated worktree")?;
    let issue_ref = metadata.issue_ref.clone();

    // Extract issue number from issue_ref (format: owner/repo#number)
    let issue_number = issue_ref
        .as_ref()
        .and_then(|r| r.split('#').last())
        .and_then(|n| n.parse::<u64>().ok());

    // Get worktree info to find the branch
    let worktree_info = worktree::get_worktree_info(&worktree_path, &worktree_path)?;
    let branch = worktree_info.branch.ok_or("Worktree has no branch")?;

    // Get default branch for base
    let default_branch = worktree::get_default_branch(&worktree_path)?;

    // Build PR body with issue reference if available
    let full_pr_body = if let Some(num) = issue_number {
        let issue_link = format!("\n\nCloses #{}", num);
        match pr_body {
            Some(body) => format!("{}{}", body, issue_link),
            None => format!("Automated PR for issue #{}{}", num, issue_link),
        }
    } else {
        pr_body.map(|s| s.to_string()).unwrap_or_default()
    };

    // 1. Create PR
    let pull_request = github::create_pr(
        &repo,
        pr_title,
        Some(&full_pr_body),
        &default_branch,
        Some(&branch),
        workflow_config.draft_pr,
    )?;

    let mut issue_updated = false;
    let mut labels_updated = false;

    // 2. Update issue with PR link and labels
    if let Some(num) = issue_number {
        // Add comment linking to the PR
        let comment = format!(
            "🤖 **Agent Work Complete**\n\n\
            Pull request created: #{}\n\n\
            **Session:** `{}`\n\
            **Machine:** `{}`\n\
            **Branch:** `{}`",
            pull_request.number, session_name, metadata.machine_id, branch
        );
        if github::add_comment(&repo, num, &comment).is_ok() {
            issue_updated = true;
        }

        // Update labels
        let add_labels: Vec<&str> = workflow_config
            .pr_labels
            .iter()
            .map(|s| s.as_str())
            .collect();
        let remove_labels: Vec<&str> = workflow_config
            .working_labels
            .iter()
            .map(|s| s.as_str())
            .collect();

        if !add_labels.is_empty() || !remove_labels.is_empty() {
            if github::update_labels(&repo, num, add_labels, remove_labels).is_ok() {
                labels_updated = true;
            }
        }
    }

    Ok(CompleteWorkResult {
        pull_request,
        issue_updated,
        labels_updated,
    })
}

/// Check if a PR has been merged and cleanup if so.
///
/// Returns true if cleanup was performed.
pub fn check_and_cleanup_merged_pr(
    session_name: &str,
    repo_path: &str,
    pr_number: u64,
) -> Result<bool, String> {
    // Get session metadata
    let metadata = tmux::get_session_metadata(session_name)?;
    let repo = metadata
        .repo
        .clone()
        .ok_or("Session has no associated repository")?;

    // Check PR status
    let pr_status = github::get_pr_status(&repo, pr_number)?;

    // Check if PR state indicates it was merged
    if pr_status.pr.state == "merged" {
        // PR is merged, cleanup the agent
        cleanup_agent(session_name, repo_path, true, true)?;

        // Update issue if linked
        if let Some(issue_ref) = &metadata.issue_ref {
            if let Some(issue_num) = issue_ref
                .split('#')
                .last()
                .and_then(|n| n.parse::<u64>().ok())
            {
                let comment = format!(
                    "✅ **PR Merged & Cleanup Complete**\n\n\
                    The pull request #{} has been merged.\n\
                    Agent session `{}` and worktree have been cleaned up.",
                    pr_number, session_name
                );
                let _ = github::add_comment(&repo, issue_num, &comment);
            }
        }

        Ok(true)
    } else {
        Ok(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_spawn_config_default_session_name() {
        let config = SpawnConfig {
            repo: "KBVE/kbve".to_string(),
            issue_number: 123,
            agent_type: "claude".to_string(),
            session_name: None,
            worktree_prefix: None,
            working_labels: vec![],
            use_sandbox: false,
            sandbox_ports: vec![],
        };
        assert!(config.session_name.is_none());
    }

    #[test]
    fn test_parse_port_mappings() {
        // Simple port
        let ports = parse_port_mappings(&["3000".to_string()]);
        assert_eq!(ports.len(), 1);
        assert_eq!(ports[0].host_port, 3000);
        assert_eq!(ports[0].container_port, 3000);

        // Host:container
        let ports = parse_port_mappings(&["8080:80".to_string()]);
        assert_eq!(ports.len(), 1);
        assert_eq!(ports[0].host_port, 8080);
        assert_eq!(ports[0].container_port, 80);

        // With protocol
        let ports = parse_port_mappings(&["53:53/udp".to_string()]);
        assert_eq!(ports.len(), 1);
        assert_eq!(ports[0].protocol, Some("udp".to_string()));

        // Multiple
        let ports = parse_port_mappings(&[
            "3000".to_string(),
            "8080:80".to_string(),
            "5432:5432".to_string(),
        ]);
        assert_eq!(ports.len(), 3);
    }
}
