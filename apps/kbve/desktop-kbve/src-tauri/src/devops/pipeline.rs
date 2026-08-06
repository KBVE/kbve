//! Pipeline state tracking for agent workflows.
//!
//! This module provides infrastructure for tracking the lifecycle of agent work items,
//! from issue assignment through session/worktree creation to PR completion.

use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::HashMap;

use super::github::{self, GitHubIssue, GitHubPullRequest};
use super::orchestrator::AgentStatus;

/// Status of a PR in the pipeline.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum PrPipelineStatus {
    /// No PR has been created yet
    None,
    /// PR is in draft state
    Draft,
    /// PR is ready for review
    Ready,
    /// PR needs review (has reviewers assigned)
    NeedsReview,
    /// PR has been approved
    Approved,
    /// PR has been merged
    Merged,
    /// PR was closed without merging
    Closed,
}

impl Default for PrPipelineStatus {
    fn default() -> Self {
        Self::None
    }
}

/// Status of a pipeline item.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum PipelineStatus {
    /// Issue is queued but not assigned
    Queued,
    /// Issue is assigned to an agent and work is in progress
    InProgress,
    /// Agent has completed work and PR is pending
    PrPending,
    /// PR has been created and is being reviewed
    PrReview,
    /// PR has been merged, work is complete
    Completed,
    /// Issue was skipped
    Skipped,
    /// Work failed or was abandoned
    Failed,
}

impl Default for PipelineStatus {
    fn default() -> Self {
        Self::Queued
    }
}

/// A pipeline item linking issue -> session -> worktree -> PR.
///
/// This struct tracks the full lifecycle of an agent's work on an issue.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct PipelineItem {
    /// Unique identifier for this pipeline item
    pub id: String,
    /// Repository in owner/repo format (tracking repo where issue exists)
    pub tracking_repo: String,
    /// Repository where work is done (may be different from tracking_repo)
    pub work_repo: String,
    /// Issue number being worked on
    pub issue_number: u64,
    /// Issue title
    pub issue_title: String,
    /// Issue URL
    pub issue_url: String,
    /// Agent type (e.g., "claude", "aider")
    pub agent_type: String,
    /// tmux session name (if active)
    pub session_name: Option<String>,
    /// Worktree path (if created)
    pub worktree_path: Option<String>,
    /// Branch name for the work
    pub branch_name: Option<String>,
    /// Machine ID where agent is running
    pub machine_id: Option<String>,
    /// PR number (if created)
    pub pr_number: Option<u64>,
    /// PR URL (if created)
    pub pr_url: Option<String>,
    /// Current PR status
    pub pr_status: PrPipelineStatus,
    /// Overall pipeline status
    pub status: PipelineStatus,
    /// When the item was created/queued
    pub created_at: String,
    /// When work started (agent assigned)
    pub started_at: Option<String>,
    /// When work completed (PR merged or skipped)
    pub completed_at: Option<String>,
    /// Any error message if failed
    pub error: Option<String>,
}

impl PipelineItem {
    /// Create a new pipeline item from an issue.
    pub fn from_issue(
        issue: &GitHubIssue,
        tracking_repo: &str,
        work_repo: &str,
        agent_type: &str,
    ) -> Self {
        let id = format!(
            "{}-{}-{}",
            work_repo.replace('/', "-"),
            issue.number,
            chrono::Utc::now().timestamp()
        );
        Self {
            id,
            tracking_repo: tracking_repo.to_string(),
            work_repo: work_repo.to_string(),
            issue_number: issue.number,
            issue_title: issue.title.clone(),
            issue_url: issue.url.clone(),
            agent_type: agent_type.to_string(),
            session_name: None,
            worktree_path: None,
            branch_name: None,
            machine_id: None,
            pr_number: None,
            pr_url: None,
            pr_status: PrPipelineStatus::None,
            status: PipelineStatus::Queued,
            created_at: chrono::Utc::now().to_rfc3339(),
            started_at: None,
            completed_at: None,
            error: None,
        }
    }

    /// Mark the item as in progress with session details.
    pub fn start_work(
        &mut self,
        session_name: &str,
        worktree_path: &str,
        branch_name: &str,
        machine_id: &str,
    ) {
        self.session_name = Some(session_name.to_string());
        self.worktree_path = Some(worktree_path.to_string());
        self.branch_name = Some(branch_name.to_string());
        self.machine_id = Some(machine_id.to_string());
        self.status = PipelineStatus::InProgress;
        self.started_at = Some(chrono::Utc::now().to_rfc3339());
    }

    /// Link a PR to this pipeline item.
    pub fn link_pr(&mut self, pr: &GitHubPullRequest) {
        self.pr_number = Some(pr.number);
        self.pr_url = Some(pr.url.clone());
        self.pr_status = if pr.state == "merged" {
            PrPipelineStatus::Merged
        } else if pr.state == "closed" {
            PrPipelineStatus::Closed
        } else if pr.is_draft {
            PrPipelineStatus::Draft
        } else {
            PrPipelineStatus::Ready
        };
        self.status = if self.pr_status == PrPipelineStatus::Merged {
            PipelineStatus::Completed
        } else {
            PipelineStatus::PrReview
        };
    }

    /// Update PR status from a GitHubPullRequest.
    pub fn update_pr_status(
        &mut self,
        pr: &GitHubPullRequest,
        has_reviewers: bool,
        is_approved: bool,
    ) {
        self.pr_status = if pr.state == "merged" || pr.state == "MERGED" {
            PrPipelineStatus::Merged
        } else if pr.state == "closed" || pr.state == "CLOSED" {
            PrPipelineStatus::Closed
        } else if is_approved {
            PrPipelineStatus::Approved
        } else if has_reviewers {
            PrPipelineStatus::NeedsReview
        } else if pr.is_draft {
            PrPipelineStatus::Draft
        } else {
            PrPipelineStatus::Ready
        };

        // Update overall status based on PR status
        self.status = match self.pr_status {
            PrPipelineStatus::Merged => {
                self.completed_at = Some(chrono::Utc::now().to_rfc3339());
                PipelineStatus::Completed
            }
            PrPipelineStatus::Closed => {
                self.completed_at = Some(chrono::Utc::now().to_rfc3339());
                PipelineStatus::Failed
            }
            _ => PipelineStatus::PrReview,
        };
    }

    /// Mark as skipped.
    pub fn skip(&mut self) {
        self.status = PipelineStatus::Skipped;
        self.completed_at = Some(chrono::Utc::now().to_rfc3339());
    }

    /// Mark as failed with an error message.
    pub fn fail(&mut self, error: &str) {
        self.status = PipelineStatus::Failed;
        self.error = Some(error.to_string());
        self.completed_at = Some(chrono::Utc::now().to_rfc3339());
    }

    /// Check if this item is active (in progress or PR pending).
    pub fn is_active(&self) -> bool {
        matches!(
            self.status,
            PipelineStatus::InProgress | PipelineStatus::PrPending | PipelineStatus::PrReview
        )
    }

    /// Check if this item is complete (finished or skipped/failed).
    pub fn is_complete(&self) -> bool {
        matches!(
            self.status,
            PipelineStatus::Completed | PipelineStatus::Skipped | PipelineStatus::Failed
        )
    }
}

/// Storage for pipeline state.
#[derive(Debug, Clone, Default, Serialize, Deserialize, Type)]
pub struct PipelineState {
    /// Active pipeline items (keyed by item ID)
    pub items: HashMap<String, PipelineItem>,
    /// Completed pipeline items (for history, keyed by item ID)
    pub history: Vec<PipelineItem>,
    /// Maximum history items to keep
    #[serde(default = "default_max_history")]
    pub max_history: usize,
}

fn default_max_history() -> usize {
    100
}

impl PipelineState {
    /// Create a new empty pipeline state.
    pub fn new() -> Self {
        Self {
            items: HashMap::new(),
            history: Vec::new(),
            max_history: default_max_history(),
        }
    }

    /// Add a new pipeline item.
    pub fn add_item(&mut self, item: PipelineItem) {
        self.items.insert(item.id.clone(), item);
    }

    /// Get a pipeline item by ID.
    pub fn get_item(&self, id: &str) -> Option<&PipelineItem> {
        self.items.get(id)
    }

    /// Get a mutable pipeline item by ID.
    pub fn get_item_mut(&mut self, id: &str) -> Option<&mut PipelineItem> {
        self.items.get_mut(id)
    }

    /// Find a pipeline item by issue.
    pub fn find_by_issue(&self, repo: &str, issue_number: u64) -> Option<&PipelineItem> {
        self.items.values().find(|item| {
            (item.tracking_repo == repo || item.work_repo == repo)
                && item.issue_number == issue_number
        })
    }

    /// Find a pipeline item by session name.
    pub fn find_by_session(&self, session_name: &str) -> Option<&PipelineItem> {
        self.items
            .values()
            .find(|item| item.session_name.as_deref() == Some(session_name))
    }

    /// Find a pipeline item by PR.
    pub fn find_by_pr(&self, repo: &str, pr_number: u64) -> Option<&PipelineItem> {
        self.items
            .values()
            .find(|item| item.work_repo == repo && item.pr_number == Some(pr_number))
    }

    /// Find a pipeline item by branch name.
    pub fn find_by_branch(&self, branch_name: &str) -> Option<&PipelineItem> {
        self.items
            .values()
            .find(|item| item.branch_name.as_deref() == Some(branch_name))
    }

    /// Move a completed item to history.
    pub fn archive_item(&mut self, id: &str) -> Option<PipelineItem> {
        if let Some(item) = self.items.remove(id) {
            if item.is_complete() {
                self.history.push(item.clone());
                // Trim history if needed
                while self.history.len() > self.max_history {
                    self.history.remove(0);
                }
            }
            Some(item)
        } else {
            None
        }
    }

    /// Get all active pipeline items.
    pub fn get_active_items(&self) -> Vec<&PipelineItem> {
        self.items
            .values()
            .filter(|item| item.is_active())
            .collect()
    }

    /// Get all items (active and complete but not archived).
    pub fn get_all_items(&self) -> Vec<&PipelineItem> {
        self.items.values().collect()
    }

    /// Get pipeline history.
    pub fn get_history(&self, limit: Option<usize>) -> Vec<&PipelineItem> {
        let limit = limit.unwrap_or(self.history.len());
        self.history.iter().rev().take(limit).collect()
    }

    /// Remove a pipeline item.
    pub fn remove_item(&mut self, id: &str) -> Option<PipelineItem> {
        self.items.remove(id)
    }

    /// Clear completed items from active list and archive them.
    pub fn archive_completed(&mut self) {
        let completed_ids: Vec<String> = self
            .items
            .iter()
            .filter(|(_, item)| item.is_complete())
            .map(|(id, _)| id.clone())
            .collect();

        for id in completed_ids {
            self.archive_item(&id);
        }
    }
}

/// Aggregate pipeline state from multiple sources.
///
/// This function combines data from:
/// - Active tmux sessions
/// - GitHub issues with agent metadata
/// - Known worktrees
/// - Existing pipeline state
pub fn aggregate_pipeline_state(
    existing_state: &PipelineState,
    sessions: &[AgentStatus],
    work_repo: &str,
) -> Vec<PipelineItem> {
    let mut items: HashMap<String, PipelineItem> = existing_state.items.clone();

    // Update existing items with session status
    for session in sessions {
        if let Some(issue_number) = session.issue_number {
            let repo = session.repo.as_deref().unwrap_or(work_repo);

            // Find or create pipeline item for this session
            let item = items.values_mut().find(|item| {
                item.issue_number == issue_number
                    && (item.tracking_repo == repo || item.work_repo == repo)
            });

            if let Some(item) = item {
                // Update session info
                item.session_name = Some(session.session.clone());
                item.worktree_path = session.worktree.clone();
                item.machine_id = Some(session.machine_id.clone());

                // Update status based on session state
                if !item.is_complete() {
                    item.status = PipelineStatus::InProgress;
                }
            }
        }
    }

    items.into_values().collect()
}

/// Detect if a PR was created for a pipeline item by checking branches.
///
/// This is used to auto-link PRs to pipeline items.
pub fn detect_pr_for_item(
    item: &PipelineItem,
    prs: &[GitHubPullRequest],
) -> Option<GitHubPullRequest> {
    if let Some(branch) = &item.branch_name {
        for pr in prs {
            if pr.head_branch == *branch {
                return Some(pr.clone());
            }
        }
    }
    None
}

/// Sync pipeline item with GitHub PR status.
pub fn sync_pr_status(item: &mut PipelineItem, repo: &str) -> Result<bool, String> {
    if let Some(pr_number) = item.pr_number {
        let pr_status = github::get_pr_status(repo, pr_number)?;

        let has_reviewers = pr_status.reviews.pending > 0
            || pr_status.reviews.approved > 0
            || pr_status.reviews.changes_requested > 0;
        let is_approved =
            pr_status.reviews.approved > 0 && pr_status.reviews.changes_requested == 0;

        item.update_pr_status(&pr_status.pr, has_reviewers, is_approved);
        Ok(true)
    } else {
        Ok(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pipeline_item_lifecycle() {
        let issue = GitHubIssue {
            number: 123,
            title: "Test Issue".to_string(),
            body: None,
            state: "open".to_string(),
            url: "https://github.com/test/repo/issues/123".to_string(),
            labels: vec![],
            assignees: vec![],
            author: "testuser".to_string(),
            created_at: "2024-01-01T00:00:00Z".to_string(),
            updated_at: "2024-01-01T00:00:00Z".to_string(),
            repo: "test/repo".to_string(),
        };

        let mut item = PipelineItem::from_issue(&issue, "test/tracking", "test/repo", "claude");
        assert_eq!(item.status, PipelineStatus::Queued);
        assert!(!item.is_active());
        assert!(!item.is_complete());

        item.start_work("session-1", "/tmp/worktree", "issue-123", "machine-1");
        assert_eq!(item.status, PipelineStatus::InProgress);
        assert!(item.is_active());
        assert!(!item.is_complete());

        item.skip();
        assert_eq!(item.status, PipelineStatus::Skipped);
        assert!(!item.is_active());
        assert!(item.is_complete());
    }

    #[test]
    fn test_pipeline_state() {
        let mut state = PipelineState::new();

        let issue = GitHubIssue {
            number: 123,
            title: "Test Issue".to_string(),
            body: None,
            state: "open".to_string(),
            url: "https://github.com/test/repo/issues/123".to_string(),
            labels: vec![],
            assignees: vec![],
            author: "testuser".to_string(),
            created_at: "2024-01-01T00:00:00Z".to_string(),
            updated_at: "2024-01-01T00:00:00Z".to_string(),
            repo: "test/repo".to_string(),
        };

        let item = PipelineItem::from_issue(&issue, "test/tracking", "test/repo", "claude");
        let item_id = item.id.clone();

        state.add_item(item);
        assert!(state.get_item(&item_id).is_some());
        assert!(state.find_by_issue("test/repo", 123).is_some());
    }
}
