//! SVG card builders for `/github` slash commands.
//!
//! Follows the same pattern as `card.rs`: pre-computed display structs →
//! Askama SVG template → resvg PNG rendering via `spawn_blocking`.

use askama::Template;
use jedi::entity::github::{GitHubCommit, GitHubIssue, GitHubPull, GitHubRepo};

use crate::discord::embeds::notice_board_embed::NoticeItem;
use crate::discord::embeds::task_board_embed::TaskItem;

// ── Display structs ─────────────────────────────────────────────────

/// Row in the issues card.
pub struct IssueRow {
    pub number: u64,
    pub title: String,
    pub labels: Vec<LabelBadge>,
    pub assignee: String,
    pub priority_color: String,
}

/// Colored label badge.
pub struct LabelBadge {
    pub name: String,
    pub bg_color: String,
    pub text_color: String,
}

/// Row in the noticeboard card.
pub struct NoticeRow {
    pub number: u64,
    pub title: String,
    pub priority_color: String,
    pub priority_label: String,
    pub stale_days: u64,
    pub reporter: String,
}

/// Row in the pulls card.
pub struct PullRow {
    pub number: u64,
    pub title: String,
    pub title_x: u32,
    pub branch: String,
    pub author: String,
    pub is_draft: bool,
    pub status_color: String,
}

/// Row in the commits card.
pub struct CommitRow {
    pub short_sha: String,
    pub message: String,
    pub author: String,
}

/// Task row within a department section.
pub struct TaskRow {
    pub number: u64,
    pub title: String,
    pub assignee: String,
    pub status_color: String,
}

/// Department section in the taskboard card.
pub struct DepartmentSection {
    pub name: String,
    pub open: usize,
    pub total: usize,
    pub tasks: Vec<TaskRow>,
}

// ── Priority Levels ──────────────────────────────────────────────────

/// Priority level (0-6) derived from `priority:*` labels.
pub fn priority_from_labels(labels: &[jedi::entity::github::GitHubLabel]) -> u8 {
    for label in labels {
        let name = label.name.to_lowercase();
        if name == "priority:emergency" {
            return 6;
        }
        if name == "priority:blocker" {
            return 5;
        }
        if name == "priority:critical" {
            return 4;
        }
        if name == "priority:high" {
            return 3;
        }
        if name == "priority:medium" {
            return 2;
        }
        if name == "priority:low" {
            return 1;
        }
    }
    0
}

/// Get the hex color for a priority level.
pub fn priority_level_color(level: u8) -> &'static str {
    match level {
        1 => "#2ecc71",
        2 => "#f1c40f",
        3 => "#e67e22",
        4 => "#e74c3c",
        5 => "#9b59b6",
        6 => "#c0392b",
        _ => "#30363d",
    }
}

/// Get the label name for a priority level.
pub fn priority_level_label(level: u8) -> &'static str {
    match level {
        1 => "priority:low",
        2 => "priority:medium",
        3 => "priority:high",
        4 => "priority:critical",
        5 => "priority:blocker",
        6 => "priority:emergency",
        _ => "",
    }
}

// ── Templates ───────────────────────────────────────────────────────

#[derive(Template)]
#[template(path = "github/issue_detail_card.svg")]
pub struct IssueDetailCardTemplate {
    pub number: u64,
    pub title: String,
    pub title_x: u32,
    pub state_color: String,
    pub state_label: String,
    pub is_pr: bool,
    pub author: String,
    pub created_at: String,
    pub updated_at: String,
    pub comments: u64,
    pub labels: Vec<LabelBadge>,
    pub assignees: Vec<String>,
    pub body_lines: Vec<String>,
    pub priority_level: u8,
    pub priority_color: String,
}

#[derive(Template)]
#[template(path = "github/issues_card.svg")]
pub struct IssuesCardTemplate {
    pub repo_name: String,
    pub issue_count: usize,
    pub issues: Vec<IssueRow>,
}

#[derive(Template)]
#[template(path = "github/repo_card.svg")]
pub struct RepoCardTemplate {
    pub full_name: String,
    pub description: String,
    pub default_branch: String,
    pub open_issues: u64,
    pub url: String,
}

#[derive(Template)]
#[template(path = "github/noticeboard_card.svg")]
pub struct NoticeboardCardTemplate {
    pub repo_name: String,
    pub notice_count: usize,
    pub notices: Vec<NoticeRow>,
    pub critical_count: usize,
    pub high_count: usize,
    pub header_color: String,
}

#[derive(Template)]
#[template(path = "github/pulls_card.svg")]
pub struct PullsCardTemplate {
    pub repo_name: String,
    pub pull_count: usize,
    pub pulls: Vec<PullRow>,
}

#[derive(Template)]
#[template(path = "github/commits_card.svg")]
pub struct CommitsCardTemplate {
    pub repo_name: String,
    pub commit_count: usize,
    pub commits: Vec<CommitRow>,
}

#[derive(Template)]
#[template(path = "github/taskboard_card.svg")]
pub struct TaskboardCardTemplate {
    pub repo_name: String,
    pub phase_title: String,
    pub open_count: usize,
    pub total_count: usize,
    pub progress_width: u32,
    pub departments: Vec<DepartmentSection>,
}

// ── Builders ────────────────────────────────────────────────────────

pub fn build_issues_card(issues: &[GitHubIssue], repo_name: &str) -> IssuesCardTemplate {
    let rows: Vec<IssueRow> = issues
        .iter()
        .take(10)
        .map(|issue| {
            let labels: Vec<LabelBadge> = issue
                .labels
                .iter()
                .take(3)
                .map(|l| {
                    let bg = l
                        .color
                        .as_deref()
                        .map(|c| format!("#{c}"))
                        .unwrap_or_else(|| "#30363d".to_owned());
                    let text = contrast_color(l.color.as_deref().unwrap_or("30363d"));
                    LabelBadge {
                        name: truncate(&l.name, 10),
                        bg_color: bg,
                        text_color: text,
                    }
                })
                .collect();

            let assignee = issue
                .assignees
                .first()
                .map(|a| a.login.clone())
                .unwrap_or_default();

            let priority_color = priority_color_from_labels(&issue.labels);

            IssueRow {
                number: issue.number,
                title: truncate(&issue.title, 55),
                labels,
                assignee,
                priority_color,
            }
        })
        .collect();

    IssuesCardTemplate {
        repo_name: repo_name.to_owned(),
        issue_count: issues.len(),
        issues: rows,
    }
}

pub fn build_repo_card(repo: &GitHubRepo) -> RepoCardTemplate {
    RepoCardTemplate {
        full_name: repo.full_name.clone(),
        description: truncate(repo.description.as_deref().unwrap_or("No description"), 90),
        default_branch: repo.default_branch.clone(),
        open_issues: repo.open_issues_count,
        url: repo.html_url.clone(),
    }
}

pub fn build_noticeboard_card(notices: &[NoticeItem], repo_name: &str) -> NoticeboardCardTemplate {
    let critical_count = notices
        .iter()
        .filter(|n| n.priority.label() == "CRITICAL")
        .count();
    let high_count = notices
        .iter()
        .filter(|n| n.priority.label() == "HIGH")
        .count();

    let header_color = if critical_count > 0 {
        "#da3633"
    } else if high_count > 0 {
        "#d29922"
    } else {
        "#238636"
    };

    let rows: Vec<NoticeRow> = notices
        .iter()
        .take(9)
        .map(|n| NoticeRow {
            number: n.number,
            title: truncate(&n.title, 50),
            priority_color: format!("#{:06x}", n.priority.color()),
            priority_label: n.priority.label().to_owned(),
            stale_days: n.stale_days.unwrap_or(0),
            reporter: n.reporter.clone(),
        })
        .collect();

    NoticeboardCardTemplate {
        repo_name: repo_name.to_owned(),
        notice_count: notices.len(),
        notices: rows,
        critical_count,
        high_count,
        header_color: header_color.to_owned(),
    }
}

pub fn build_pulls_card(pulls: &[GitHubPull], repo_name: &str) -> PullsCardTemplate {
    let rows: Vec<PullRow> = pulls
        .iter()
        .take(10)
        .map(|pr| {
            let status_color = if pr.draft {
                "#30363d".to_owned()
            } else {
                "#238636".to_owned()
            };
            PullRow {
                number: pr.number,
                title: truncate(&pr.title, 50),
                title_x: if pr.draft { 116 } else { 72 },
                branch: truncate(&pr.head.ref_name, 20),
                author: pr.user.login.clone(),
                is_draft: pr.draft,
                status_color,
            }
        })
        .collect();

    PullsCardTemplate {
        repo_name: repo_name.to_owned(),
        pull_count: pulls.len(),
        pulls: rows,
    }
}

pub fn build_commits_card(commits: &[GitHubCommit], repo_name: &str) -> CommitsCardTemplate {
    let rows: Vec<CommitRow> = commits
        .iter()
        .take(10)
        .map(|c| {
            let first_line = c.commit.message.lines().next().unwrap_or("");
            CommitRow {
                short_sha: c.sha[..7.min(c.sha.len())].to_owned(),
                message: truncate(first_line, 60),
                author: c.commit.author.name.clone(),
            }
        })
        .collect();

    CommitsCardTemplate {
        repo_name: repo_name.to_owned(),
        commit_count: commits.len(),
        commits: rows,
    }
}

pub fn build_taskboard_card(
    tasks: &[TaskItem],
    repo_name: &str,
    phase_title: &str,
) -> TaskboardCardTemplate {
    use std::collections::BTreeMap;

    let mut departments: BTreeMap<&str, Vec<&TaskItem>> = BTreeMap::new();
    for task in tasks {
        departments.entry(&task.department).or_default().push(task);
    }

    let total_count = tasks.len();
    let open_count = tasks.iter().filter(|t| t.status.label() == "OPEN").count();
    let closed_count = total_count - open_count;
    let progress_width = if total_count > 0 {
        ((closed_count as f32 / total_count as f32) * 768.0) as u32
    } else {
        0
    };

    let sections: Vec<DepartmentSection> = departments
        .into_iter()
        .take(6)
        .map(|(name, items)| {
            let dept_open = items.iter().filter(|t| t.status.label() == "OPEN").count();
            let dept_total = items.len();
            let task_rows: Vec<TaskRow> = items
                .iter()
                .take(3)
                .map(|t| TaskRow {
                    number: t.number,
                    title: truncate(&t.title, 50),
                    assignee: t.assignee.clone(),
                    status_color: match t.status.label() {
                        "OPEN" => "#238636".to_owned(),
                        "CLOSED" => "#8b949e".to_owned(),
                        _ => "#8957e5".to_owned(),
                    },
                })
                .collect();
            DepartmentSection {
                name: name.to_owned(),
                open: dept_open,
                total: dept_total,
                tasks: task_rows,
            }
        })
        .collect();

    TaskboardCardTemplate {
        repo_name: repo_name.to_owned(),
        phase_title: phase_title.to_owned(),
        open_count,
        total_count,
        progress_width,
        departments: sections,
    }
}

// ── Blocking PNG renderers ──────────────────────────────────────────

pub fn render_issues_card_blocking(
    issues: &[GitHubIssue],
    repo_name: &str,
    fontdb: &kbve::FontDb,
) -> Result<Vec<u8>, String> {
    let template = build_issues_card(issues, repo_name);
    let svg = template
        .render()
        .map_err(|e| format!("Issues SVG template: {e}"))?;
    kbve::render_svg_to_png(&svg, fontdb).map_err(|e| format!("Issues PNG render: {e}"))
}

pub fn render_repo_card_blocking(
    repo: &GitHubRepo,
    fontdb: &kbve::FontDb,
) -> Result<Vec<u8>, String> {
    let template = build_repo_card(repo);
    let svg = template
        .render()
        .map_err(|e| format!("Repo SVG template: {e}"))?;
    kbve::render_svg_to_png(&svg, fontdb).map_err(|e| format!("Repo PNG render: {e}"))
}

pub fn render_noticeboard_card_blocking(
    notices: &[NoticeItem],
    repo_name: &str,
    fontdb: &kbve::FontDb,
) -> Result<Vec<u8>, String> {
    let template = build_noticeboard_card(notices, repo_name);
    let svg = template
        .render()
        .map_err(|e| format!("Noticeboard SVG template: {e}"))?;
    kbve::render_svg_to_png(&svg, fontdb).map_err(|e| format!("Noticeboard PNG render: {e}"))
}

pub fn render_pulls_card_blocking(
    pulls: &[GitHubPull],
    repo_name: &str,
    fontdb: &kbve::FontDb,
) -> Result<Vec<u8>, String> {
    let template = build_pulls_card(pulls, repo_name);
    let svg = template
        .render()
        .map_err(|e| format!("Pulls SVG template: {e}"))?;
    kbve::render_svg_to_png(&svg, fontdb).map_err(|e| format!("Pulls PNG render: {e}"))
}

pub fn render_commits_card_blocking(
    commits: &[GitHubCommit],
    repo_name: &str,
    fontdb: &kbve::FontDb,
) -> Result<Vec<u8>, String> {
    let template = build_commits_card(commits, repo_name);
    let svg = template
        .render()
        .map_err(|e| format!("Commits SVG template: {e}"))?;
    kbve::render_svg_to_png(&svg, fontdb).map_err(|e| format!("Commits PNG render: {e}"))
}

pub fn render_taskboard_card_blocking(
    tasks: &[TaskItem],
    repo_name: &str,
    phase_title: &str,
    fontdb: &kbve::FontDb,
) -> Result<Vec<u8>, String> {
    let template = build_taskboard_card(tasks, repo_name, phase_title);
    let svg = template
        .render()
        .map_err(|e| format!("Taskboard SVG template: {e}"))?;
    kbve::render_svg_to_png(&svg, fontdb).map_err(|e| format!("Taskboard PNG render: {e}"))
}

pub fn build_issue_detail_card(issue: &GitHubIssue) -> IssueDetailCardTemplate {
    let is_pr = issue.is_pull_request();
    let state_color = match issue.state.as_str() {
        "open" => "#238636",
        "closed" => "#8b949e",
        _ => "#8b949e",
    };
    let state_label = issue.state.to_uppercase();
    let title_x: u32 = if is_pr { 100 } else { 80 };

    let priority = priority_from_labels(&issue.labels);
    let p_color = priority_level_color(priority);

    let labels: Vec<LabelBadge> = issue
        .labels
        .iter()
        .filter(|l| !l.name.starts_with("priority:"))
        .take(8)
        .map(|l| {
            let bg = l
                .color
                .as_deref()
                .map(|c| format!("#{c}"))
                .unwrap_or_else(|| "#30363d".to_owned());
            let text = contrast_color(l.color.as_deref().unwrap_or("30363d"));
            LabelBadge {
                name: truncate(&l.name, 12),
                bg_color: bg,
                text_color: text,
            }
        })
        .collect();

    let assignees: Vec<String> = issue
        .assignees
        .iter()
        .take(4)
        .map(|a| a.login.clone())
        .collect();

    let body_text = issue.body.as_deref().unwrap_or("");
    let body_lines: Vec<String> = body_text
        .lines()
        .filter(|l| !l.trim().is_empty())
        .take(5)
        .map(|l| truncate(l.trim(), 90))
        .collect();

    // Format dates to just YYYY-MM-DD
    let created_short = issue.created_at.get(..10).unwrap_or(&issue.created_at);
    let updated_short = issue.updated_at.get(..10).unwrap_or(&issue.updated_at);

    IssueDetailCardTemplate {
        number: issue.number,
        title: truncate(&issue.title, 60),
        title_x,
        state_color: state_color.to_owned(),
        state_label,
        is_pr,
        author: issue.user.login.clone(),
        created_at: created_short.to_owned(),
        updated_at: updated_short.to_owned(),
        comments: issue.comments,
        labels,
        assignees,
        body_lines,
        priority_level: priority,
        priority_color: p_color.to_owned(),
    }
}

pub fn render_issue_detail_card_blocking(
    issue: &GitHubIssue,
    fontdb: &kbve::FontDb,
) -> Result<Vec<u8>, String> {
    let template = build_issue_detail_card(issue);
    let svg = template
        .render()
        .map_err(|e| format!("Issue detail SVG template: {e}"))?;
    kbve::render_svg_to_png(&svg, fontdb).map_err(|e| format!("Issue detail PNG render: {e}"))
}

// ── Helpers ─────────────────────────────────────────────────────────

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_owned()
    } else {
        format!("{}...", &s[..max.saturating_sub(3)])
    }
}

/// Compute white or black text color based on background luminance.
fn contrast_color(hex: &str) -> String {
    let hex = hex.trim_start_matches('#');
    if hex.len() < 6 {
        return "#fff".to_owned();
    }
    let r = u8::from_str_radix(&hex[0..2], 16).unwrap_or(0) as f32;
    let g = u8::from_str_radix(&hex[2..4], 16).unwrap_or(0) as f32;
    let b = u8::from_str_radix(&hex[4..6], 16).unwrap_or(0) as f32;
    // Relative luminance (sRGB approximation)
    let luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0;
    if luminance > 0.5 {
        "#000".to_owned()
    } else {
        "#fff".to_owned()
    }
}

/// Derive a priority color from issue labels (for the left stripe).
fn priority_color_from_labels(labels: &[jedi::entity::github::GitHubLabel]) -> String {
    for label in labels {
        let name = label.name.to_lowercase();
        if name.contains("critical") || name.contains("blocker") {
            return "#da3633".to_owned();
        }
        if name.contains("high") || name.contains("urgent") || name.contains("bug") {
            return "#d29922".to_owned();
        }
        if name.contains("enhancement") || name.contains("feature") {
            return "#238636".to_owned();
        }
    }
    "#30363d".to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn contrast_color_dark_bg() {
        assert_eq!(contrast_color("0d1117"), "#fff");
        assert_eq!(contrast_color("d73a4a"), "#fff");
    }

    #[test]
    fn contrast_color_light_bg() {
        assert_eq!(contrast_color("ffffff"), "#000");
        assert_eq!(contrast_color("f1c40f"), "#000");
    }

    #[test]
    fn truncate_short() {
        assert_eq!(truncate("hello", 10), "hello");
    }

    #[test]
    fn truncate_long() {
        let result = truncate("this is a very long title that needs truncation", 20);
        assert!(result.len() <= 20);
        assert!(result.ends_with("..."));
    }

    #[test]
    fn priority_color_critical() {
        let labels = vec![jedi::entity::github::GitHubLabel {
            name: "critical".to_owned(),
            color: None,
        }];
        assert_eq!(priority_color_from_labels(&labels), "#da3633");
    }

    #[test]
    fn priority_color_default() {
        assert_eq!(priority_color_from_labels(&[]), "#30363d");
    }
}
