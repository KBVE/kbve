//! Task Board embed — renders phase-based project tracking with per-department
//! task breakdowns from GitHub issues as rich Discord embeds.

use jedi::entity::github::GitHubIssue;
use poise::serenity_prelude as serenity;
use std::collections::BTreeMap;

use crate::discord::branding;

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
        .footer(serenity::CreateEmbedFooter::new(format!(
            "Task Board • {}",
            branding::footer_text()
        )))
}

#[cfg(test)]
mod tests {
    use super::*;
    use jedi::entity::github::{GitHubLabel, GitHubUser};

    fn make_issue(number: u64, state: &str, labels: Vec<&str>) -> GitHubIssue {
        GitHubIssue {
            number,
            title: format!("Task #{number}"),
            state: state.to_string(),
            user: GitHubUser {
                login: "dev".to_string(),
            },
            labels: labels
                .into_iter()
                .map(|n| GitHubLabel {
                    name: n.to_string(),
                    color: None,
                })
                .collect(),
            created_at: "2026-01-01T00:00:00Z".to_string(),
            updated_at: "2026-01-02T00:00:00Z".to_string(),
            html_url: format!("https://github.com/test/repo/issues/{number}"),
            pull_request: None,
            assignees: Vec::new(),
            body: None,
            comments: 0,
            issue_type: None,
        }
    }

    // ── TaskStatus ───────────────────────────────────────────────────

    #[test]
    fn status_open() {
        let issue = make_issue(1, "open", vec![]);
        assert!(matches!(TaskStatus::from_issue(&issue), TaskStatus::Open));
    }

    #[test]
    fn status_closed() {
        let issue = make_issue(1, "closed", vec![]);
        assert!(matches!(TaskStatus::from_issue(&issue), TaskStatus::Closed));
    }

    // ── Department extraction ────────────────────────────────────────

    #[test]
    fn extract_dept_programming() {
        let labels = vec![GitHubLabel {
            name: "programming".to_string(),
            color: None,
        }];
        assert_eq!(extract_department(&labels), "Programming");
    }

    #[test]
    fn extract_dept_3d_art() {
        let labels = vec![GitHubLabel {
            name: "3d art".to_string(),
            color: None,
        }];
        assert_eq!(extract_department(&labels), "3d art");
    }

    #[test]
    fn extract_dept_devops_case_insensitive() {
        let labels = vec![GitHubLabel {
            name: "DevOps".to_string(),
            color: None,
        }];
        assert_eq!(extract_department(&labels), "Devops");
    }

    #[test]
    fn extract_dept_fallback_general() {
        let labels = vec![GitHubLabel {
            name: "enhancement".to_string(),
            color: None,
        }];
        assert_eq!(extract_department(&labels), "General");
    }

    #[test]
    fn extract_dept_empty_labels() {
        assert_eq!(extract_department(&[]), "General");
    }

    // ── TaskItem ─────────────────────────────────────────────────────

    #[test]
    fn task_from_issue_fields() {
        let issue = make_issue(42, "open", vec!["programming"]);
        let task = TaskItem::from_issue(&issue);
        assert_eq!(task.number, 42);
        assert_eq!(task.assignee, "dev");
        assert_eq!(task.department, "Programming");
        assert!(matches!(task.status, TaskStatus::Open));
    }

    // ── tasks_from_issues ────────────────────────────────────────────

    #[test]
    fn tasks_from_issues_maps_all() {
        let issues = vec![
            make_issue(1, "open", vec!["programming"]),
            make_issue(2, "closed", vec!["qa"]),
            make_issue(3, "open", vec![]),
        ];
        let tasks = tasks_from_issues(&issues);
        assert_eq!(tasks.len(), 3);
        assert!(matches!(tasks[1].status, TaskStatus::Closed));
        assert_eq!(tasks[2].department, "General");
    }

    // ── build_task_board_embed ────────────────────────────────────────

    #[test]
    fn task_board_empty_shows_no_tasks() {
        let embed = build_task_board_embed(&[], "Phase 0", "", "https://github.com/t/r");
        let json = serde_json::to_string(&embed).unwrap();
        assert!(json.contains("No Tasks") || json.contains("No tasks"));
    }

    #[test]
    fn task_board_groups_by_department() {
        let issues = vec![
            make_issue(1, "open", vec!["programming"]),
            make_issue(2, "open", vec!["qa"]),
            make_issue(3, "closed", vec!["programming"]),
        ];
        let tasks = tasks_from_issues(&issues);
        let embed = build_task_board_embed(&tasks, "Phase 1", "", "https://github.com/t/r");
        let json = serde_json::to_string(&embed).unwrap();
        assert!(json.contains("Programming"));
        assert!(json.contains("Qa"));
        assert!(json.contains("Progress"));
    }

    #[test]
    fn task_board_shows_correct_progress() {
        let issues = vec![
            make_issue(1, "open", vec![]),
            make_issue(2, "closed", vec![]),
            make_issue(3, "closed", vec![]),
        ];
        let tasks = tasks_from_issues(&issues);
        let embed = build_task_board_embed(&tasks, "Test", "", "https://github.com/t/r");
        let json = serde_json::to_string(&embed).unwrap();
        // 2 closed out of 3 total
        assert!(json.contains("2/3 completed"));
    }

    // ── truncate helpers ─────────────────────────────────────────────

    #[test]
    fn truncate_short() {
        assert_eq!(truncate("short", 100), "short");
    }

    #[test]
    fn truncate_long() {
        let long = "a".repeat(100);
        let result = truncate(&long, 50);
        assert!(result.len() <= 52);
        assert!(result.ends_with('…'));
    }

    #[test]
    fn truncate_value_respects_limit() {
        let long = (0..50)
            .map(|i| format!("line {i}"))
            .collect::<Vec<_>>()
            .join("\n");
        let result = truncate_value(&long, 100);
        assert!(result.len() <= 120);
    }
}
