//! Pipeline orchestration for agent workflows.
//!
//! This module provides high-level orchestration functions for managing
//! the agent pipeline, including issue assignment, PR detection, and state management.
//! Also provides Epic state persistence for tracking active Epic workflows.

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Emitter};
use tauri_plugin_store::StoreExt;

use super::github::{self, GitHubPullRequest};
use super::operations::agent_lifecycle::{
    PrDetectionResult, SupportWorkerConfig, detect_pr_for_agent, spawn_support_worker,
};
use super::operations::epic::{EpicInfo, EpicRecoveryInfo, ExistingSubIssue};
use super::orchestrator::{self, SpawnConfig, SpawnResult};
use super::pipeline::{PipelineItem, PipelineState, PipelineStatus};
use super::tmux;

/// Store path for pipeline state.
pub const PIPELINE_STORE_PATH: &str = "pipeline_store.json";

/// Store path for Epic state.
pub const EPIC_STORE_PATH: &str = "epic_store.json";

/// Configuration for assigning an issue to an agent.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct AssignIssueConfig {
    /// Repository where the issue exists (tracking repo)
    pub tracking_repo: String,
    /// Repository where work will be done
    pub work_repo: String,
    /// Issue number to assign
    pub issue_number: u64,
    /// Agent type to use
    pub agent_type: String,
    /// Local path to the work repository
    pub repo_path: String,
    /// Labels to add when work starts
    #[serde(default)]
    pub start_labels: Vec<String>,
    /// Labels to remove when work starts
    #[serde(default)]
    pub remove_labels: Vec<String>,
}

/// Result of assigning an issue to an agent.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct AssignIssueResult {
    /// The pipeline item created
    pub pipeline_item: PipelineItem,
    /// The spawn result from orchestrator
    pub spawn_result: SpawnResult,
}

/// Configuration for skipping an issue.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct SkipIssueConfig {
    /// Repository where the issue exists
    pub repo: String,
    /// Issue number to skip
    pub issue_number: u64,
    /// Optional reason for skipping
    pub reason: Option<String>,
    /// Labels to add (defaults to "agent-skipped")
    #[serde(default)]
    pub add_labels: Vec<String>,
    /// Labels to remove (defaults to "agent-todo")
    #[serde(default)]
    pub remove_labels: Vec<String>,
}

/// Summary of pipeline items for display.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct PipelineSummary {
    /// Total items in pipeline
    pub total: usize,
    /// Items queued (not started)
    pub queued: usize,
    /// Items in progress
    pub in_progress: usize,
    /// Items with PRs pending review
    pub pr_pending: usize,
    /// Completed items
    pub completed: usize,
    /// Skipped items
    pub skipped: usize,
    /// Failed items
    pub failed: usize,
}

/// Load pipeline state from persistent storage.
pub fn load_pipeline_state(app: &AppHandle) -> PipelineState {
    let store = match app.store(PIPELINE_STORE_PATH) {
        Ok(s) => s,
        Err(_) => return PipelineState::new(),
    };

    if let Some(state_value) = store.get("pipeline") {
        serde_json::from_value::<PipelineState>(state_value)
            .unwrap_or_else(|_| PipelineState::new())
    } else {
        PipelineState::new()
    }
}

/// Save pipeline state to persistent storage.
pub fn save_pipeline_state(app: &AppHandle, state: &PipelineState) {
    if let Ok(store) = app.store(PIPELINE_STORE_PATH) {
        if let Ok(value) = serde_json::to_value(state) {
            let _ = store.set("pipeline", value);
        }
    }
}

/// Assign an issue to an agent.
///
/// This creates a worktree, spawns a tmux session, updates labels,
/// and creates a pipeline item to track the work.
pub fn assign_issue_to_agent(
    app: &AppHandle,
    config: &AssignIssueConfig,
) -> Result<AssignIssueResult, String> {
    // 1. Fetch the issue to ensure it exists
    let issue = github::get_issue(&config.tracking_repo, config.issue_number)?;

    // 2. Create spawn config
    let settings = crate::settings::get_settings(app);
    let spawn_config = SpawnConfig {
        repo: config.work_repo.clone(),
        issue_number: config.issue_number,
        agent_type: config.agent_type.clone(),
        session_name: None,
        worktree_prefix: Some("handy".to_string()),
        working_labels: config.start_labels.clone(),
        use_sandbox: settings.sandbox_enabled,
        sandbox_ports: vec![], // Auto-detect ports from project
    };

    // 3. Spawn the agent (creates worktree and session)
    let spawn_result = orchestrator::spawn_agent(&spawn_config, &config.repo_path)?;

    // 4. Create pipeline item
    let mut pipeline_item = PipelineItem::from_issue(
        &issue,
        &config.tracking_repo,
        &config.work_repo,
        &config.agent_type,
    );

    // 5. Update pipeline item with session details
    pipeline_item.start_work(
        &spawn_result.session_name,
        &spawn_result.worktree.path,
        &spawn_result.worktree.branch,
        &spawn_result.machine_id,
    );

    // 6. Update labels on the issue
    if !config.remove_labels.is_empty() {
        let remove_refs: Vec<&str> = config.remove_labels.iter().map(|s| s.as_str()).collect();
        let _ = github::update_labels(
            &config.tracking_repo,
            config.issue_number,
            vec![],
            remove_refs,
        );
    }

    // 7. Save to pipeline state
    let mut state = load_pipeline_state(app);
    state.add_item(pipeline_item.clone());
    save_pipeline_state(app, &state);

    Ok(AssignIssueResult {
        pipeline_item,
        spawn_result,
    })
}

/// Skip an issue and update its labels.
pub fn skip_issue(app: &AppHandle, config: &SkipIssueConfig) -> Result<PipelineItem, String> {
    // 1. Fetch the issue
    let issue = github::get_issue(&config.repo, config.issue_number)?;

    // 2. Create a pipeline item to record the skip
    let mut pipeline_item = PipelineItem::from_issue(&issue, &config.repo, &config.repo, "none");
    pipeline_item.skip();

    if let Some(reason) = &config.reason {
        pipeline_item.error = Some(reason.clone());
    }

    // 3. Update labels
    let add_labels = if config.add_labels.is_empty() {
        vec!["agent-skipped"]
    } else {
        config.add_labels.iter().map(|s| s.as_str()).collect()
    };

    let remove_labels = if config.remove_labels.is_empty() {
        vec!["agent-todo"]
    } else {
        config.remove_labels.iter().map(|s| s.as_str()).collect()
    };

    github::update_labels(&config.repo, config.issue_number, add_labels, remove_labels)?;

    // 4. Add comment if reason provided (sanitized to prevent credential leaks)
    if let Some(reason) = &config.reason {
        let sanitized_reason = github::sanitize_for_github(reason);
        let comment = format!(
            "🚫 **Issue Skipped**\n\n\
            This issue was skipped by the automation system.\n\n\
            **Reason:** {}\n\n\
            The issue has been marked with `agent-skipped` label.",
            sanitized_reason
        );
        let _ = github::add_comment(&config.repo, config.issue_number, &comment);
    }

    // 5. Save to history
    let mut state = load_pipeline_state(app);
    state.history.push(pipeline_item.clone());
    save_pipeline_state(app, &state);

    Ok(pipeline_item)
}

/// List all pipeline items, aggregating from multiple sources.
pub fn list_pipeline_items(
    app: &AppHandle,
    work_repo: Option<&str>,
) -> Result<Vec<PipelineItem>, String> {
    let mut state = load_pipeline_state(app);

    // Get active sessions
    let sessions = orchestrator::list_agent_statuses().unwrap_or_default();

    // Aggregate pipeline state with session data
    let work_repo = work_repo.unwrap_or("");
    let items = super::pipeline::aggregate_pipeline_state(&state, &sessions, work_repo);

    // Update state with aggregated items
    for item in &items {
        if let Some(existing) = state.items.get_mut(&item.id) {
            existing.session_name = item.session_name.clone();
            existing.worktree_path = item.worktree_path.clone();
            existing.machine_id = item.machine_id.clone();
            existing.status = item.status;
        }
    }

    save_pipeline_state(app, &state);
    Ok(items)
}

/// Get pipeline history (completed items).
pub fn get_pipeline_history(app: &AppHandle, limit: Option<usize>) -> Vec<PipelineItem> {
    let state = load_pipeline_state(app);
    state.get_history(limit).into_iter().cloned().collect()
}

/// Get pipeline summary statistics.
pub fn get_pipeline_summary(app: &AppHandle) -> PipelineSummary {
    let state = load_pipeline_state(app);

    let mut summary = PipelineSummary {
        total: state.items.len(),
        queued: 0,
        in_progress: 0,
        pr_pending: 0,
        completed: 0,
        skipped: 0,
        failed: 0,
    };

    for item in state.items.values() {
        match item.status {
            PipelineStatus::Queued => summary.queued += 1,
            PipelineStatus::InProgress => summary.in_progress += 1,
            PipelineStatus::PrPending | PipelineStatus::PrReview => summary.pr_pending += 1,
            PipelineStatus::Completed => summary.completed += 1,
            PipelineStatus::Skipped => summary.skipped += 1,
            PipelineStatus::Failed => summary.failed += 1,
        }
    }

    summary
}

/// Detect and link PRs to pipeline items.
///
/// This checks for any PRs that match pipeline item branches
/// and links them automatically.
pub fn detect_and_link_prs(app: &AppHandle, work_repo: &str) -> Result<Vec<PipelineItem>, String> {
    let mut state = load_pipeline_state(app);
    let mut updated_items = Vec::new();

    // Get open PRs for the repo
    let prs = github::list_prs(work_repo, Some("open"), None, Some(100))?;

    // Check each active item without a PR
    for item in state.items.values_mut() {
        if item.pr_number.is_none() && item.branch_name.is_some() {
            if let Some(pr) = super::pipeline::detect_pr_for_item(item, &prs) {
                item.link_pr(&pr);
                updated_items.push(item.clone());
            }
        }
    }

    // Save updated state
    if !updated_items.is_empty() {
        save_pipeline_state(app, &state);
    }

    Ok(updated_items)
}

/// Sync PR status for all pipeline items with PRs.
pub fn sync_all_pr_statuses(app: &AppHandle) -> Result<Vec<PipelineItem>, String> {
    let mut state = load_pipeline_state(app);
    let mut updated_items = Vec::new();

    for item in state.items.values_mut() {
        if item.pr_number.is_some() {
            let repo = item.work_repo.clone();
            if super::pipeline::sync_pr_status(item, &repo).unwrap_or(false) {
                updated_items.push(item.clone());
            }
        }
    }

    // Save updated state
    if !updated_items.is_empty() {
        save_pipeline_state(app, &state);
    }

    // Archive completed items
    state.archive_completed();
    save_pipeline_state(app, &state);

    Ok(updated_items)
}

/// Update a specific pipeline item's PR status.
pub fn update_pipeline_item_pr_status(
    app: &AppHandle,
    item_id: &str,
) -> Result<Option<PipelineItem>, String> {
    let mut state = load_pipeline_state(app);

    if let Some(item) = state.items.get_mut(item_id) {
        if item.pr_number.is_some() {
            let repo = item.work_repo.clone();
            super::pipeline::sync_pr_status(item, &repo)?;
            let updated_item = item.clone();
            save_pipeline_state(app, &state);
            return Ok(Some(updated_item));
        }
    }

    Ok(None)
}

/// Link a PR to a pipeline item.
pub fn link_pr_to_pipeline_item(
    app: &AppHandle,
    item_id: &str,
    pr: &GitHubPullRequest,
) -> Result<PipelineItem, String> {
    let mut state = load_pipeline_state(app);

    if let Some(item) = state.items.get_mut(item_id) {
        item.link_pr(pr);
        let updated_item = item.clone();
        save_pipeline_state(app, &state);
        Ok(updated_item)
    } else {
        Err(format!("Pipeline item not found: {}", item_id))
    }
}

/// Get a pipeline item by ID.
pub fn get_pipeline_item(app: &AppHandle, item_id: &str) -> Option<PipelineItem> {
    let state = load_pipeline_state(app);
    state.get_item(item_id).cloned()
}

/// Find a pipeline item by issue.
pub fn find_pipeline_item_by_issue(
    app: &AppHandle,
    repo: &str,
    issue_number: u64,
) -> Option<PipelineItem> {
    let state = load_pipeline_state(app);
    state.find_by_issue(repo, issue_number).cloned()
}

/// Find a pipeline item by session name.
pub fn find_pipeline_item_by_session(app: &AppHandle, session_name: &str) -> Option<PipelineItem> {
    let state = load_pipeline_state(app);
    state.find_by_session(session_name).cloned()
}

/// Archive a completed pipeline item.
pub fn archive_pipeline_item(
    app: &AppHandle,
    item_id: &str,
) -> Result<Option<PipelineItem>, String> {
    let mut state = load_pipeline_state(app);
    let archived = state.archive_item(item_id);
    save_pipeline_state(app, &state);
    Ok(archived)
}

/// Remove a pipeline item (for cleanup).
pub fn remove_pipeline_item(
    app: &AppHandle,
    item_id: &str,
) -> Result<Option<PipelineItem>, String> {
    let mut state = load_pipeline_state(app);
    let removed = state.remove_item(item_id);
    save_pipeline_state(app, &state);
    Ok(removed)
}

// ========== Epic State Management ==========

/// Status of a phase within an Epic (for persisted tracking)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum TrackedPhaseStatus {
    /// Phase not started
    NotStarted,
    /// Phase is in progress (agents working)
    InProgress,
    /// Phase is ready (all sub-issues have PRs, waiting for merge)
    Ready,
    /// Phase is completed (all sub-issues closed)
    Completed,
    /// Phase was skipped
    Skipped,
}

impl Default for TrackedPhaseStatus {
    fn default() -> Self {
        Self::NotStarted
    }
}

/// Tracked state for a phase
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct TrackedPhase {
    /// Phase number (1-indexed)
    pub phase_number: u32,
    /// Phase name
    pub name: String,
    /// Phase status
    pub status: TrackedPhaseStatus,
    /// Sub-issue numbers assigned to this phase
    pub sub_issues: Vec<u32>,
    /// Count of completed sub-issues
    pub completed_count: usize,
    /// Total sub-issues for this phase
    pub total_count: usize,
}

/// Persisted state for an active Epic workflow
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ActiveEpicState {
    /// Epic issue number
    pub epic_number: u32,
    /// Tracking repository (where Epic issue lives)
    pub tracking_repo: String,
    /// Work repository (where code is written)
    pub work_repo: String,
    /// Local filesystem path to the repository (for agent spawning)
    #[serde(default)]
    pub local_repo_path: Option<String>,
    /// Epic title
    pub title: String,
    /// Epic URL
    pub url: String,
    /// Phases with their tracked state
    pub phases: Vec<TrackedPhase>,
    /// All sub-issues for this epic
    pub sub_issues: Vec<TrackedSubIssue>,
    /// When this Epic was linked/loaded
    pub linked_at: String,
    /// Last time state was synced with GitHub
    pub last_synced_at: Option<String>,
}

/// Tracked state for a sub-issue
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct TrackedSubIssue {
    /// Issue number
    pub issue_number: u32,
    /// Issue title
    pub title: String,
    /// Phase number this belongs to
    pub phase: Option<u32>,
    /// Current state (open/closed)
    pub state: String,
    /// Agent type assigned
    pub agent_type: Option<String>,
    /// Session name if agent is working
    pub session_name: Option<String>,
    /// tmux session name for the agent (if assigned)
    #[serde(default)]
    pub agent_session: Option<String>,
    /// Whether an agent is currently working
    pub has_agent_working: bool,
    /// URL to the issue
    pub url: String,
    /// PR URL if agent created one
    #[serde(default)]
    pub pr_url: Option<String>,
    /// PR number if agent created one
    #[serde(default)]
    pub pr_number: Option<u64>,
}

/// Full Epic store state (can track multiple epics, though typically one active)
#[derive(Debug, Clone, Default, Serialize, Deserialize, Type)]
pub struct EpicStoreState {
    /// Currently active Epic (the one being orchestrated)
    pub active_epic: Option<ActiveEpicState>,
    /// History of completed epics (for reference)
    pub history: Vec<ActiveEpicState>,
    /// Maximum history to keep
    #[serde(default = "default_epic_history")]
    pub max_history: usize,
}

fn default_epic_history() -> usize {
    10
}

impl EpicStoreState {
    pub fn new() -> Self {
        Self {
            active_epic: None,
            history: Vec::new(),
            max_history: default_epic_history(),
        }
    }
}

/// Load Epic state from persistent storage.
pub fn load_epic_state(app: &AppHandle) -> EpicStoreState {
    let store = match app.store(EPIC_STORE_PATH) {
        Ok(s) => s,
        Err(_) => return EpicStoreState::new(),
    };

    if let Some(state_value) = store.get("epic_state") {
        serde_json::from_value::<EpicStoreState>(state_value)
            .unwrap_or_else(|_| EpicStoreState::new())
    } else {
        EpicStoreState::new()
    }
}

/// Save Epic state to persistent storage.
pub fn save_epic_state(app: &AppHandle, state: &EpicStoreState) {
    if let Ok(store) = app.store(EPIC_STORE_PATH) {
        if let Ok(value) = serde_json::to_value(state) {
            let _ = store.set("epic_state", value);
        }
    }
}

/// Set the active Epic from an EpicInfo (when first linking an Epic).
pub fn set_active_epic(app: &AppHandle, epic_info: &EpicInfo) -> ActiveEpicState {
    let mut state = load_epic_state(app);

    // Convert phases to tracked phases
    let tracked_phases: Vec<TrackedPhase> = epic_info
        .phases
        .iter()
        .enumerate()
        .map(|(i, phase)| TrackedPhase {
            phase_number: (i + 1) as u32,
            name: phase.name.clone(),
            status: TrackedPhaseStatus::NotStarted,
            sub_issues: Vec::new(),
            completed_count: 0,
            total_count: 0,
        })
        .collect();

    // Preserve existing local_repo_path if we're re-linking the same epic
    let existing_local_path = state
        .active_epic
        .as_ref()
        .filter(|e| e.epic_number == epic_info.epic_number)
        .and_then(|e| e.local_repo_path.clone());

    let active = ActiveEpicState {
        epic_number: epic_info.epic_number,
        tracking_repo: epic_info.repo.clone(),
        work_repo: epic_info.work_repo.clone(),
        local_repo_path: existing_local_path,
        title: epic_info.title.clone(),
        url: epic_info.url.clone(),
        phases: tracked_phases,
        sub_issues: Vec::new(),
        linked_at: chrono::Utc::now().to_rfc3339(),
        last_synced_at: None,
    };

    state.active_epic = Some(active.clone());
    save_epic_state(app, &state);

    active
}

/// Extract phase status from the Epic issue body.
/// Returns a map from phase number to status.
fn extract_phase_statuses_from_body(
    body: &str,
) -> std::collections::HashMap<u32, TrackedPhaseStatus> {
    let mut statuses = std::collections::HashMap::new();
    let mut current_phase: Option<u32> = None;

    for line in body.lines() {
        let trimmed = line.trim();

        // Look for phase headers: "### Phase N: Name"
        if trimmed.starts_with("### Phase ") {
            let after_phase = trimmed.trim_start_matches("### Phase ");
            if let Some(num_end) = after_phase.find(':') {
                if let Ok(num) = after_phase[..num_end].trim().parse::<u32>() {
                    current_phase = Some(num);
                }
            }
            continue;
        }

        // Look for status line: "**Status**: ✅ Complete" or similar
        if trimmed.starts_with("**Status**:") {
            if let Some(phase_num) = current_phase {
                let status_text = trimmed.trim_start_matches("**Status**:").trim();
                let status = if status_text.contains("Complete") || status_text.contains("✅") {
                    TrackedPhaseStatus::Completed
                } else if status_text.contains("Ready") || status_text.contains("🟡") {
                    TrackedPhaseStatus::Ready
                } else if status_text.contains("In Progress") || status_text.contains("🔄") {
                    TrackedPhaseStatus::InProgress
                } else if status_text.contains("Skipped") || status_text.contains("⏭️") {
                    TrackedPhaseStatus::Skipped
                } else {
                    TrackedPhaseStatus::NotStarted
                };
                statuses.insert(phase_num, status);
            }
        }

        // Reset phase when we hit a new top-level section
        if trimmed.starts_with("## ") && !trimmed.starts_with("### ") {
            current_phase = None;
        }
    }

    statuses
}

/// Set the active Epic from recovery info (more complete data).
///
/// This also cross-references with active tmux sessions to populate
/// has_agent_working more accurately.
pub fn set_active_epic_from_recovery(
    app: &AppHandle,
    recovery: &EpicRecoveryInfo,
) -> ActiveEpicState {
    let mut state = load_epic_state(app);

    // Extract phase statuses from the Epic body (for manually completed phases)
    let body_statuses = extract_phase_statuses_from_body(&recovery.epic_body);

    // Get active tmux sessions to cross-reference agent assignments
    let active_sessions = tmux::list_sessions().unwrap_or_default();
    let issue_to_session: std::collections::HashMap<u32, String> = active_sessions
        .iter()
        .filter_map(|s| {
            s.metadata.as_ref().and_then(|m| {
                m.issue_ref.as_ref().and_then(|ref_str| {
                    // Parse issue number from ref like "owner/repo#123"
                    ref_str
                        .split('#')
                        .nth(1)
                        .and_then(|num| num.parse::<u32>().ok())
                        .map(|num| (num, s.name.clone()))
                })
            })
        })
        .collect();

    // Group sub-issues by phase
    let mut phase_issues: std::collections::HashMap<u32, Vec<&ExistingSubIssue>> =
        std::collections::HashMap::new();
    for sub in &recovery.sub_issues {
        if let Some(phase) = sub.phase {
            phase_issues.entry(phase).or_default().push(sub);
        }
    }

    // Build tracked phases with sub-issue info
    let tracked_phases: Vec<TrackedPhase> = recovery
        .epic
        .phases
        .iter()
        .enumerate()
        .map(|(i, phase)| {
            let phase_num = (i + 1) as u32;
            let phase_subs = phase_issues
                .get(&phase_num)
                .map(|v| v.as_slice())
                .unwrap_or(&[]);
            // Use case-insensitive comparison since GitHub returns uppercase state
            let completed = phase_subs
                .iter()
                .filter(|s| s.state.eq_ignore_ascii_case("closed"))
                .count();

            // Count open sub-issues
            let open_subs: Vec<_> = phase_subs
                .iter()
                .filter(|s| s.state.eq_ignore_ascii_case("open"))
                .collect();

            // Check for active agents: either has_agent_working from labels OR has active session
            // But NOT if the sub-issue already has a PR (agent work is done)
            let has_active_agent = phase_subs.iter().any(|s| {
                let is_open = s.state.eq_ignore_ascii_case("open");
                let has_pr = s.pr_url.is_some();
                let has_agent =
                    s.has_agent_working || issue_to_session.contains_key(&s.issue_number);
                // Only count as active if open, has agent, but no PR yet
                is_open && has_agent && !has_pr
            });

            // Check if all open sub-issues have PRs (phase is "ready" for merge)
            let all_open_have_prs =
                !open_subs.is_empty() && open_subs.iter().all(|s| s.pr_url.is_some());

            // Determine status:
            // 1. If there are sub-issues, use their status
            // 2. If no sub-issues, check the Epic body for status (handles manual completions)
            let status = if !phase_subs.is_empty() {
                if completed == phase_subs.len() {
                    TrackedPhaseStatus::Completed
                } else if all_open_have_prs {
                    // All remaining open issues have PRs - phase is ready for merge
                    TrackedPhaseStatus::Ready
                } else if has_active_agent {
                    TrackedPhaseStatus::InProgress
                } else if open_subs.is_empty() && completed > 0 {
                    // All sub-issues are closed
                    TrackedPhaseStatus::Completed
                } else if !open_subs.is_empty() {
                    // Has open issues but no agent working - still in progress
                    TrackedPhaseStatus::InProgress
                } else {
                    TrackedPhaseStatus::NotStarted
                }
            } else {
                // No sub-issues - check Epic body for status
                body_statuses
                    .get(&phase_num)
                    .cloned()
                    .unwrap_or(TrackedPhaseStatus::NotStarted)
            };

            TrackedPhase {
                phase_number: phase_num,
                name: phase.name.clone(),
                status,
                sub_issues: phase_subs.iter().map(|s| s.issue_number).collect(),
                completed_count: completed,
                total_count: phase_subs.len(),
            }
        })
        .collect();

    // Convert sub-issues to tracked format, enriching with session info
    let tracked_sub_issues: Vec<TrackedSubIssue> = recovery
        .sub_issues
        .iter()
        .map(|s| {
            let session_name = issue_to_session.get(&s.issue_number).cloned();
            // Only mark as having agent if issue is open - closed issues don't need agents
            let is_closed = s.state.eq_ignore_ascii_case("closed");
            // If PR exists, agent work is done (even if session still exists)
            let has_pr = s.pr_url.is_some();
            let has_agent =
                !is_closed && !has_pr && (s.has_agent_working || session_name.is_some());

            TrackedSubIssue {
                issue_number: s.issue_number,
                title: s.title.clone(),
                phase: s.phase,
                state: s.state.to_lowercase(), // Normalize to lowercase for consistent comparison
                agent_type: None,              // Will be filled when agent is assigned
                session_name: if is_closed {
                    None
                } else {
                    session_name.clone()
                },
                agent_session: if is_closed { None } else { session_name },
                has_agent_working: has_agent,
                url: s.url.clone(),
                pr_url: s.pr_url.clone(),
                pr_number: s.pr_number,
            }
        })
        .collect();

    // Preserve existing local_repo_path if we're re-loading the same epic
    let existing_local_path = state
        .active_epic
        .as_ref()
        .filter(|e| e.epic_number == recovery.epic.epic_number)
        .and_then(|e| e.local_repo_path.clone());

    let active = ActiveEpicState {
        epic_number: recovery.epic.epic_number,
        tracking_repo: recovery.epic.repo.clone(),
        work_repo: recovery.epic.work_repo.clone(),
        local_repo_path: existing_local_path,
        title: recovery.epic.title.clone(),
        url: recovery.epic.url.clone(),
        phases: tracked_phases,
        sub_issues: tracked_sub_issues,
        linked_at: chrono::Utc::now().to_rfc3339(),
        last_synced_at: Some(chrono::Utc::now().to_rfc3339()),
    };

    state.active_epic = Some(active.clone());
    save_epic_state(app, &state);

    active
}

/// Get the currently active Epic state.
pub fn get_active_epic(app: &AppHandle) -> Option<ActiveEpicState> {
    let state = load_epic_state(app);
    state.active_epic
}

/// Update the local repository path for the active Epic.
pub fn set_epic_local_repo_path(app: &AppHandle, local_repo_path: &str) -> Result<(), String> {
    let mut state = load_epic_state(app);

    if let Some(ref mut active) = state.active_epic {
        active.local_repo_path = Some(local_repo_path.to_string());
        save_epic_state(app, &state);
        log::info!("Updated Epic local_repo_path to: {}", local_repo_path);
        Ok(())
    } else {
        Err("No active Epic to update".to_string())
    }
}

/// Clear the active Epic (move to history if completed).
pub fn clear_active_epic(app: &AppHandle, archive: bool) -> Option<ActiveEpicState> {
    let mut state = load_epic_state(app);

    if let Some(active) = state.active_epic.take() {
        if archive {
            state.history.push(active.clone());
            // Trim history
            while state.history.len() > state.max_history {
                state.history.remove(0);
            }
        }
        save_epic_state(app, &state);
        return Some(active);
    }

    None
}

/// Update a sub-issue's agent assignment in the active Epic.
pub fn update_epic_sub_issue_agent(
    app: &AppHandle,
    issue_number: u32,
    session_name: Option<&str>,
    agent_type: Option<&str>,
) -> Result<(), String> {
    let mut state = load_epic_state(app);

    if let Some(ref mut active) = state.active_epic {
        if let Some(sub) = active
            .sub_issues
            .iter_mut()
            .find(|s| s.issue_number == issue_number)
        {
            sub.session_name = session_name.map(|s| s.to_string());
            sub.agent_session = session_name.map(|s| s.to_string()); // Also set agent_session for PR tracking
            sub.agent_type = agent_type.map(|s| s.to_string());
            sub.has_agent_working = session_name.is_some();
            save_epic_state(app, &state);
            return Ok(());
        }
    }

    Err(format!(
        "Sub-issue {} not found in active epic",
        issue_number
    ))
}

/// Sync the active Epic state with GitHub.
///
/// This preserves locally-tracked state (pr_url, agent_session, etc.) while
/// updating GitHub-sourced state (issue state, labels, etc.).
pub async fn sync_active_epic(app: &AppHandle) -> Result<Option<ActiveEpicState>, String> {
    let state = load_epic_state(app);

    if let Some(active) = &state.active_epic {
        // Save local-only state before reload
        let local_state: std::collections::HashMap<
            u32,
            (Option<String>, Option<u64>, Option<String>, Option<String>),
        > = active
            .sub_issues
            .iter()
            .map(|s| {
                (
                    s.issue_number,
                    (
                        s.pr_url.clone(),
                        s.pr_number,
                        s.agent_session.clone(),
                        s.agent_type.clone(),
                    ),
                )
            })
            .collect();

        // Reload from GitHub
        let recovery = super::operations::epic::load_epic_for_recovery(
            active.tracking_repo.clone(),
            active.epic_number,
        )
        .await?;

        // Update with fresh data (this recreates sub_issues)
        let mut updated = set_active_epic_from_recovery(app, &recovery);

        // Restore local-only state that GitHub doesn't know about
        for sub_issue in &mut updated.sub_issues {
            if let Some((pr_url, pr_number, agent_session, agent_type)) =
                local_state.get(&sub_issue.issue_number)
            {
                // Preserve PR info
                if sub_issue.pr_url.is_none() {
                    sub_issue.pr_url = pr_url.clone();
                }
                if sub_issue.pr_number.is_none() {
                    sub_issue.pr_number = *pr_number;
                }
                // Preserve agent session info
                if sub_issue.agent_session.is_none() {
                    sub_issue.agent_session = agent_session.clone();
                }
                if sub_issue.agent_type.is_none() {
                    sub_issue.agent_type = agent_type.clone();
                }
            }
        }

        // Save the merged state
        let mut final_state = load_epic_state(app);
        final_state.active_epic = Some(updated.clone());
        save_epic_state(app, &final_state);

        Ok(Some(updated))
    } else {
        Ok(None)
    }
}

/// Handle pipeline item completion and update Epic if applicable.
///
/// This should be called when a pipeline item transitions to Completed/Failed/Skipped.
/// It will:
/// 1. Update the Epic's sub-issue tracking
/// 2. Update phase status if all sub-issues in a phase are complete
/// 3. Optionally update the Epic issue on GitHub
pub async fn on_pipeline_item_complete(
    app: &AppHandle,
    issue_number: u32,
    update_github: bool,
) -> Result<(), String> {
    let state = load_epic_state(app);

    if let Some(active) = &state.active_epic {
        // Check if this issue belongs to the active Epic
        let belongs_to_epic = active
            .sub_issues
            .iter()
            .any(|s| s.issue_number == issue_number);

        if belongs_to_epic {
            log::info!(
                "Pipeline item #{} completed, belongs to Epic #{}",
                issue_number,
                active.epic_number
            );

            // Sync Epic state with GitHub to get latest status
            let updated = sync_active_epic(app).await?;

            // Optionally update the Epic issue on GitHub with new phase status
            if update_github {
                if let Some(updated_state) = updated {
                    // Build phase statuses from the updated state
                    let phase_statuses: Vec<super::operations::PhaseStatus> = updated_state
                        .phases
                        .iter()
                        .map(|p| super::operations::PhaseStatus {
                            phase_number: p.phase_number,
                            phase_name: p.name.clone(),
                            approach: match p.status {
                                TrackedPhaseStatus::Completed => "manual".to_string(),
                                _ => "agent-assisted".to_string(),
                            },
                            total_issues: p.total_count as u32,
                            completed_issues: p.completed_count as u32,
                            in_progress_issues: 0, // Would need to calculate from sub_issues
                            status: match p.status {
                                TrackedPhaseStatus::Completed => "completed".to_string(),
                                TrackedPhaseStatus::Ready => "ready".to_string(),
                                TrackedPhaseStatus::InProgress => "in_progress".to_string(),
                                TrackedPhaseStatus::NotStarted => "not_started".to_string(),
                                TrackedPhaseStatus::Skipped => "skipped".to_string(),
                            },
                        })
                        .collect();

                    // Update Epic issue on GitHub
                    super::operations::update_epic_phase_status_on_github(
                        &updated_state.tracking_repo,
                        updated_state.epic_number,
                        &phase_statuses,
                    )
                    .await?;

                    log::info!(
                        "Updated Epic #{} on GitHub with phase status",
                        updated_state.epic_number
                    );
                }
            }
        }
    }

    Ok(())
}

/// Check all active agent sessions for PR creation
///
/// This function:
/// 1. Gets all active tmux sessions (agents working on issues)
/// 2. For each session, checks if a PR exists for its branch
/// 3. Compares with previously detected PRs to identify new ones
/// 4. Returns list of detection results with is_new flag set appropriately
///
/// Used by the Epic monitor to detect when agents have completed work
/// by creating PRs, enabling automatic Epic progress updates.
pub async fn check_sessions_for_prs(app: &AppHandle) -> Result<Vec<PrDetectionResult>, String> {
    // Get all active sessions
    let sessions = tokio::task::spawn_blocking(tmux::list_sessions)
        .await
        .map_err(|e| format!("Task join error: {}", e))?
        .map_err(|e| format!("Failed to list sessions: {}", e))?;

    // Filter to only agent sessions (those with issue_ref metadata)
    let agent_sessions: Vec<_> = sessions
        .into_iter()
        .filter(|s| {
            s.metadata
                .as_ref()
                .map(|m| m.issue_ref.is_some())
                .unwrap_or(false)
        })
        .collect();

    if agent_sessions.is_empty() {
        return Ok(vec![]);
    }

    // Load previously detected PRs from state (track by issue number, not session)
    let state = load_epic_state(app);
    let known_pr_issues: std::collections::HashSet<u32> = state
        .active_epic
        .as_ref()
        .map(|e| {
            e.sub_issues
                .iter()
                .filter(|s| s.pr_url.is_some())
                .map(|s| s.issue_number)
                .collect()
        })
        .unwrap_or_default();

    let mut results = Vec::new();

    // Check each session for PRs
    for session in agent_sessions {
        match detect_pr_for_agent(&session.name).await {
            Ok(Some(mut result)) => {
                // Check if this is a newly detected PR (by issue number)
                if result.pr_url.is_some() {
                    result.is_new = !known_pr_issues.contains(&result.issue_number);

                    // If new PR detected, update Epic state and emit event
                    if result.is_new {
                        if let Some(pr_url) = &result.pr_url {
                            // Update the sub-issue in Epic state with PR info
                            update_sub_issue_pr_url(
                                app,
                                result.issue_number,
                                pr_url,
                                result.pr_number,
                            );

                            log::info!(
                                "New PR detected for session {}: {} (issue #{})",
                                session.name,
                                pr_url,
                                result.issue_number
                            );

                            // Emit event for real-time UI updates
                            let _ = app.emit(
                                "agent-pr-created",
                                serde_json::json!({
                                    "session": session.name,
                                    "issue_number": result.issue_number,
                                    "pr_url": pr_url,
                                    "pr_number": result.pr_number,
                                    "repo": result.repo,
                                }),
                            );
                        }
                    }
                }
                results.push(result);
            }
            Ok(None) => {
                // Session exists but no PR info (shouldn't happen with current impl)
            }
            Err(e) => {
                log::warn!("Failed to detect PR for session {}: {}", session.name, e);
            }
        }
    }

    Ok(results)
}

/// Update a sub-issue's PR URL in the Epic state
fn update_sub_issue_pr_url(
    app: &AppHandle,
    issue_number: u32,
    pr_url: &str,
    pr_number: Option<u64>,
) {
    let mut state = load_epic_state(app);

    if let Some(ref mut active) = state.active_epic {
        // Find and update the sub-issue
        for sub_issue in &mut active.sub_issues {
            if sub_issue.issue_number == issue_number {
                sub_issue.pr_url = Some(pr_url.to_string());
                sub_issue.pr_number = pr_number;
                log::info!(
                    "Updated sub-issue #{} with PR URL: {}",
                    issue_number,
                    pr_url
                );
                break;
            }
        }

        save_epic_state(app, &state);
    }
}

// ============================================================================
// PR Merge Commands for Ready State
// ============================================================================

/// Result of merging a single PR
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct MergeResult {
    /// Issue number that was merged
    pub issue_number: u32,
    /// PR number that was merged
    pub pr_number: u64,
    /// PR URL
    pub pr_url: String,
    /// Whether the support worker was spawned successfully
    pub success: bool,
    /// Error message if spawn failed
    pub error: Option<String>,
    /// Phase this issue belongs to
    pub phase: Option<u32>,
    /// Support worker session name (for tracking)
    pub support_worker_session: Option<String>,
    /// Whether this phase is now complete (all issues closed)
    /// Note: This is only accurate after the merge completes
    pub phase_complete: bool,
    /// Next phase number if phase is complete and there's more work
    pub next_phase: Option<u32>,
}

/// Result of processing all ready PRs
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ProcessReadyResult {
    /// Individual merge results
    pub merges: Vec<MergeResult>,
    /// Phases that are now complete
    pub completed_phases: Vec<u32>,
    /// Next phase to work on (if any)
    pub next_phase: Option<u32>,
    /// Whether agents were auto-started for next phase
    pub agents_started: bool,
}

/// Merge a PR for a sub-issue that's in "Ready" state
///
/// This spawns a Support Worker agent to handle the merge process.
/// The support worker will:
/// 1. View the PR details
/// 2. Check PR status and CI results
/// 3. Merge the PR using the specified method
/// 4. Delete the branch if requested
///
/// When sandbox mode is enabled, the support worker runs inside a Docker container
/// with the worktree mounted, allowing it to resolve merge conflicts locally.
pub async fn merge_ready_pr(
    app: &AppHandle,
    issue_number: u32,
    merge_method: Option<&str>,
    delete_branch: bool,
) -> Result<MergeResult, String> {
    let state = load_epic_state(app);
    let settings = crate::settings::get_settings(app);

    let active = state.active_epic.as_ref().ok_or("No active Epic")?;

    // Find the sub-issue
    let sub_issue = active
        .sub_issues
        .iter()
        .find(|s| s.issue_number == issue_number)
        .ok_or_else(|| format!("Sub-issue #{} not found in active Epic", issue_number))?;

    // Check it has a PR
    let pr_url = sub_issue
        .pr_url
        .as_ref()
        .ok_or_else(|| format!("Sub-issue #{} has no PR to merge", issue_number))?;

    let pr_number = sub_issue
        .pr_number
        .ok_or_else(|| format!("Sub-issue #{} has no PR number", issue_number))?;

    let phase = sub_issue.phase;
    let work_repo = active.work_repo.clone();

    // Get worktree path for sandboxed execution
    // Try to get it from the agent session metadata, or construct it from the Epic's local repo path
    let worktree_path = if settings.sandbox_enabled {
        // First try to get from tmux session metadata
        let session_worktree = if let Some(session_name) = &sub_issue.agent_session {
            tokio::task::spawn_blocking({
                let session_name = session_name.clone();
                move || {
                    tmux::get_session_metadata(&session_name)
                        .ok()
                        .and_then(|m| m.worktree)
                }
            })
            .await
            .ok()
            .flatten()
        } else {
            None
        };

        // If no session worktree, try to construct from Epic's local repo path
        session_worktree.or_else(|| {
            active.local_repo_path.as_ref().map(|repo_path| {
                // Worktrees are typically at <repo>/../handy-worktrees/issue-<number>
                let base = std::path::Path::new(repo_path)
                    .parent()
                    .unwrap_or(std::path::Path::new(repo_path));
                base.join("handy-worktrees")
                    .join(format!("issue-{}", issue_number))
                    .to_string_lossy()
                    .to_string()
            })
        })
    } else {
        None
    };

    log::info!(
        "Spawning support worker to merge PR #{} for issue #{} (sandbox: {}, worktree: {:?})",
        pr_number,
        issue_number,
        settings.sandbox_enabled,
        worktree_path
    );

    // Spawn a support worker to handle the merge
    let support_config = SupportWorkerConfig {
        repo: work_repo.clone(),
        issue_number,
        pr_number: Some(pr_number),
        task: format!("Merge PR #{} for issue #{}", pr_number, issue_number),
        task_type: "merge".to_string(),
        merge_method: merge_method.map(|s| s.to_string()),
        delete_branch,
        sandboxed: settings.sandbox_enabled && worktree_path.is_some(),
        worktree_path,
    };

    match spawn_support_worker(support_config).await {
        Ok(result) => {
            log::info!(
                "Support worker spawned: {} for PR #{}",
                result.session,
                pr_number
            );

            // Emit event so frontend can track the merge
            let _ = app.emit(
                "support-worker-spawned",
                serde_json::json!({
                    "session": result.session,
                    "issue_number": issue_number,
                    "pr_number": pr_number,
                    "task_type": "merge",
                }),
            );

            // Note: Phase completion will be detected on next sync after merge completes
            // For now, return success with the session info
            Ok(MergeResult {
                issue_number,
                pr_number,
                pr_url: pr_url.clone(),
                success: true,
                error: None,
                phase,
                support_worker_session: Some(result.session),
                phase_complete: false, // Will be updated on next sync
                next_phase: None,
            })
        }
        Err(e) => {
            log::error!(
                "Failed to spawn support worker for PR #{}: {}",
                pr_number,
                e
            );
            Ok(MergeResult {
                issue_number,
                pr_number,
                pr_url: pr_url.clone(),
                success: false,
                error: Some(e),
                phase,
                support_worker_session: None,
                phase_complete: false,
                next_phase: None,
            })
        }
    }
}

/// Process all "Ready" sub-issues for the active Epic
pub async fn process_ready_prs(
    app: &AppHandle,
    merge_method: Option<&str>,
    delete_branch: bool,
    auto_start_next_phase: bool,
) -> Result<ProcessReadyResult, String> {
    // First sync to ensure we have latest state
    sync_active_epic(app).await?;

    let state = load_epic_state(app);
    let active = state.active_epic.as_ref().ok_or("No active Epic")?;

    // Find all sub-issues in "Ready" state (open with PR)
    let ready_issues: Vec<u32> = active
        .sub_issues
        .iter()
        .filter(|s| s.state.eq_ignore_ascii_case("open") && s.pr_url.is_some())
        .map(|s| s.issue_number)
        .collect();

    log::info!("Found {} ready PRs to process", ready_issues.len());

    let mut merges = Vec::new();
    let mut completed_phases = Vec::new();

    for issue_number in ready_issues {
        let result = merge_ready_pr(app, issue_number, merge_method, delete_branch).await?;

        if result.success && result.phase_complete {
            if let Some(phase) = result.phase {
                if !completed_phases.contains(&phase) {
                    completed_phases.push(phase);
                }
            }
        }

        merges.push(result);
    }

    // Find next phase to work on
    let state = load_epic_state(app);
    let next_phase = if let Some(active) = &state.active_epic {
        active
            .phases
            .iter()
            .find(|ph| ph.status == TrackedPhaseStatus::NotStarted)
            .map(|ph| ph.phase_number)
    } else {
        None
    };

    // Optionally auto-start agents for next phase
    let agents_started = if auto_start_next_phase && next_phase.is_some() {
        log::info!("Auto-starting agents for phase {:?}", next_phase);
        // TODO: Implement auto-start logic - spawn agents for queued issues in next phase
        false // Not implemented yet
    } else {
        false
    };

    Ok(ProcessReadyResult {
        merges,
        completed_phases,
        next_phase,
        agents_started,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_skip_issue_config_defaults() {
        let config = SkipIssueConfig {
            repo: "test/repo".to_string(),
            issue_number: 123,
            reason: None,
            add_labels: vec![],
            remove_labels: vec![],
        };

        assert!(config.add_labels.is_empty());
        assert!(config.remove_labels.is_empty());
    }
}
