//! `/github` slash commands — notice board and task board embeds
//! powered by the guild's GitHub PAT from Supabase Vault.

use jedi::entity::github::GitHubClient;
use tracing::{info, warn};

use crate::discord::bot::{Context, Error};
use crate::discord::embeds::notice_board_embed::{build_notice_board_summary, notices_from_stale};
use crate::discord::embeds::task_board_embed::{build_task_board_embed, tasks_from_issues};
use crate::discord::github::resolve_github_token;

/// Maximum time for the entire slash command operation (token resolve + API calls).
/// Discord allows 15 minutes after defer, but we want fast feedback.
const COMMAND_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(15);

// ── Helpers ─────────────────────────────────────────────────────────

async fn get_github_client(ctx: Context<'_>) -> Result<GitHubClient, String> {
    let guild_id = ctx
        .guild_id()
        .ok_or_else(|| "This command must be used in a server.".to_string())?;

    let token = resolve_github_token(Some(guild_id.get()))
        .await
        .ok_or_else(|| {
            "No GitHub token configured for this server. A server admin can store one at <https://kbve.com>.".to_string()
        })?;

    let client = GitHubClient::new(&token);
    let client = match std::env::var("GITHUB_API_BASE_URL") {
        Ok(url) if !url.is_empty() => client.with_base_url(&url),
        _ => client,
    };
    Ok(client)
}

async fn send_error(ctx: Context<'_>, msg: &str) -> Result<(), Error> {
    ctx.send(poise::CreateReply::default().content(msg).ephemeral(true))
        .await?;
    Ok(())
}

/// Parse "owner/repo" string, falling back to "KBVE/kbve" if not provided.
fn parse_repo(repo: &Option<String>) -> (&str, &str) {
    match repo.as_deref() {
        Some(r) if r.contains('/') => {
            let parts: Vec<&str> = r.splitn(2, '/').collect();
            (parts[0], parts[1])
        }
        _ => ("KBVE", "kbve"),
    }
}

// ── Parent command ──────────────────────────────────────────────────

/// GitHub project boards — notice board and task board embeds.
#[poise::command(
    slash_command,
    subcommands("noticeboard", "taskboard", "issues", "pulls")
)]
pub async fn github(_ctx: Context<'_>) -> Result<(), Error> {
    Ok(())
}

// ── /github noticeboard ─────────────────────────────────────────────

/// Show blockers and stale issues/PRs for a repository.
#[poise::command(slash_command)]
async fn noticeboard(
    ctx: Context<'_>,
    #[description = "Repository (owner/repo, default: KBVE/kbve)"] repo: Option<String>,
    #[description = "Stale threshold in days (default: 3)"] stale_days: Option<u64>,
) -> Result<(), Error> {
    ctx.defer().await?;

    match tokio::time::timeout(COMMAND_TIMEOUT, async {
        let gh = get_github_client(ctx).await?;
        let (owner, repo_name) = parse_repo(&repo);
        let threshold = stale_days.unwrap_or(3);
        let full_name = format!("{}/{}", owner, repo_name);

        let issues = gh
            .list_issues(owner, repo_name, Some("open"), Some(100))
            .await;
        let pulls = gh
            .list_pulls(owner, repo_name, Some("open"), Some(100))
            .await;

        match (issues, pulls) {
            (Ok(issues), Ok(pulls)) => {
                let notices = notices_from_stale(&issues, &pulls, threshold);

                info!(
                    user = %ctx.author().name,
                    repo = full_name,
                    threshold,
                    notices = notices.len(),
                    "Notice board generated"
                );

                let embed = build_notice_board_summary(&notices, &full_name);
                ctx.send(poise::CreateReply::default().embed(embed))
                    .await
                    .map_err(|e| e.to_string())?;
                Ok(())
            }
            (Err(e), _) | (_, Err(e)) => {
                warn!(error = %e, repo = full_name, "Failed to fetch GitHub data");
                Err(format!(
                    "Failed to fetch data from GitHub for `{}`: {}",
                    full_name, e
                ))
            }
        }
    })
    .await
    {
        Ok(Ok(())) => Ok(()),
        Ok(Err(msg)) => send_error(ctx, &msg).await,
        Err(_) => {
            warn!("noticeboard command timed out");
            send_error(
                ctx,
                "The request timed out. The vault or GitHub API may be slow — please try again.",
            )
            .await
        }
    }
}

// ── /github taskboard ───────────────────────────────────────────────

/// Show task progress grouped by department for a repository.
#[poise::command(slash_command)]
async fn taskboard(
    ctx: Context<'_>,
    #[description = "Repository (owner/repo, default: KBVE/kbve)"] repo: Option<String>,
    #[description = "Phase/milestone name (shown in title)"] phase: Option<String>,
) -> Result<(), Error> {
    ctx.defer().await?;

    match tokio::time::timeout(COMMAND_TIMEOUT, async {
        let gh = get_github_client(ctx).await?;
        let (owner, repo_name) = parse_repo(&repo);
        let full_name = format!("{}/{}", owner, repo_name);
        let phase_title = phase.as_deref().unwrap_or("Current Phase");

        let issues = gh
            .list_issues(owner, repo_name, Some("open"), Some(100))
            .await;

        match issues {
            Ok(issues) => {
                let tasks = tasks_from_issues(&issues);

                info!(
                    user = %ctx.author().name,
                    repo = full_name,
                    tasks = tasks.len(),
                    "Task board generated"
                );

                let repo_url = format!("https://github.com/{}", full_name);
                let embed = build_task_board_embed(&tasks, phase_title, "", &repo_url);
                ctx.send(poise::CreateReply::default().embed(embed))
                    .await
                    .map_err(|e| e.to_string())?;
                Ok(())
            }
            Err(e) => {
                warn!(error = %e, repo = full_name, "Failed to fetch GitHub issues");
                Err(format!(
                    "Failed to fetch issues from GitHub for `{}`: {}",
                    full_name, e
                ))
            }
        }
    })
    .await
    {
        Ok(Ok(())) => Ok(()),
        Ok(Err(msg)) => send_error(ctx, &msg).await,
        Err(_) => {
            warn!("taskboard command timed out");
            send_error(
                ctx,
                "The request timed out. The vault or GitHub API may be slow — please try again.",
            )
            .await
        }
    }
}

// ── /github issues ──────────────────────────────────────────────────

/// List open issues for a repository.
#[poise::command(slash_command)]
async fn issues(
    ctx: Context<'_>,
    #[description = "Repository (owner/repo, default: KBVE/kbve)"] repo: Option<String>,
    #[description = "Max results (default: 10, max: 25)"] limit: Option<u8>,
) -> Result<(), Error> {
    ctx.defer().await?;

    match tokio::time::timeout(COMMAND_TIMEOUT, async {
        let gh = get_github_client(ctx).await?;
        let (owner, repo_name) = parse_repo(&repo);
        let full_name = format!("{}/{}", owner, repo_name);
        let count = limit.unwrap_or(10).min(25);

        match gh
            .list_issues(owner, repo_name, Some("open"), Some(count))
            .await
        {
            Ok(issues) => {
                let mut embed = poise::serenity_prelude::CreateEmbed::new()
                    .title(format!("Open Issues — {}", full_name))
                    .color(0x238636);

                if issues.is_empty() {
                    embed = embed.description("No open issues!");
                } else {
                    for issue in &issues {
                        let labels = issue
                            .labels
                            .iter()
                            .map(|l| format!("`{}`", l.name))
                            .collect::<Vec<_>>()
                            .join(" ");
                        let label_str = if labels.is_empty() {
                            String::new()
                        } else {
                            format!("\n{}", labels)
                        };
                        embed = embed.field(
                            format!("#{} {}", issue.number, truncate(&issue.title, 80)),
                            format!(
                                "by `{}` | [view]({}){label_str}",
                                issue.user.login, issue.html_url
                            ),
                            false,
                        );
                    }
                }

                ctx.send(poise::CreateReply::default().embed(embed))
                    .await
                    .map_err(|e| e.to_string())?;
                Ok(())
            }
            Err(e) => {
                warn!(error = %e, repo = full_name, "Failed to fetch issues");
                Err(format!("Failed to fetch issues for `{}`: {}", full_name, e))
            }
        }
    })
    .await
    {
        Ok(Ok(())) => Ok(()),
        Ok(Err(msg)) => send_error(ctx, &msg).await,
        Err(_) => {
            warn!("issues command timed out");
            send_error(
                ctx,
                "The request timed out. The vault or GitHub API may be slow — please try again.",
            )
            .await
        }
    }
}

// ── /github pulls ───────────────────────────────────────────────────

/// List open pull requests for a repository.
#[poise::command(slash_command)]
async fn pulls(
    ctx: Context<'_>,
    #[description = "Repository (owner/repo, default: KBVE/kbve)"] repo: Option<String>,
    #[description = "Max results (default: 10, max: 25)"] limit: Option<u8>,
) -> Result<(), Error> {
    ctx.defer().await?;

    match tokio::time::timeout(COMMAND_TIMEOUT, async {
        let gh = get_github_client(ctx).await?;
        let (owner, repo_name) = parse_repo(&repo);
        let full_name = format!("{}/{}", owner, repo_name);
        let count = limit.unwrap_or(10).min(25);

        match gh
            .list_pulls(owner, repo_name, Some("open"), Some(count))
            .await
        {
            Ok(pulls) => {
                let mut embed = poise::serenity_prelude::CreateEmbed::new()
                    .title(format!("Open PRs — {}", full_name))
                    .color(0x8957E5);

                if pulls.is_empty() {
                    embed = embed.description("No open pull requests!");
                } else {
                    for pr in &pulls {
                        let draft = if pr.draft { " (draft)" } else { "" };
                        embed = embed.field(
                            format!("#{} {}{}", pr.number, truncate(&pr.title, 80), draft),
                            format!(
                                "by `{}` → `{}` | [view]({})",
                                pr.user.login, pr.head.ref_name, pr.html_url
                            ),
                            false,
                        );
                    }
                }

                ctx.send(poise::CreateReply::default().embed(embed))
                    .await
                    .map_err(|e| e.to_string())?;
                Ok(())
            }
            Err(e) => {
                warn!(error = %e, repo = full_name, "Failed to fetch PRs");
                Err(format!("Failed to fetch PRs for `{}`: {}", full_name, e))
            }
        }
    })
    .await
    {
        Ok(Ok(())) => Ok(()),
        Ok(Err(msg)) => send_error(ctx, &msg).await,
        Err(_) => {
            warn!("pulls command timed out");
            send_error(
                ctx,
                "The request timed out. The vault or GitHub API may be slow — please try again.",
            )
            .await
        }
    }
}

// ── Helpers ─────────────────────────────────────────────────────────

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        format!("{}…", &s[..max - 1])
    }
}
