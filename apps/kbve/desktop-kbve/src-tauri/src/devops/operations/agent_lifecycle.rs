//! Agent lifecycle operations: spawn, complete, cleanup.

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::devops::{github, tmux, worktree};

/// Configuration for spawning an agent from a GitHub issue
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct SpawnAgentConfig {
    /// Issue reference (e.g., "org/Handy#101")
    pub issue_ref: String,
    /// Override agent type (if not specified in issue body)
    pub agent_type: Option<String>,
    /// Custom session name (if not auto-generated)
    pub session_name: Option<String>,
    /// Work repository (where code lives and agent works)
    /// If None, extracts from issue body or uses issue_ref repo
    pub work_repo: Option<String>,
}

/// Result of spawning an agent
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct AgentSpawnResult {
    /// tmux session name
    pub session: String,
    /// Issue number
    pub issue_number: u32,
    /// Worktree path
    pub worktree: String,
    /// Agent type used
    pub agent_type: String,
    /// Agent metadata
    pub metadata: tmux::AgentMetadata,
}

/// Result of completing agent work
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct AgentCompletionResult {
    /// PR URL
    pub pr_url: String,
    /// Issue number
    pub issue_number: u32,
    /// Session name
    pub session: String,
    /// Status
    pub status: String,
}

/// Result of PR detection for an agent session
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct PrDetectionResult {
    /// tmux session name
    pub session: String,
    /// Issue number the agent is working on
    pub issue_number: u32,
    /// Repository (org/repo format)
    pub repo: String,
    /// PR URL if found
    pub pr_url: Option<String>,
    /// PR number if found
    pub pr_number: Option<u64>,
    /// Branch name that was checked
    pub branch_name: String,
    /// Whether this is a newly detected PR (first time seeing it)
    pub is_new: bool,
}

/// Spawn an agent for a GitHub issue
///
/// This function:
/// 1. Fetches the issue from GitHub
/// 2. Extracts agent type and epic reference
/// 3. Creates a git worktree
/// 4. Creates a tmux session
/// 5. Sets metadata in tmux env vars
/// 6. Posts metadata comment to GitHub
/// 7. Adds "agent-assigned" label
pub async fn spawn_agent_from_issue(config: SpawnAgentConfig) -> Result<AgentSpawnResult, String> {
    // Parse issue reference
    let (repo, issue_number) = parse_issue_ref(&config.issue_ref)?;

    // Fetch issue from GitHub
    let issue = github::get_issue_async(&repo, issue_number).await?;

    // Extract agent type from issue body or use override
    let issue_body = issue.body.as_deref().unwrap_or("");
    let agent_type = config
        .agent_type
        .or_else(|| extract_agent_type(issue_body))
        .ok_or_else(|| {
            "Agent type not specified in config or issue body. \
             Add '**Agent Type**: <type>' to issue or provide agent_type in config"
                .to_string()
        })?;

    // Extract epic reference from issue body (optional)
    let epic_ref = extract_epic_ref(issue_body);

    // Extract work_repo from config, issue body, or default to issue_ref repo
    let work_repo = config
        .work_repo
        .or_else(|| extract_work_repo(issue_body))
        .unwrap_or_else(|| repo.clone());

    // Generate session name
    let session_name = config
        .session_name
        .unwrap_or_else(|| format!("handy-agent-{}", issue_number));

    // Get repo path from current directory
    // NOTE: This assumes we're running from the work_repo directory
    // In the future, we may want to clone work_repo if it's different from tracking repo
    let repo_path = std::env::current_dir().map_err(|e| e.to_string())?;

    // Create worktree (blocking operation)
    let branch_name = format!("issue-{}", issue_number);
    let repo_path_str = repo_path.to_string_lossy().to_string();
    let worktree_result = tokio::task::spawn_blocking({
        let repo_path = repo_path_str.clone();
        let branch_name = branch_name.clone();
        move || {
            let config = worktree::WorktreeConfig::default();
            worktree::create_worktree(&repo_path, &branch_name, &config, None)
        }
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
    .map_err(|e| format!("Failed to create worktree: {}", e))?;

    let worktree_path = worktree_result.path.clone();

    // Build metadata
    let machine_id = get_machine_id()?;
    let metadata = tmux::AgentMetadata {
        session: session_name.clone(),
        issue_ref: Some(config.issue_ref.clone()),
        repo: Some(repo.clone()),
        worktree: Some(worktree_path.clone()),
        agent_type: agent_type.clone(),
        machine_id: machine_id.clone(),
        started_at: chrono::Utc::now().to_rfc3339(),
    };

    // Create tmux session in the worktree (blocking operation)
    tokio::task::spawn_blocking({
        let session_name = session_name.clone();
        let worktree_path = worktree_path.clone();
        let metadata = metadata.clone();
        move || tmux::create_session(&session_name, Some(&worktree_path), &metadata)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
    .map_err(|e| format!("Failed to create tmux session: {}", e))?;

    // Start the agent in the tmux session (blocking operation)
    let issue_title_for_agent = issue.title.clone();
    tokio::task::spawn_blocking({
        let session_name = session_name.clone();
        let agent_type = agent_type.clone();
        let repo = repo.clone();
        move || {
            tmux::start_agent_in_session(
                &session_name,
                &agent_type,
                &repo,
                issue_number as u64,
                Some(&issue_title_for_agent),
            )
        }
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
    .map_err(|e| format!("Failed to start agent in session: {}", e))?;

    // Post metadata comment to GitHub
    let comment_body = format_agent_metadata_comment(&metadata, &issue.title, epic_ref.as_deref());
    github::add_issue_comment_async(&repo, issue_number, &comment_body)
        .await
        .map_err(|e| format!("Failed to add GitHub comment: {}", e))?;

    // Add "agent-assigned" label
    github::add_labels_async(&repo, issue_number, &vec!["agent-assigned".to_string()])
        .await
        .map_err(|e| format!("Failed to add labels: {}", e))?;

    Ok(AgentSpawnResult {
        session: session_name,
        issue_number,
        worktree: worktree_path,
        agent_type,
        metadata,
    })
}

/// Complete agent work by creating a PR
///
/// This function:
/// 1. Gets agent status from tmux
/// 2. Pushes the branch to remote
/// 3. Creates a PR via GitHub CLI
/// 4. Adds labels to PR
/// 5. Comments on issue with PR link
/// 6. Updates epic progress if applicable
pub async fn complete_agent_work(
    session: String,
    pr_title: Option<String>,
) -> Result<AgentCompletionResult, String> {
    // Get agent metadata from tmux (blocking operation)
    let metadata = tokio::task::spawn_blocking({
        let session = session.clone();
        move || tmux::get_session_metadata(&session)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
    .map_err(|e| format!("Failed to get session metadata: {}", e))?;

    // Clone values from metadata that we'll use later
    let issue_ref = metadata
        .issue_ref
        .as_ref()
        .ok_or_else(|| "Agent has no issue reference".to_string())?
        .clone();
    let worktree_path = metadata
        .worktree
        .as_ref()
        .ok_or_else(|| "Agent has no worktree path".to_string())?
        .clone();

    let (repo, issue_number) = parse_issue_ref(&issue_ref)?;

    // Get issue details
    let issue = github::get_issue_async(&repo, issue_number).await?;

    let branch_name = format!("issue-{}", issue_number);

    // Push branch (blocking operation)
    tokio::task::spawn_blocking({
        let worktree_path = worktree_path.clone();
        let branch_name = branch_name.clone();
        move || push_branch(&worktree_path, &branch_name)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
    .map_err(|e| format!("Failed to push branch: {}", e))?;

    // Create PR
    let pr_title = pr_title.unwrap_or_else(|| issue.title.clone());
    let pr_body = format_pr_body(&issue.title, issue_number, &metadata);

    let pr_url = github::create_pr_async(&repo, &pr_title, &pr_body, "main", &branch_name)
        .await
        .map_err(|e| format!("Failed to create PR: {}", e))?;

    // Add labels to PR
    github::add_pr_labels_async(&repo, &pr_url, vec!["agent-created".to_string()])
        .await
        .ok(); // Non-critical, continue even if fails

    // Comment on issue
    let completion_comment = format!(
        "✅ **Work Complete**\n\nPR created: {}\n\nAgent `{}` has finished implementation.",
        pr_url, session
    );
    github::add_issue_comment_async(&repo, issue_number, &completion_comment)
        .await
        .ok(); // Non-critical

    // Update epic progress if epic exists
    // Epic ref is stored in GitHub comment metadata, would need to parse from issue comments
    // For now, skip this feature - will implement when adding epic tracking

    Ok(AgentCompletionResult {
        pr_url,
        issue_number,
        session,
        status: "completed".to_string(),
    })
}

/// Detect if a PR exists for an agent's branch
///
/// This function:
/// 1. Gets agent metadata from the tmux session
/// 2. Extracts the issue number to determine the branch name (issue-{number})
/// 3. Queries GitHub for PRs with that head branch
/// 4. Returns PR info if found
pub async fn detect_pr_for_agent(session: &str) -> Result<Option<PrDetectionResult>, String> {
    // Get agent metadata from tmux (blocking operation)
    let metadata = tokio::task::spawn_blocking({
        let session = session.to_string();
        move || tmux::get_session_metadata(&session)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
    .map_err(|e| format!("Failed to get session metadata: {}", e))?;

    // Get issue reference from metadata
    let issue_ref = metadata
        .issue_ref
        .as_ref()
        .ok_or_else(|| "Agent has no issue reference".to_string())?;

    let (repo, issue_number) = parse_issue_ref(issue_ref)?;

    // Branch name follows our convention: issue-{number}
    let branch_name = format!("issue-{}", issue_number);

    // Check GitHub for a PR with this branch
    let pr = github::find_pr_by_branch_async(&repo, &branch_name).await?;

    match pr {
        Some(pr_info) => Ok(Some(PrDetectionResult {
            session: session.to_string(),
            issue_number,
            repo,
            pr_url: Some(pr_info.url),
            pr_number: Some(pr_info.number),
            branch_name,
            is_new: false, // Caller will determine if it's new
        })),
        None => Ok(Some(PrDetectionResult {
            session: session.to_string(),
            issue_number,
            repo,
            pr_url: None,
            pr_number: None,
            branch_name,
            is_new: false,
        })),
    }
}

/// Parse issue reference like "org/repo#123" into (repo, number)
fn parse_issue_ref(issue_ref: &str) -> Result<(String, u32), String> {
    let parts: Vec<&str> = issue_ref.split('#').collect();
    if parts.len() != 2 {
        return Err(format!(
            "Invalid issue reference: {}. Expected format: org/repo#123",
            issue_ref
        ));
    }

    let repo = parts[0].to_string();
    let number = parts[1]
        .parse::<u32>()
        .map_err(|_| format!("Invalid issue number: {}", parts[1]))?;

    Ok((repo, number))
}

/// Extract agent type from issue body
/// Looks for pattern: "**Agent Type**: <type>"
fn extract_agent_type(issue_body: &str) -> Option<String> {
    let re = regex::Regex::new(r"\*\*Agent Type\*\*:\s*(\w+)").ok()?;
    re.captures(issue_body)?
        .get(1)
        .map(|m| m.as_str().to_string())
}

/// Extract epic reference from issue body
/// Looks for pattern: "**Epic**: #<number>"
fn extract_epic_ref(issue_body: &str) -> Option<String> {
    let re = regex::Regex::new(r"\*\*Epic\*\*:\s*#(\d+)").ok()?;
    re.captures(issue_body)?
        .get(1)
        .map(|m| format!("#{}", m.as_str()))
}

/// Extract work repository from issue body
/// Looks for pattern: "**Work Repository**: <org/repo>"
fn extract_work_repo(issue_body: &str) -> Option<String> {
    let re = regex::Regex::new(r"\*\*Work Repository\*\*:\s*([\w-]+/[\w-]+)").ok()?;
    re.captures(issue_body)?
        .get(1)
        .map(|m| m.as_str().to_string())
}

/// Get machine ID (hostname)
fn get_machine_id() -> Result<String, String> {
    hostname::get()
        .map_err(|e| format!("Failed to get hostname: {}", e))?
        .to_string_lossy()
        .to_string()
        .pipe(Ok)
}

/// Format agent metadata comment for GitHub
fn format_agent_metadata_comment(
    metadata: &tmux::AgentMetadata,
    issue_title: &str,
    epic_ref: Option<&str>,
) -> String {
    let metadata_json = serde_json::to_string_pretty(metadata).unwrap_or_else(|_| "{}".to_string());

    let epic_line = if let Some(epic) = epic_ref {
        format!("- **Epic**: {}\n", epic)
    } else {
        String::new()
    };

    format!(
        r#"<!-- HANDY_AGENT_METADATA
{}
-->

🤖 **Agent Assigned**
- **Session**: `{}`
- **Type**: {}
- **Worktree**: `{}`
- **Machine**: {}
{}- **Started**: {}

Agent is now working on: {}

Will update with progress.
"#,
        metadata_json,
        metadata.session,
        metadata.agent_type,
        metadata
            .worktree
            .as_ref()
            .and_then(|w| w.split('/').last())
            .unwrap_or("unknown"),
        metadata.machine_id,
        epic_line,
        metadata.started_at,
        issue_title,
    )
}

/// Format PR body with standard template
fn format_pr_body(issue_title: &str, issue_number: u32, metadata: &tmux::AgentMetadata) -> String {
    format!(
        r#"## Summary
{}

## Changes
Implementation of #{} via DevOps agent.

## Testing
```bash
# Run tests to verify changes
cargo test  # For Rust
bun run test  # For TypeScript
```

## Related Issues
Closes #{}

---

🤖 Generated by {} agent `{}`
"#,
        issue_title, issue_number, issue_number, metadata.agent_type, metadata.session,
    )
}

/// Push git branch to remote
fn push_branch(worktree_path: &str, branch_name: &str) -> Result<(), String> {
    use std::process::Command;

    let output = Command::new("git")
        .args(&["push", "-u", "origin", branch_name])
        .current_dir(worktree_path)
        .output()
        .map_err(|e| format!("Failed to execute git push: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "git push failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok(())
}

/// Configuration for spawning a support worker agent for a specific task
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct SupportWorkerConfig {
    /// Repository in org/repo format
    pub repo: String,
    /// Issue number the work relates to (for tracking)
    pub issue_number: u32,
    /// PR number to work on (for merge tasks)
    pub pr_number: Option<u64>,
    /// The task description for the agent
    pub task: String,
    /// Task type (merge, review, etc.)
    pub task_type: String,
    /// Merge method if this is a merge task
    pub merge_method: Option<String>,
    /// Whether to delete the branch after merging
    pub delete_branch: bool,
    /// Whether to run in a sandboxed Docker container
    pub sandboxed: bool,
    /// Worktree path (required for sandboxed execution to resolve merge conflicts)
    pub worktree_path: Option<String>,
}

/// Result of spawning a support worker
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct SupportWorkerResult {
    /// tmux session name
    pub session: String,
    /// Issue number
    pub issue_number: u32,
    /// PR number if applicable
    pub pr_number: Option<u64>,
    /// Task type
    pub task_type: String,
    /// Status of the spawn
    pub status: String,
}

/// Spawn a support worker agent to handle a specific task
///
/// Support workers are lightweight agents that handle specific tasks like:
/// - Merging PRs after review
/// - Running CI checks
/// - Updating issue labels
///
/// When `sandboxed` is true and a `worktree_path` is provided, the support worker
/// runs inside a Docker container with the worktree mounted, allowing it to
/// resolve merge conflicts locally.
pub async fn spawn_support_worker(
    config: SupportWorkerConfig,
) -> Result<SupportWorkerResult, String> {
    let session_name = format!("handy-support-{}-{}", config.task_type, config.issue_number);

    // Get machine ID
    let machine_id = get_machine_id()?;

    // Build metadata for the support worker session
    let metadata = tmux::AgentMetadata {
        session: session_name.clone(),
        issue_ref: Some(format!("{}#{}", config.repo, config.issue_number)),
        repo: Some(config.repo.clone()),
        worktree: config.worktree_path.clone(),
        agent_type: format!("support-{}", config.task_type),
        machine_id: machine_id.clone(),
        started_at: chrono::Utc::now().to_rfc3339(),
    };

    // Determine working directory:
    // - If sandboxed with worktree, use worktree path (will be mounted in container)
    // - Otherwise, use home directory
    let working_dir = if config.sandboxed {
        config.worktree_path.clone().ok_or_else(|| {
            "Worktree path required for sandboxed support worker execution".to_string()
        })?
    } else {
        std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string())
    };

    // Create tmux session
    tokio::task::spawn_blocking({
        let session_name = session_name.clone();
        let metadata = metadata.clone();
        let working_dir = working_dir.clone();
        move || tmux::create_session(&session_name, Some(&working_dir), &metadata)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
    .map_err(|e| format!("Failed to create tmux session: {}", e))?;

    // Build the inner command based on task type
    // Pass sandboxed flag so we can add --dangerously-skip-permissions in sandbox
    let inner_command = build_support_worker_command(&config, config.sandboxed)?;

    // If sandboxed, wrap the command in a Docker container
    let command = if config.sandboxed {
        let worktree_path = config.worktree_path.as_ref().ok_or_else(|| {
            "Worktree path required for sandboxed support worker execution".to_string()
        })?;

        build_sandboxed_support_worker_command(
            &inner_command,
            worktree_path,
            &config.repo,
            config.issue_number,
        )?
    } else {
        inner_command
    };

    // Send the command to the tmux session
    tokio::task::spawn_blocking({
        let session_name = session_name.clone();
        move || tmux::send_command(&session_name, &command)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
    .map_err(|e| format!("Failed to start support worker: {}", e))?;

    // Post comment to issue about support worker activity
    let sandbox_note = if config.sandboxed { " (sandboxed)" } else { "" };
    let comment = format!(
        "🔧 **Support Worker Spawned**{}\n\n\
        - **Task**: {}\n\
        - **Session**: `{}`\n\
        - **PR**: #{}\n\
        - **Machine**: {}\n\n\
        Support worker is handling this task.",
        sandbox_note,
        config.task_type,
        session_name,
        config.pr_number.unwrap_or(0),
        machine_id
    );
    github::add_issue_comment_async(&config.repo, config.issue_number, &comment)
        .await
        .ok(); // Non-critical

    Ok(SupportWorkerResult {
        session: session_name,
        issue_number: config.issue_number,
        pr_number: config.pr_number,
        task_type: config.task_type,
        status: "spawned".to_string(),
    })
}

/// Build the inner command for a support worker based on task type
///
/// When `sandboxed` is true, adds `--dangerously-skip-permissions` flag since
/// the Docker container provides isolation and we want fully autonomous execution.
fn build_support_worker_command(
    config: &SupportWorkerConfig,
    sandboxed: bool,
) -> Result<String, String> {
    // In sandbox mode, use --dangerously-skip-permissions for autonomous execution
    let auto_flag = if sandboxed {
        " --dangerously-skip-permissions"
    } else {
        ""
    };

    match config.task_type.as_str() {
        "merge" => {
            // Build gh pr merge command with Claude for conflict resolution
            let merge_method = config.merge_method.as_deref().unwrap_or("squash");
            let pr_number = config
                .pr_number
                .ok_or("PR number required for merge task")?;
            let delete_flag = if config.delete_branch {
                " --delete-branch"
            } else {
                ""
            };

            // Use Claude to handle the merge, including conflict resolution if needed
            Ok(format!(
                r#"claude{auto_flag} "You are a Support Worker agent tasked with merging PR #{pr_number} in {repo}.

Your task:
1. First, view the PR details: gh pr view {pr_number} --repo {repo}
2. Check PR status and CI: gh pr checks {pr_number} --repo {repo}
3. Attempt to merge the PR: gh pr merge {pr_number} --repo {repo} --{merge_method}{delete_flag}

If the merge fails due to merge conflicts:
1. Checkout the PR branch locally
2. Pull the latest main branch
3. Merge main into the PR branch
4. Resolve any conflicts by examining the code and making intelligent decisions
5. Commit the resolved conflicts
6. Push the updated branch
7. Retry the merge

If CI checks are failing, analyze the failures and determine if they are blocking. Report back with what you find.

Start by viewing the PR and attempting the merge.""#,
                auto_flag = auto_flag,
                pr_number = pr_number,
                repo = config.repo,
                merge_method = merge_method,
                delete_flag = delete_flag,
            ))
        }
        "review" => {
            let pr_number = config
                .pr_number
                .ok_or("PR number required for review task")?;
            Ok(format!(
                r#"claude{} "Review the PR #{} in {} and provide feedback. Check the diff, look for issues, and approve or request changes." --repo {}"#,
                auto_flag, pr_number, config.repo, config.repo
            ))
        }
        _ => {
            // Generic task - let Claude handle it
            Ok(format!(
                r#"claude{} "{}""#,
                auto_flag,
                config.task.replace('"', "\\\"")
            ))
        }
    }
}

/// Build a Docker command that runs the support worker inside a container
///
/// This wraps the support worker command in a Docker container with:
/// - The worktree mounted at /workspace
/// - GitHub and Anthropic credentials passed from host auth configs
/// - Resource limits applied
/// - A non-root user (required for --dangerously-skip-permissions)
fn build_sandboxed_support_worker_command(
    inner_command: &str,
    worktree_path: &str,
    repo: &str,
    issue_number: u32,
) -> Result<String, String> {
    use crate::devops::docker::{container_exists_for_issue, stop_and_remove_container};

    let container_name = format!("handy-support-sandbox-{}", issue_number);
    let image = "node:20-bookworm"; // Base image with Node.js for Claude Code

    // Pre-check: Remove any existing container with this issue number to avoid conflicts
    // This handles both regular sandbox and support-sandbox containers
    if let Some(existing) = container_exists_for_issue(issue_number) {
        log::warn!(
            "Found existing container {} for issue #{}, removing before spawning support worker",
            existing,
            issue_number
        );
        if let Err(e) = stop_and_remove_container(&existing) {
            log::warn!("Failed to remove existing container: {}", e);
            // Continue anyway - docker run will fail if container exists
        }
    }

    let mut docker_args = vec![
        "docker run --rm -it".to_string(),
        format!("--name {}", container_name),
        format!("-v {}:/workspace", worktree_path),
        "-w /workspace".to_string(),
    ];

    // Mount the persistent Claude auth volume
    // This volume contains credentials from the one-time auth setup container
    docker_args.push(format!(
        "-v {}:/tmp/claude-auth:ro",
        crate::devops::docker::get_claude_auth_volume_name()
    ));

    // Mount GitHub CLI auth from host (if available) - gh tokens work fine from host
    if let Ok(home) = std::env::var("HOME") {
        let gh_dir = format!("{}/.config/gh", home);
        if std::path::Path::new(&gh_dir).exists() {
            docker_args.push(format!("-v {}:/tmp/host-auth/.config/gh:ro", gh_dir));
        }
    }

    // Pass through credentials from host environment (fallback)
    docker_args.push("-e GH_TOKEN".to_string());
    docker_args.push("-e GITHUB_TOKEN".to_string());

    // Add context env vars
    docker_args.push(format!("-e HANDY_ISSUE_REF={}#{}", repo, issue_number));
    docker_args.push("-e HANDY_AGENT_TYPE=support-worker".to_string());
    docker_args.push(format!("-e HANDY_CONTAINER_NAME={}", container_name));

    // Add image
    docker_args.push(image.to_string());
    docker_args.push("sh -c".to_string());

    // Build the setup script that:
    // 1. Uses the 'node' user if it exists (common in node:* images), otherwise creates 'agent' user
    // 2. Copies auth from persistent volume to the user's home
    // 3. Installs Claude Code globally
    // 4. Uses gosu to exec as the non-root user (completely replacing the process)
    //
    // We need to run as non-root because Claude Code's --dangerously-skip-permissions
    // flag refuses to run with root/sudo privileges for security reasons.
    //
    // NOTE: On macOS with Docker Desktop/OrbStack, mounted volumes may appear as root-owned,
    // so we can't rely on workspace UID detection. We always use a non-root user.
    //
    // IMPORTANT: We use `exec gosu` to completely replace the shell process with
    // the non-root user's process. This ensures Claude Code sees a clean non-root
    // environment without any sudo/su context in the process tree.
    let setup_script = format!(
        r#"
set -e

# Always use a non-root user for Claude Code
# On macOS with Docker Desktop/OrbStack, mounted volumes may appear as root-owned,
# so we can't rely on workspace UID detection.

# Check if 'node' user exists (common in node:* images) and use it
# Otherwise create an 'agent' user
if id "node" &>/dev/null; then
    AGENT_USER="node"
    AGENT_HOME=$(getent passwd "node" | cut -d: -f6)
    echo "Using existing 'node' user"
else
    AGENT_USER="agent"
    AGENT_HOME="/home/agent"

    # Create agent group and user (ignore errors if they exist)
    groupadd agent 2>/dev/null || true
    useradd -m -s /bin/bash -g agent agent 2>/dev/null || true

    echo "Created 'agent' user"
fi

# Ensure home directory structure exists
mkdir -p "$AGENT_HOME/.config"
mkdir -p "$AGENT_HOME/.claude"

# Copy Claude Code auth from persistent volume (set up via one-time auth container)
if [ -d /tmp/claude-auth ] && [ "$(ls -A /tmp/claude-auth 2>/dev/null)" ]; then
    echo "Copying Claude Code credentials from auth volume..."
    cp -r /tmp/claude-auth/* "$AGENT_HOME/.claude/" 2>/dev/null || true
else
    echo "WARNING: No Claude auth found in volume. Run 'Setup Auth' in Handy DevOps settings."
fi

# Copy GitHub CLI auth from host (if mounted)
if [ -d /tmp/host-auth/.config/gh ]; then
    mkdir -p "$AGENT_HOME/.config/gh"
    cp -r /tmp/host-auth/.config/gh/* "$AGENT_HOME/.config/gh/" 2>/dev/null || true
    echo "Copied GitHub CLI auth from host"
fi

# Fix ownership of home directory
chown -R "$AGENT_USER:$AGENT_USER" "$AGENT_HOME" 2>/dev/null || true

# Give the user ownership of the workspace
# This is safe because we're in an isolated container
chown -R "$AGENT_USER:$AGENT_USER" /workspace 2>/dev/null || true

# Install gh CLI, gosu, and expect (for automating the interactive prompt)
apt-get update && apt-get install -y gh gosu expect > /dev/null 2>&1 || true

# Install Claude Code globally (as root, so it's available to all users)
npm install -g @anthropic-ai/claude-code

# Create expect script file to automate the bypass permissions warning dialog
# Use a here-doc with Tcl's format command to create the escape character
cat > /tmp/auto-accept.exp << 'EXPECT_SCRIPT'
#!/usr/bin/expect -f
set timeout -1
set cmd [lindex $argv 0]

# Define the escape sequence for down arrow using Tcl format (char 27 = ESC)
set DOWN_ARROW [format "%c\[B" 27]

spawn -noecho {{*}}$cmd
expect {{
    "No, exit" {{
        send $DOWN_ARROW
        sleep 0.2
        send "\r"
        exp_continue
    }}
    eof
}}
wait
EXPECT_SCRIPT
chmod +x /tmp/auto-accept.exp

# Create wrapper script that runs Claude via expect
# Use unquoted heredoc so CLAUDE_CMD variable expands
CLAUDE_CMD='{inner_command}'
cat > /tmp/run-agent.sh << AGENT_SCRIPT
#!/bin/bash
cd /workspace
exec /tmp/auto-accept.exp "$CLAUDE_CMD"
AGENT_SCRIPT
chmod +x /tmp/run-agent.sh
chown "$AGENT_USER:$AGENT_USER" /tmp/run-agent.sh /tmp/auto-accept.exp

# Use gosu to exec as the user - this replaces the current process entirely
# Unlike su/sudo, gosu doesn't leave any privileged process in the chain
exec gosu "$AGENT_USER" /tmp/run-agent.sh
"#,
        inner_command = inner_command.replace('\'', "'\\''"),
    );

    docker_args.push(format!("'{}'", setup_script.replace('\'', "'\\''")));

    Ok(docker_args.join(" "))
}

// Helper trait for .pipe()
trait Pipe: Sized {
    fn pipe<F, R>(self, f: F) -> R
    where
        F: FnOnce(Self) -> R,
    {
        f(self)
    }
}

impl<T> Pipe for T {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_issue_ref() {
        let (repo, number) = parse_issue_ref("org/Handy#101").unwrap();
        assert_eq!(repo, "org/Handy");
        assert_eq!(number, 101);
    }

    #[test]
    fn test_parse_issue_ref_invalid() {
        assert!(parse_issue_ref("invalid").is_err());
        assert!(parse_issue_ref("org/repo").is_err());
        assert!(parse_issue_ref("org/repo#abc").is_err());
    }

    #[test]
    fn test_extract_agent_type() {
        let body = "Some text\n**Agent Type**: claude\nMore text";
        assert_eq!(extract_agent_type(body), Some("claude".to_string()));
    }

    #[test]
    fn test_extract_agent_type_not_found() {
        let body = "Some text without agent type";
        assert_eq!(extract_agent_type(body), None);
    }

    #[test]
    fn test_extract_epic_ref() {
        let body = "Some text\n**Epic**: #100\nMore text";
        assert_eq!(extract_epic_ref(body), Some("#100".to_string()));
    }

    #[test]
    fn test_extract_epic_ref_not_found() {
        let body = "Some text without epic";
        assert_eq!(extract_epic_ref(body), None);
    }

    #[test]
    fn test_extract_work_repo() {
        let body = "Some text\n**Work Repository**: user/my-project\nMore text";
        assert_eq!(extract_work_repo(body), Some("user/my-project".to_string()));
    }

    #[test]
    fn test_extract_work_repo_not_found() {
        let body = "Some text without work repo";
        assert_eq!(extract_work_repo(body), None);
    }
}
