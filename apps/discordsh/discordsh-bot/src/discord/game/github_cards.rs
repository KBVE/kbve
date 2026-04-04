//! SVG card builders for `/github` slash commands.
//!
//! Follows the same pattern as `card.rs`: pre-computed display structs →
//! Askama SVG template → resvg PNG rendering via `spawn_blocking`.

use askama::Template;
use jedi::entity::github::{GitHubCommit, GitHubIssue, GitHubPull, GitHubRepo};
use std::collections::HashMap;

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

// ── Issue Type Helpers ───────────────────────────────────────────────

/// Default issue types available in GitHub orgs.
pub const ISSUE_TYPES: &[&str] = &["Bug", "Feature", "Task"];

/// Map a GitHub issue type color name to a hex color.
pub fn issue_type_color(color: Option<&str>, name: &str) -> &'static str {
    // GitHub returns color as an enum name (gray, blue, green, etc.)
    match color {
        Some("red") => "#da3633",
        Some("orange") => "#d29922",
        Some("yellow") => "#f1c40f",
        Some("green") => "#238636",
        Some("blue") => "#1f6feb",
        Some("purple") => "#8957e5",
        Some("pink") => "#bf3989",
        Some("gray") => "#6e7681",
        _ => {
            // Fallback: derive from name
            match name.to_lowercase().as_str() {
                "bug" => "#da3633",
                "feature" => "#238636",
                "task" => "#1f6feb",
                _ => "#6e7681",
            }
        }
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
    pub type_name: String,
    pub type_color: String,
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
        type_name: issue
            .issue_type
            .as_ref()
            .map(|t| t.name.clone())
            .unwrap_or_default(),
        type_color: issue
            .issue_type
            .as_ref()
            .map(|t| issue_type_color(t.color.as_deref(), &t.name).to_owned())
            .unwrap_or_default(),
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

// ═══════════════════════════════════════════════════════════════════
// Chart Cards — on-demand visualizations triggered by button clicks
// ═══════════════════════════════════════════════════════════════════

// ── Languages Chart ────────────────────────────────────────────────

/// GitHub language colors (top languages only; fallback to gray).
fn language_color(name: &str) -> &'static str {
    match name.to_lowercase().as_str() {
        "rust" => "#dea584",
        "typescript" => "#3178c6",
        "javascript" => "#f1e05a",
        "python" => "#3572a5",
        "go" => "#00add8",
        "java" => "#b07219",
        "c++" | "cpp" => "#f34b7d",
        "c" => "#555555",
        "c#" | "csharp" => "#178600",
        "ruby" => "#701516",
        "swift" => "#f05138",
        "kotlin" => "#a97bff",
        "dart" => "#00b4ab",
        "shell" | "bash" => "#89e051",
        "html" => "#e34c26",
        "css" | "scss" => "#563d7c",
        "lua" => "#000080",
        "astro" => "#ff5a03",
        "svelte" => "#ff3e00",
        "mdx" => "#fcb32c",
        "nix" => "#7e7eff",
        "dockerfile" => "#384d54",
        "protobuf" | "proto" => "#ccc",
        "makefile" => "#427819",
        _ => "#8b949e",
    }
}

fn format_bytes(bytes: u64) -> String {
    if bytes >= 1_000_000 {
        format!("{:.1}MB", bytes as f64 / 1_000_000.0)
    } else if bytes >= 1_000 {
        format!("{:.1}KB", bytes as f64 / 1_000.0)
    } else {
        format!("{}B", bytes)
    }
}

pub struct LanguageBarSegment {
    pub x: f64,
    pub width: f64,
    pub color: String,
}

pub struct LanguageRow {
    pub name: String,
    pub percent: String,
    pub color: String,
    pub bar_width: f64,
    pub bytes_display: String,
    pub label_x: f64,
    pub y: u32,
}

#[derive(Template)]
#[template(path = "github/languages_chart.svg")]
pub struct LanguagesChartTemplate {
    pub repo_name: String,
    pub total_bytes_display: String,
    pub languages: Vec<LanguageRow>,
    pub bar_segments: Vec<LanguageBarSegment>,
    pub height: u32,
    pub footer_y: u32,
    pub brand_y: u32,
}

pub fn build_languages_chart(
    lang_map: &HashMap<String, u64>,
    repo_name: &str,
) -> LanguagesChartTemplate {
    let total: u64 = lang_map.values().sum();
    let mut sorted: Vec<_> = lang_map.iter().collect();
    sorted.sort_by(|a, b| b.1.cmp(a.1));
    let sorted = &sorted[..sorted.len().min(12)]; // top 12

    let max_bar = 480.0;

    // Stacked bar segments
    let mut bar_segments = Vec::new();
    let mut seg_x = 0.0;
    let bar_total_width = 744.0;
    for (name, bytes) in sorted {
        let bytes = **bytes;
        let frac = if total > 0 {
            bytes as f64 / total as f64
        } else {
            0.0
        };
        let w = (frac * bar_total_width).max(1.0);
        bar_segments.push(LanguageBarSegment {
            x: seg_x,
            width: w,
            color: language_color(name).to_owned(),
        });
        seg_x += w;
    }

    // Individual rows
    let languages: Vec<LanguageRow> = sorted
        .iter()
        .enumerate()
        .map(|(i, (name, bytes))| {
            let bytes = **bytes;
            let pct = if total > 0 {
                (bytes as f64 / total as f64) * 100.0
            } else {
                0.0
            };
            let bw = (pct / 100.0) * max_bar;
            LanguageRow {
                name: name.to_string(),
                percent: format!("{:.1}", pct),
                color: language_color(name).to_owned(),
                bar_width: bw.max(2.0),
                bytes_display: format_bytes(bytes),
                label_x: 260.0 + bw.max(2.0) + 8.0,
                y: 100 + (i as u32 * 28),
            }
        })
        .collect();

    let row_count = languages.len() as u32;
    let height = 100 + row_count * 28 + 30;

    LanguagesChartTemplate {
        repo_name: repo_name.to_owned(),
        total_bytes_display: format_bytes(total),
        languages,
        bar_segments,
        height,
        footer_y: height - 8,
        brand_y: height - 14,
    }
}

pub fn render_languages_chart_blocking(
    lang_map: &HashMap<String, u64>,
    repo_name: &str,
    fontdb: &kbve::FontDb,
) -> Result<Vec<u8>, String> {
    let template = build_languages_chart(lang_map, repo_name);
    let svg = template
        .render()
        .map_err(|e| format!("Languages chart SVG: {e}"))?;
    kbve::render_svg_to_png(&svg, fontdb).map_err(|e| format!("Languages chart PNG: {e}"))
}

// ── Label Distribution Chart ───────────────────────────────────────

pub struct LabelChartRow {
    pub name: String,
    pub color: String,
    pub count: u64,
    pub bar_width: f64,
    pub count_x: f64,
    pub y: u32,
}

#[derive(Template)]
#[template(path = "github/label_chart.svg")]
pub struct LabelChartTemplate {
    pub repo_name: String,
    pub total_issues: usize,
    pub label_count: usize,
    pub labels: Vec<LabelChartRow>,
    pub height: u32,
    pub footer_y: u32,
    pub brand_y: u32,
}

pub fn build_label_chart(issues: &[GitHubIssue], repo_name: &str) -> LabelChartTemplate {
    // Count issues per label
    let mut counts: HashMap<String, (u64, String)> = HashMap::new();
    for issue in issues {
        for label in &issue.labels {
            let entry = counts.entry(label.name.clone()).or_insert((
                0,
                label.color.clone().unwrap_or_else(|| "8b949e".to_owned()),
            ));
            entry.0 += 1;
        }
    }

    let mut sorted: Vec<_> = counts.into_iter().collect();
    sorted.sort_by(|a, b| b.1.0.cmp(&a.1.0));
    let sorted = &sorted[..sorted.len().min(15)]; // top 15

    let max_count = sorted.first().map(|(_, (c, _))| *c).unwrap_or(1);
    let max_bar = 480.0;

    let labels: Vec<LabelChartRow> = sorted
        .iter()
        .enumerate()
        .map(|(i, (name, (count, color)))| {
            let bw = (*count as f64 / max_count as f64) * max_bar;
            LabelChartRow {
                name: truncate(name, 25),
                color: color.clone(),
                count: *count,
                bar_width: bw.max(4.0),
                count_x: 220.0 + bw.max(4.0) + 8.0,
                y: 75 + (i as u32 * 28),
            }
        })
        .collect();

    let row_count = labels.len() as u32;
    let height = 75 + row_count * 28 + 30;

    LabelChartTemplate {
        repo_name: repo_name.to_owned(),
        total_issues: issues.len(),
        label_count: labels.len(),
        labels,
        height,
        footer_y: height - 8,
        brand_y: height - 14,
    }
}

pub fn render_label_chart_blocking(
    issues: &[GitHubIssue],
    repo_name: &str,
    fontdb: &kbve::FontDb,
) -> Result<Vec<u8>, String> {
    let template = build_label_chart(issues, repo_name);
    let svg = template
        .render()
        .map_err(|e| format!("Label chart SVG: {e}"))?;
    kbve::render_svg_to_png(&svg, fontdb).map_err(|e| format!("Label chart PNG: {e}"))
}

// ── Activity Chart ─────────────────────────────────────────────────

pub struct ActivityBar {
    pub x: f64,
    pub width: f64,
    pub opened_y: f64,
    pub opened_h: f64,
    pub closed_x: f64,
    pub closed_y: f64,
    pub closed_h: f64,
}

pub struct GridLine {
    pub y: f64,
    pub label_y: f64,
    pub value: u32,
}

pub struct XLabel {
    pub x: f64,
    pub text: String,
}

#[derive(Template)]
#[template(path = "github/activity_chart.svg")]
pub struct ActivityChartTemplate {
    pub repo_name: String,
    pub day_count: usize,
    pub total_opened: u32,
    pub total_closed: u32,
    pub bars: Vec<ActivityBar>,
    pub grid_lines: Vec<GridLine>,
    pub x_labels: Vec<XLabel>,
}

pub fn build_activity_chart(issues: &[GitHubIssue], repo_name: &str) -> ActivityChartTemplate {
    let now = chrono::Utc::now();
    let day_count = 14usize;
    let chart_width = 700.0;
    let chart_height = 180.0;

    // Bucket issues by day offset
    let mut opened_by_day = vec![0u32; day_count];
    let mut closed_by_day = vec![0u32; day_count];

    for issue in issues {
        if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(&issue.created_at) {
            let days_ago = (now - dt.with_timezone(&chrono::Utc)).num_days();
            if days_ago >= 0 && (days_ago as usize) < day_count {
                opened_by_day[day_count - 1 - days_ago as usize] += 1;
            }
        }
        if issue.state == "closed" {
            if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(&issue.updated_at) {
                let days_ago = (now - dt.with_timezone(&chrono::Utc)).num_days();
                if days_ago >= 0 && (days_ago as usize) < day_count {
                    closed_by_day[day_count - 1 - days_ago as usize] += 1;
                }
            }
        }
    }

    let max_val = opened_by_day
        .iter()
        .chain(closed_by_day.iter())
        .copied()
        .max()
        .unwrap_or(1)
        .max(1);

    let bar_group_width = chart_width / day_count as f64;
    let bar_width = (bar_group_width * 0.35).min(20.0);
    let gap = 2.0;

    let bars: Vec<ActivityBar> = (0..day_count)
        .map(|i| {
            let opened = opened_by_day[i];
            let closed = closed_by_day[i];
            let oh = (opened as f64 / max_val as f64) * chart_height;
            let ch = (closed as f64 / max_val as f64) * chart_height;
            let center_x = i as f64 * bar_group_width + bar_group_width / 2.0;
            ActivityBar {
                x: center_x - bar_width - gap / 2.0,
                width: bar_width,
                opened_y: chart_height - oh,
                opened_h: oh,
                closed_x: center_x + gap / 2.0,
                closed_y: chart_height - ch,
                closed_h: ch,
            }
        })
        .collect();

    // Grid lines (3 lines)
    let grid_lines: Vec<GridLine> = (0..=3)
        .map(|i| {
            let val = (max_val as f64 * (1.0 - i as f64 / 3.0)) as u32;
            let y = (i as f64 / 3.0) * chart_height;
            GridLine {
                y,
                label_y: y + 4.0,
                value: val,
            }
        })
        .collect();

    // X-axis labels (every other day)
    let x_labels: Vec<XLabel> = (0..day_count)
        .filter(|i| i % 2 == 0 || *i == day_count - 1)
        .map(|i| {
            let date = now - chrono::Duration::days((day_count - 1 - i) as i64);
            XLabel {
                x: i as f64 * bar_group_width + bar_group_width / 2.0,
                text: date.format("%m/%d").to_string(),
            }
        })
        .collect();

    ActivityChartTemplate {
        repo_name: repo_name.to_owned(),
        day_count,
        total_opened: opened_by_day.iter().sum(),
        total_closed: closed_by_day.iter().sum(),
        bars,
        grid_lines,
        x_labels,
    }
}

pub fn render_activity_chart_blocking(
    issues: &[GitHubIssue],
    repo_name: &str,
    fontdb: &kbve::FontDb,
) -> Result<Vec<u8>, String> {
    let template = build_activity_chart(issues, repo_name);
    let svg = template
        .render()
        .map_err(|e| format!("Activity chart SVG: {e}"))?;
    kbve::render_svg_to_png(&svg, fontdb).map_err(|e| format!("Activity chart PNG: {e}"))
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
