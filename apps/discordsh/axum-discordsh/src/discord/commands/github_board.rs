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
    subcommands(
        "noticeboard",
        "taskboard",
        "issues",
        "pulls",
        "repo",
        "commits",
        "view"
    )
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

                let fontdb = ctx.data().app.fontdb.clone();
                let card_template =
                    github_cards::build_taskboard_card(&tasks, &full_name, phase_title);

                let png_result = tokio::task::spawn_blocking(move || {
                    let svg = card_template
                        .render()
                        .map_err(|e| format!("Taskboard SVG template: {e}"))?;
                    kbve::render_svg_to_png(&svg, &fontdb)
                        .map_err(|e| format!("Taskboard PNG render: {e}"))
                })
                .await
                .map_err(|e| format!("Task panicked: {e}"))?;

                let mut reply = poise::CreateReply::default();
                match png_result {
                    Ok(png_bytes) => {
                        let attachment = poise::serenity_prelude::CreateAttachment::bytes(
                            png_bytes,
                            "taskboard.png",
                        );
                        let embed = poise::serenity_prelude::CreateEmbed::new()
                            .title(format!("Task Board — {}", full_name))
                            .image("attachment://taskboard.png")
                            .color(0x3498DB);
                        reply = reply.embed(embed).attachment(attachment);
                    }
                    Err(e) => {
                        warn!(error = %e, "Taskboard card render failed, falling back to text");
                        let repo_url = format!("https://github.com/{}", full_name);
                        let embed = build_task_board_embed(&tasks, phase_title, "", &repo_url);
                        reply = reply.embed(embed);
                    }
                }
                ctx.send(reply).await.map_err(|e| e.to_string())?;
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
                let fontdb = ctx.data().app.fontdb.clone();
                let pulls_clone = pulls.clone();
                let repo_clone = full_name.clone();

                let png_result = tokio::task::spawn_blocking(move || {
                    github_cards::render_pulls_card_blocking(&pulls_clone, &repo_clone, &fontdb)
                })
                .await
                .map_err(|e| format!("Task panicked: {e}"))?;

                let mut reply = poise::CreateReply::default();
                match png_result {
                    Ok(png_bytes) => {
                        let attachment = poise::serenity_prelude::CreateAttachment::bytes(
                            png_bytes,
                            "pulls.png",
                        );
                        let embed = poise::serenity_prelude::CreateEmbed::new()
                            .title(format!("Open PRs — {}", full_name))
                            .image("attachment://pulls.png")
                            .color(0x8957E5);
                        reply = reply.embed(embed).attachment(attachment);
                    }
                    Err(e) => {
                        warn!(error = %e, "Pulls card render failed, falling back to text");
                        let mut embed = poise::serenity_prelude::CreateEmbed::new()
                            .title(format!("Open PRs — {}", full_name))
                            .color(0x8957E5);
                        if pulls.is_empty() {
                            embed = embed.description("No open pull requests!");
                        } else {
                            for pr in &pulls {
                                embed = embed.field(
                                    format!("#{} {}", pr.number, truncate(&pr.title, 70)),
                                    format!("by `{}` | [view]({})", pr.user.login, pr.html_url),
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
                let fontdb = ctx.data().app.fontdb.clone();
                let commits_clone = commits.clone();
                let repo_clone = full_name.clone();

                let png_result = tokio::task::spawn_blocking(move || {
                    github_cards::render_commits_card_blocking(&commits_clone, &repo_clone, &fontdb)
                })
                .await
                .map_err(|e| format!("Task panicked: {e}"))?;

                let mut reply = poise::CreateReply::default();
                match png_result {
                    Ok(png_bytes) => {
                        let attachment = poise::serenity_prelude::CreateAttachment::bytes(
                            png_bytes,
                            "commits.png",
                        );
                        let embed = poise::serenity_prelude::CreateEmbed::new()
                            .title(format!("Recent Commits — {}", full_name))
                            .image("attachment://commits.png")
                            .color(0x2EA043);
                        reply = reply.embed(embed).attachment(attachment);
                    }
                    Err(e) => {
                        warn!(error = %e, "Commits card render failed, falling back to text");
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
                                    format!("by `{}` | `{}`", c.commit.author.name, short_sha),
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

// ── /github view ────────────────────────────────────────────────────

/// View a single issue or PR by number.
#[poise::command(slash_command)]
async fn view(
    ctx: Context<'_>,
    #[description = "Issue or PR number"] number: u64,
    #[description = "Repository (owner/repo, default from env)"] repo: Option<String>,
) -> Result<(), Error> {
    if !check_tier(ctx, CommandTier::Read).await? {
        return Ok(());
    }

    let (owner, repo_name) = parse_repo(&repo, &ctx.data().app.default_repo);
    view_issue_impl(ctx, &owner, &repo_name, number).await
}

/// Shared implementation for `/github view` and `/gh`.
pub async fn view_issue_impl(
    ctx: Context<'_>,
    owner: &str,
    repo_name: &str,
    number: u64,
) -> Result<(), Error> {
    ctx.defer().await?;

    let full_name = format!("{}/{}", owner, repo_name);
    let owner_owned = owner.to_owned();
    let repo_owned = repo_name.to_owned();

    let inner = async {
        let gh = get_github_client(ctx).await?;
        let issue = ctx
            .data()
            .app
            .github_cache
            .get_or_fetch_issue(&gh, &owner_owned, &repo_owned, number)
            .await?;

        let fontdb = ctx.data().app.fontdb.clone();
        let issue_clone = issue.clone();

        let png_result = tokio::task::spawn_blocking(move || {
            github_cards::render_issue_detail_card_blocking(&issue_clone, &fontdb)
        })
        .await
        .map_err(|e| format!("Task panicked: {e}"))?;

        let mut reply = poise::CreateReply::default();

        match png_result {
            Ok(png_bytes) => {
                let attachment =
                    poise::serenity_prelude::CreateAttachment::bytes(png_bytes, "issue.png");

                let issue_color = if issue.state == "open" {
                    0x238636u32
                } else {
                    0x8b949eu32
                };

                let embed = poise::serenity_prelude::CreateEmbed::new()
                    .title(format!("#{} — {}", number, truncate(&issue.title, 60)))
                    .url(&issue.html_url)
                    .image("attachment://issue.png")
                    .color(issue_color);

                reply = reply.embed(embed).attachment(attachment);

                // Add interactive components for Board+ tier users
                let guard = &ctx.data().app.github_guard;
                let can_manage = if let Some(member) = ctx.author_member().await {
                    let perms = member
                        .permissions
                        .unwrap_or_else(poise::serenity_prelude::Permissions::empty);
                    guard.has_tier_permission(
                        crate::discord::github_permissions::CommandTier::Board,
                        perms,
                    )
                } else {
                    false
                };

                if can_manage {
                    let priority = github_cards::priority_from_labels(&issue.labels);

                    let priority_options: Vec<poise::serenity_prelude::CreateSelectMenuOption> = (0
                        ..=6u8)
                        .map(|level| {
                            let label = match level {
                                0 => "None",
                                1 => "P1 Low",
                                2 => "P2 Medium",
                                3 => "P3 High",
                                4 => "P4 Critical",
                                5 => "P5 Blocker",
                                6 => "P6 Emergency",
                                _ => "",
                            };
                            let mut opt = poise::serenity_prelude::CreateSelectMenuOption::new(
                                label,
                                level.to_string(),
                            );
                            if level == priority {
                                opt = opt.default_selection(true);
                            }
                            opt
                        })
                        .collect();

                    let priority_menu = poise::serenity_prelude::CreateSelectMenu::new(
                        format!("gh|{full_name}|{number}|priority"),
                        poise::serenity_prelude::CreateSelectMenuKind::String {
                            options: priority_options,
                        },
                    )
                    .placeholder("Set priority...");

                    let mut rows = vec![poise::serenity_prelude::CreateActionRow::SelectMenu(
                        priority_menu,
                    )];

                    // Type dropdown (only shown when no type is set)
                    if issue.issue_type.is_none() {
                        let type_options: Vec<poise::serenity_prelude::CreateSelectMenuOption> =
                            github_cards::ISSUE_TYPES
                                .iter()
                                .map(|t| {
                                    poise::serenity_prelude::CreateSelectMenuOption::new(*t, *t)
                                })
                                .collect();

                        let type_menu = poise::serenity_prelude::CreateSelectMenu::new(
                            format!("gh|{full_name}|{number}|settype"),
                            poise::serenity_prelude::CreateSelectMenuKind::String {
                                options: type_options,
                            },
                        )
                        .placeholder("Set issue type...");

                        rows.push(poise::serenity_prelude::CreateActionRow::SelectMenu(
                            type_menu,
                        ));
                    }

                    reply = reply.components(rows);
                }
            }
            Err(e) => {
                warn!(error = %e, "Issue detail card render failed, falling back to text");
                let body_preview = issue
                    .body
                    .as_deref()
                    .unwrap_or("")
                    .lines()
                    .take(3)
                    .collect::<Vec<_>>()
                    .join("\n");

                let issue_color = if issue.state == "open" {
                    0x238636u32
                } else {
                    0x8b949eu32
                };

                let embed = poise::serenity_prelude::CreateEmbed::new()
                    .title(format!("#{} {}", number, truncate(&issue.title, 60)))
                    .url(&issue.html_url)
                    .description(body_preview)
                    .color(issue_color);
                reply = reply.embed(embed);
            }
        }

        ctx.send(reply).await.map_err(|e| e.to_string())?;
        Ok::<(), String>(())
    };

    match tokio::time::timeout(COMMAND_TIMEOUT, inner).await {
        Ok(Ok(())) => Ok(()),
        Ok(Err(msg)) => send_error(ctx, &msg).await,
        Err(_) => {
            warn!("view command timed out");
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
