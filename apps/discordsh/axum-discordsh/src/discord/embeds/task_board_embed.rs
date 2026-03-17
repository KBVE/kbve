//! Task Board embed — renders phase-based project tracking with per-department
//! task breakdowns from GitHub issues as rich Discord embeds.

use jedi::entity::github::GitHubIssue;
use poise::serenity_prelude as serenity;
use std::collections::BTreeMap;

// ── Task Status ─────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy)]
pub enum TaskStatus {
    Open,
    Closed,
    Merged,
}

impl TaskStatus {
    pub fn label(self) -> &'static str {
        match self {
            Self::Open => "OPEN",
            Self::Closed => "CLOSED",
            Self::Merged => "MERGED",
        }
    }

    pub fn from_issue(issue: &GitHubIssue) -> Self {
        match issue.state.as_str() {
            "closed" => Self::Closed,
            _ => Self::Open,
        }
    }
}

// ── Task Item ───────────────────────────────────────────────────────

/// A single task derived from a GitHub issue.
pub struct TaskItem {
    pub number: u64,
    pub title: String,
    pub status: TaskStatus,
    pub assignee: String,
    pub html_url: String,
    pub department: String,
}

impl TaskItem {
    /// Create a task from a GitHub issue.
    ///
    /// Department is derived from labels matching known department names,
    /// or falls back to "General".
    pub fn from_issue(issue: &GitHubIssue) -> Self {
        let department = extract_department(&issue.labels);
        let assignee = issue.user.login.clone();

        Self {
            number: issue.number,
            title: issue.title.clone(),
            status: TaskStatus::from_issue(issue),
            assignee,
            html_url: issue.html_url.clone(),
            department,
        }
    }
}

// ── Embed Builder ───────────────────────────────────────────────────

/// Build a task board embed grouping issues by department label.
pub fn build_task_board_embed(
    items: &[TaskItem],
    phase_title: &str,
    phase_description: &str,
    repo_url: &str,
) -> serenity::CreateEmbed {
    let mut embed = serenity::CreateEmbed::new()
        .title(format!("Task Board — {}", phase_title))
        .description(phase_description)
        .color(0x3498DB);

    if items.is_empty() {
        embed = embed.field("No Tasks", "No tasks found for this phase.", false);
        return add_footer(embed, repo_url);
    }

    // Group by department (BTreeMap for consistent ordering)
    let mut departments: BTreeMap<&str, Vec<&TaskItem>> = BTreeMap::new();
    for item in items {
        departments.entry(&item.department).or_default().push(item);
    }

    for (dept, tasks) in &departments {
        let mut lines = Vec::with_capacity(tasks.len());
        for task in tasks {
            let title = truncate(&task.title, 80);
            lines.push(format!(
                "• [***{}***]({}) — **{}** — ***Status: {}***",
                title,
                task.html_url,
                task.assignee,
                task.status.label()
            ));
        }

        // Discord field value limit is 1024 chars
        let value = truncate_value(&lines.join("\n"), 1024);
        embed = embed.field(dept.to_string(), value, false);
    }

    // Summary counts
    let open = items
        .iter()
        .filter(|i| matches!(i.status, TaskStatus::Open))
        .count();
    let closed = items
        .iter()
        .filter(|i| matches!(i.status, TaskStatus::Closed | TaskStatus::Merged))
        .count();
    embed = embed.field(
        "Progress",
        format!("{closed}/{} completed", items.len()),
        true,
    );
    embed = embed.field("Open", format!("{open}"), true);

    add_footer(embed, repo_url)
}

/// Build task items from a list of GitHub issues.
pub fn tasks_from_issues(issues: &[GitHubIssue]) -> Vec<TaskItem> {
    issues.iter().map(TaskItem::from_issue).collect()
}

// ── Helpers ─────────────────────────────────────────────────────────

const DEPARTMENTS: &[&str] = &[
    "programming",
    "3d art",
    "narrative",
    "design",
    "audio",
    "qa",
    "devops",
    "infrastructure",
];

fn extract_department(labels: &[jedi::entity::github::GitHubLabel]) -> String {
    for label in labels {
        let lower = label.name.to_lowercase();
        for dept in DEPARTMENTS {
            if lower.contains(dept) {
                // Capitalize first letter
                let mut chars = dept.chars();
                match chars.next() {
                    Some(c) => {
                        return format!("{}{}", c.to_uppercase(), chars.as_str());
                    }
                    None => continue,
                }
            }
        }
    }
    "General".to_string()
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        format!("{}…", &s[..max - 1])
    }
}

fn truncate_value(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        let truncated = &s[..max.saturating_sub(20)];
        // Try to cut at a newline boundary
        match truncated.rfind('\n') {
            Some(pos) => format!("{}\n*…and more*", &truncated[..pos]),
            None => format!("{}…", &truncated[..max.saturating_sub(2)]),
        }
    }
}

fn add_footer(embed: serenity::CreateEmbed, repo_url: &str) -> serenity::CreateEmbed {
    embed
        .field("Repository", repo_url, false)
        .footer(serenity::CreateEmbedFooter::new("Task Board"))
}
