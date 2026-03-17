//! Notice Board embed — surfaces blockers, stagnation, and coordination issues
//! from GitHub issues/PRs as rich Discord embeds.

use jedi::entity::github::{GitHubClient, GitHubIssue, GitHubPull};
use poise::serenity_prelude as serenity;

// ── Priority ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NoticePriority {
    Critical,
    High,
    Medium,
    Low,
}

impl NoticePriority {
    pub fn color(self) -> u32 {
        match self {
            Self::Critical => 0xE74C3C, // red
            Self::High => 0xE67E22,     // orange
            Self::Medium => 0xF1C40F,   // yellow
            Self::Low => 0x2ECC71,      // green
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Critical => "CRITICAL",
            Self::High => "HIGH",
            Self::Medium => "MEDIUM",
            Self::Low => "LOW",
        }
    }

    /// Derive priority from GitHub labels (case-insensitive).
    pub fn from_labels(labels: &[jedi::entity::github::GitHubLabel]) -> Self {
        for label in labels {
            let name = label.name.to_lowercase();
            if name.contains("critical") || name.contains("blocker") {
                return Self::Critical;
            }
            if name.contains("high") || name.contains("urgent") {
                return Self::High;
            }
            if name.contains("medium") {
                return Self::Medium;
            }
            if name.contains("low") {
                return Self::Low;
            }
        }
        Self::Medium
    }
}

// ── Notice Item ─────────────────────────────────────────────────────

/// A single notice board entry derived from a GitHub issue or PR.
pub struct NoticeItem {
    pub number: u64,
    pub title: String,
    pub description: String,
    pub priority: NoticePriority,
    pub reporter: String,
    pub html_url: String,
    pub labels: Vec<String>,
    pub stale_days: Option<u64>,
    pub updated_at: String,
}

impl NoticeItem {
    /// Create a notice from a GitHub issue.
    pub fn from_issue(issue: &GitHubIssue, stale_days: Option<u64>) -> Self {
        Self {
            number: issue.number,
            title: issue.title.clone(),
            description: truncate(&issue.title, 200),
            priority: NoticePriority::from_labels(&issue.labels),
            reporter: issue.user.login.clone(),
            html_url: issue.html_url.clone(),
            labels: issue.labels.iter().map(|l| l.name.clone()).collect(),
            stale_days,
            updated_at: issue.updated_at.clone(),
        }
    }

    /// Create a notice from a GitHub pull request.
    pub fn from_pull(pull: &GitHubPull, stale_days: Option<u64>) -> Self {
        Self {
            number: pull.number,
            title: format!("PR: {}", pull.title),
            description: truncate(&pull.title, 200),
            priority: NoticePriority::High,
            reporter: pull.user.login.clone(),
            html_url: pull.html_url.clone(),
            labels: Vec::new(),
            stale_days,
            updated_at: pull.updated_at.clone(),
        }
    }
}

// ── Embed Builders ──────────────────────────────────────────────────

/// Build a single notice board embed for one item.
pub fn build_notice_embed(item: &NoticeItem, repo_name: &str) -> serenity::CreateEmbed {
    let mut embed = serenity::CreateEmbed::new()
        .title(truncate(&item.title, 256))
        .url(&item.html_url)
        .color(item.priority.color())
        .field("Ticket", format!("`#{}`", item.number), true)
        .field("Priority", format!("`{}`", item.priority.label()), true)
        .field("Reporter", format!("`{}`", item.reporter), true);

    if !item.labels.is_empty() {
        let labels_str = item
            .labels
            .iter()
            .map(|l| format!("`{l}`"))
            .collect::<Vec<_>>()
            .join(", ");
        embed = embed.field("Labels", labels_str, false);
    }

    if let Some(days) = item.stale_days {
        embed = embed.field(
            "Stagnation",
            format!("`{days} days`\nLast activity: `{}`", item.updated_at),
            false,
        );
    }

    embed = embed.footer(serenity::CreateEmbedFooter::new(format!(
        "Notice Board • {}",
        repo_name
    )));

    embed
}

/// Build a summary embed listing multiple notices (compact view).
pub fn build_notice_board_summary(items: &[NoticeItem], repo_name: &str) -> serenity::CreateEmbed {
    let critical_count = items
        .iter()
        .filter(|i| i.priority == NoticePriority::Critical)
        .count();
    let high_count = items
        .iter()
        .filter(|i| i.priority == NoticePriority::High)
        .count();

    let color = if critical_count > 0 {
        0xE74C3C
    } else if high_count > 0 {
        0xE67E22
    } else {
        0x2ECC71
    };

    let mut embed = serenity::CreateEmbed::new()
        .title(format!("Notice Board — {}", repo_name))
        .color(color);

    if items.is_empty() {
        embed = embed.description("No active notices. All clear!");
        return embed;
    }

    embed = embed.description(format!(
        "**{}** notice(s) — {} critical, {} high",
        items.len(),
        critical_count,
        high_count
    ));

    // Group up to 25 items (Discord embed field limit)
    for item in items.iter().take(25) {
        let stale_tag = item
            .stale_days
            .map(|d| format!(" — stale {d}d"))
            .unwrap_or_default();

        embed = embed.field(
            format!(
                "[{}] #{} {}",
                item.priority.label(),
                item.number,
                truncate(&item.title, 100)
            ),
            format!(
                "by `{}` | [view]({}){stale_tag}",
                item.reporter, item.html_url
            ),
            false,
        );
    }

    if items.len() > 25 {
        embed = embed.footer(serenity::CreateEmbedFooter::new(format!(
            "Showing 25 of {} • {}",
            items.len(),
            repo_name
        )));
    } else {
        embed = embed.footer(serenity::CreateEmbedFooter::new(format!(
            "Notice Board • {}",
            repo_name
        )));
    }

    embed
}

/// Build notice items from stale issues and PRs using the GitHubClient helpers.
pub fn notices_from_stale(
    issues: &[GitHubIssue],
    pulls: &[GitHubPull],
    threshold_days: u64,
) -> Vec<NoticeItem> {
    let mut notices = Vec::new();

    let stale_issues = GitHubClient::stale_issues(issues, threshold_days);
    for issue in stale_issues {
        let days = days_since_update(&issue.updated_at).unwrap_or(0);
        notices.push(NoticeItem::from_issue(issue, Some(days)));
    }

    let stale_pulls = GitHubClient::stale_pulls(pulls, threshold_days);
    for pull in stale_pulls {
        let days = days_since_update(&pull.updated_at).unwrap_or(0);
        notices.push(NoticeItem::from_pull(pull, Some(days)));
    }

    // Sort by priority (critical first), then by stale days (most stale first)
    notices.sort_by(|a, b| {
        (a.priority as u8)
            .cmp(&(b.priority as u8))
            .then_with(|| b.stale_days.unwrap_or(0).cmp(&a.stale_days.unwrap_or(0)))
    });

    notices
}

// ── Helpers ─────────────────────────────────────────────────────────

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        format!("{}…", &s[..max - 1])
    }
}

fn days_since_update(updated_at: &str) -> Option<u64> {
    let dt = chrono::DateTime::parse_from_rfc3339(updated_at)
        .ok()?
        .with_timezone(&chrono::Utc);
    let diff: chrono::TimeDelta = chrono::Utc::now() - dt;
    Some(diff.num_days().max(0) as u64)
}
