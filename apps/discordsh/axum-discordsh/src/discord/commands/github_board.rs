//! `/github` slash commands — notice board, task board, repo info, commits,
//! issues, and pull request embeds powered by the guild's GitHub PAT.

use askama::Template;
use jedi::entity::github::GitHubClient;
use tracing::{info, warn};

use crate::discord::bot::{Context, Error};
use crate::discord::embeds::notice_board_embed::{build_notice_board_summary, notices_from_stale};
use crate::discord::embeds::task_board_embed::{build_task_board_embed, tasks_from_issues};
use crate::discord::game::github_cards;
use crate::discord::github::resolve_github_token;
use crate::discord::github_permissions::{CommandTier, check_tier, github_permission_check};

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

    let policy = ctx.data().app.github_repo_policy.clone();
    let client = GitHubClient::new(&token).with_policy(policy);
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

/// Parse "owner/repo" from the user argument, falling back to the
/// default repo configured in `AppState` (resolved once at startup
/// from `GITHUB_DEFAULT_REPO` → `GH_REPO` → `KBVE/kbve`).
fn parse_repo(repo: &Option<String>, default: &(String, String)) -> (String, String) {
    match repo.as_deref().filter(|r| r.contains('/')) {
        Some(r) => {
            let (owner, name) = r.split_once('/').unwrap();
            (owner.to_owned(), name.to_owned())
        }
        None => default.clone(),
    }
}

/// Format assignees list for embed display.
fn format_assignees(assignees: &[jedi::entity::github::GitHubUser]) -> String {
    if assignees.is_empty() {
        return String::new();
    }
    let names: Vec<_> = assignees.iter().map(|a| format!("`{}`", a.login)).collect();
    format!(" | assigned: {}", names.join(", "))
}

/// Parse a hex color string (e.g. "d73a4a") to a u32 for Discord embeds.
fn parse_label_color(labels: &[jedi::entity::github::GitHubLabel]) -> Option<u32> {
    labels
        .first()
        .and_then(|l| l.color.as_deref())
        .and_then(|c| u32::from_str_radix(c, 16).ok())
}

// ── Parent command ──────────────────────────────────────────────────

/// GitHub project boards — notice board and task board embeds.
#[poise::command(
    slash_command,
    check = "github_permission_check",
    subcommands("noticeboard", "taskboard", "issues", "pulls", "repo", "commits")
)]
pub async fn github(_ctx: Context<'_>) -> Result<(), Error> {
    Ok(())
}

// ── /github noticeboard ─────────────────────────────────────────────

/// Show blockers and stale issues/PRs for a repository.
#[poise::command(slash_command)]
async fn noticeboard(
    ctx: Context<'_>,
    #[description = "Repository (owner/repo, default from env)"] repo: Option<String>,
    #[description = "Stale threshold in days (default: 3)"] stale_days: Option<u64>,
) -> Result<(), Error> {
    if !check_tier(ctx, CommandTier::Board).await? {
        return Ok(());
    }
    ctx.defer().await?;

    match tokio::time::timeout(COMMAND_TIMEOUT, async {
        let gh = get_github_client(ctx).await?;
        let (owner, repo_name) = parse_repo(&repo, &ctx.data().app.default_repo);
        let threshold = stale_days.unwrap_or(3);
        let full_name = format!("{}/{}", owner, repo_name);

        let issues = gh
            .list_issues(&owner, &repo_name, Some("open"), Some(100))
            .await;
        let pulls = gh
            .list_pulls(&owner, &repo_name, Some("open"), Some(100))
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

                let fontdb = ctx.data().app.fontdb.clone();
                let card_template = github_cards::build_noticeboard_card(&notices, &full_name);

                let png_result = tokio::task::spawn_blocking(move || {
                    let svg = card_template
                        .render()
                        .map_err(|e| format!("Noticeboard SVG template: {e}"))?;
                    kbve::render_svg_to_png(&svg, &fontdb)
                        .map_err(|e| format!("Noticeboard PNG render: {e}"))
                })
                .await
                .map_err(|e| format!("Task panicked: {e}"))?;

                let mut reply = poise::CreateReply::default();

                match png_result {
                    Ok(png_bytes) => {
                        let attachment = poise::serenity_prelude::CreateAttachment::bytes(
                            png_bytes,
                            "noticeboard.png",
                        );
                        let embed = poise::serenity_prelude::CreateEmbed::new()
                            .title(format!("Notice Board — {}", full_name))
                            .image("attachment://noticeboard.png")
                            .color(0xE67E22);
                        reply = reply.embed(embed).attachment(attachment);
                    }
                    Err(e) => {
                        warn!(error = %e, "Noticeboard card render failed, falling back to text");
                        let embed = build_notice_board_summary(&notices, &full_name);
                        reply = reply.embed(embed);
                    }
                }

                ctx.send(reply).await.map_err(|e| e.to_string())?;
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
    #[description = "Repository (owner/repo, default from env)"] repo: Option<String>,
    #[description = "Phase/milestone name (shown in title)"] phase: Option<String>,
) -> Result<(), Error> {
    if !check_tier(ctx, CommandTier::Board).await? {
        return Ok(());
    }
    ctx.defer().await?;

    match tokio::time::timeout(COMMAND_TIMEOUT, async {
        let gh = get_github_client(ctx).await?;
        let (owner, repo_name) = parse_repo(&repo, &ctx.data().app.default_repo);
        let full_name = format!("{}/{}", owner, repo_name);
        let phase_title = phase.as_deref().unwrap_or("Current Phase");

        let issues = gh
            .list_issues(&owner, &repo_name, Some("open"), Some(100))
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
    #[description = "Repository (owner/repo, default from env)"] repo: Option<String>,
    #[description = "Max results (default: 10, max: 25)"] limit: Option<u8>,
) -> Result<(), Error> {
    if !check_tier(ctx, CommandTier::Read).await? {
        return Ok(());
    }
    ctx.defer().await?;

    match tokio::time::timeout(COMMAND_TIMEOUT, async {
        let gh = get_github_client(ctx).await?;
        let (owner, repo_name) = parse_repo(&repo, &ctx.data().app.default_repo);
        let full_name = format!("{}/{}", owner, repo_name);
        let count = limit.unwrap_or(10).min(25);

        match gh
            .list_issues(&owner, &repo_name, Some("open"), Some(count))
            .await
        {
            Ok(issues) => {
                let fontdb = ctx.data().app.fontdb.clone();
                let issues_clone = issues.clone();
                let repo_name_clone = full_name.clone();

                let png_result = tokio::task::spawn_blocking(move || {
                    github_cards::render_issues_card_blocking(
                        &issues_clone,
                        &repo_name_clone,
                        &fontdb,
                    )
                })
                .await
                .map_err(|e| format!("Task panicked: {e}"))?;

                let mut reply = poise::CreateReply::default();

                match png_result {
                    Ok(png_bytes) => {
                        let attachment = poise::serenity_prelude::CreateAttachment::bytes(
                            png_bytes,
                            "issues.png",
                        );
                        let embed = poise::serenity_prelude::CreateEmbed::new()
                            .title(format!("Open Issues — {}", full_name))
                            .image("attachment://issues.png")
                            .color(0x238636);
                        reply = reply.embed(embed).attachment(attachment);
                    }
                    Err(e) => {
                        warn!(error = %e, "Issues card render failed, falling back to text");
                        let mut embed = poise::serenity_prelude::CreateEmbed::new()
                            .title(format!("Open Issues — {}", full_name))
                            .color(0x238636);
                        if issues.is_empty() {
                            embed = embed.description("No open issues!");
                        } else {
                            for issue in &issues {
                                embed = embed.field(
                                    format!("#{} {}", issue.number, truncate(&issue.title, 80)),
                                    format!(
                                        "by `{}` | [view]({})",
                                        issue.user.login, issue.html_url
                                    ),
                                    false,
                                );
                            }
                        }
                        reply = reply.embed(embed);
                    }
                }

                ctx.send(reply).await.map_err(|e| e.to_string())?;
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
    #[description = "Repository (owner/repo, default from env)"] repo: Option<String>,
    #[description = "Max results (default: 10, max: 25)"] limit: Option<u8>,
) -> Result<(), Error> {
    if !check_tier(ctx, CommandTier::Read).await? {
        return Ok(());
    }
    ctx.defer().await?;

    match tokio::time::timeout(COMMAND_TIMEOUT, async {
        let gh = get_github_client(ctx).await?;
        let (owner, repo_name) = parse_repo(&repo, &ctx.data().app.default_repo);
        let full_name = format!("{}/{}", owner, repo_name);
        let count = limit.unwrap_or(10).min(25);

        match gh
            .list_pulls(&owner, &repo_name, Some("open"), Some(count))
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
                        let draft = if pr.draft { " [DRAFT]" } else { "" };
                        let labels = pr
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
                        let assignees = format_assignees(&pr.assignees);
                        embed = embed.field(
                            format!("#{} {}{}", pr.number, truncate(&pr.title, 70), draft),
                            format!(
                                "by `{}` → `{}`{assignees} | [view]({}){label_str}",
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

// ── /github repo ────────────────────────────────────────────────────

/// Show repository info.
#[poise::command(slash_command)]
async fn repo(
    ctx: Context<'_>,
    #[description = "Repository (owner/repo, default from env)"] repo: Option<String>,
) -> Result<(), Error> {
    if !check_tier(ctx, CommandTier::Read).await? {
        return Ok(());
    }
    ctx.defer().await?;

    match tokio::time::timeout(COMMAND_TIMEOUT, async {
        let gh = get_github_client(ctx).await?;
        let (owner, repo_name) = parse_repo(&repo, &ctx.data().app.default_repo);

        match gh.get_repo(&owner, &repo_name).await {
            Ok(info) => {
                let fontdb = ctx.data().app.fontdb.clone();
                let info_clone = info.clone();

                let png_result = tokio::task::spawn_blocking(move || {
                    github_cards::render_repo_card_blocking(&info_clone, &fontdb)
                })
                .await
                .map_err(|e| format!("Task panicked: {e}"))?;

                let mut reply = poise::CreateReply::default();

                match png_result {
                    Ok(png_bytes) => {
                        let attachment =
                            poise::serenity_prelude::CreateAttachment::bytes(png_bytes, "repo.png");
                        let embed = poise::serenity_prelude::CreateEmbed::new()
                            .title(&info.full_name)
                            .url(&info.html_url)
                            .image("attachment://repo.png")
                            .color(0x0d1117);
                        reply = reply.embed(embed).attachment(attachment);
                    }
                    Err(e) => {
                        warn!(error = %e, "Repo card render failed, falling back to text");
                        let desc = info.description.as_deref().unwrap_or("No description");
                        let embed = poise::serenity_prelude::CreateEmbed::new()
                            .title(&info.full_name)
                            .url(&info.html_url)
                            .description(desc)
                            .field("Default Branch", &info.default_branch, true)
                            .field("Open Issues", info.open_issues_count.to_string(), true)
                            .color(0x0d1117);
                        reply = reply.embed(embed);
                    }
                }

                ctx.send(reply).await.map_err(|e| e.to_string())?;
                Ok(())
            }
            Err(e) => {
                warn!(error = %e, "Failed to fetch repo info");
                Err(format!(
                    "Failed to fetch repo info for `{}/{}`: {}",
                    owner, repo_name, e
                ))
            }
        }
    })
    .await
    {
        Ok(Ok(())) => Ok(()),
        Ok(Err(msg)) => send_error(ctx, &msg).await,
        Err(_) => {
            warn!("repo command timed out");
            send_error(ctx, "The request timed out — please try again.").await
        }
    }
}

// ── /github commits ─────────────────────────────────────────────────

/// Show recent commits for a repository.
#[poise::command(slash_command)]
async fn commits(
    ctx: Context<'_>,
    #[description = "Repository (owner/repo, default from env)"] repo: Option<String>,
    #[description = "Max results (default: 10, max: 25)"] limit: Option<u8>,
) -> Result<(), Error> {
    if !check_tier(ctx, CommandTier::Read).await? {
        return Ok(());
    }
    ctx.defer().await?;

    match tokio::time::timeout(COMMAND_TIMEOUT, async {
        let gh = get_github_client(ctx).await?;
        let (owner, repo_name) = parse_repo(&repo, &ctx.data().app.default_repo);
        let full_name = format!("{}/{}", owner, repo_name);
        let count = limit.unwrap_or(10).min(25);

        match gh.list_commits(&owner, &repo_name, None, Some(count)).await {
            Ok(commits) => {
                let mut embed = poise::serenity_prelude::CreateEmbed::new()
                    .title(format!("Recent Commits — {}", full_name))
                    .color(0x2EA043);

                if commits.is_empty() {
                    embed = embed.description("No commits found.");
                } else {
                    for c in &commits {
                        let first_line = c.commit.message.lines().next().unwrap_or("");
                        let short_sha = &c.sha[..7.min(c.sha.len())];
                        embed = embed.field(
                            truncate(first_line, 80),
                            format!(
                                "by `{}` | `{}` | [view]({})",
                                c.commit.author.name, short_sha, c.html_url
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
                warn!(error = %e, repo = full_name, "Failed to fetch commits");
                Err(format!(
                    "Failed to fetch commits for `{}`: {}",
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
            warn!("commits command timed out");
            send_error(ctx, "The request timed out — please try again.").await
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
