//! SVG card builders for `/github` slash commands.
//!
//! Follows the same pattern as `card.rs`: pre-computed display structs →
//! Askama SVG template → resvg PNG rendering via `spawn_blocking`.

use askama::Template;
use jedi::entity::github::{GitHubIssue, GitHubRepo};

use crate::discord::embeds::notice_board_embed::NoticeItem;

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

// ── Templates ───────────────────────────────────────────────────────

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
