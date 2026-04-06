//! `/github` slash commands — notice board, task board, repo info, commits,
//! issues, and pull request embeds powered by the guild's GitHub PAT.

use askama::Template;
use jedi::entity::github::{
    CreateIssueRequest, GitHubClient, MergePullRequest, UpdateIssueRequest,
};
use tracing::{info, warn};

use crate::discord::bot::{Context, Error};
use crate::discord::branding;
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
        "view",
        "create",
        "close",
        "reopen",
        "comment",
        "assign",
        "unassign",
        "search",
        "labels",
        "comments",
        "workflows",
        "dispatch",
        "merge"
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

                let summary_embed = build_notice_board_summary(&notices, &full_name);

                match png_result {
                    Ok(png_bytes) => {
                        let attachment = poise::serenity_prelude::CreateAttachment::bytes(
                            png_bytes,
                            "noticeboard.png",
                        );
                        let card_embed = poise::serenity_prelude::CreateEmbed::new()
                            .title(format!("Notice Board — {}", full_name))
                            .image("attachment://noticeboard.png")
                            .color(branding::GH_NOTICE)
                            .author(branding::embed_author())
                            .footer(branding::embed_footer(None));
                        reply = reply
                            .embed(card_embed)
                            .embed(summary_embed)
                            .attachment(attachment);
                    }
                    Err(e) => {
                        warn!(error = %e, "Noticeboard card render failed, falling back to text");
                        reply = reply.embed(summary_embed);
                    }
                }

                // Chart buttons
                let chart_row = poise::serenity_prelude::CreateActionRow::Buttons(vec![
                    poise::serenity_prelude::CreateButton::new(format!(
                        "chart|{full_name}|activity"
                    ))
                    .label("Activity")
                    .style(poise::serenity_prelude::ButtonStyle::Secondary)
                    .emoji(poise::serenity_prelude::ReactionType::Unicode(
                        "\u{1F4C8}".to_owned(),
                    )),
                    poise::serenity_prelude::CreateButton::new(format!("chart|{full_name}|labels"))
                        .label("Labels")
                        .style(poise::serenity_prelude::ButtonStyle::Secondary)
                        .emoji(poise::serenity_prelude::ReactionType::Unicode(
                            "\u{1F3F7}".to_owned(),
                        )),
                ]);
                reply = reply.components(vec![chart_row]);

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
                let repo_url = format!("https://github.com/{}", full_name);
                let detail_embed = build_task_board_embed(&tasks, phase_title, "", &repo_url);

                match png_result {
                    Ok(png_bytes) => {
                        let attachment = poise::serenity_prelude::CreateAttachment::bytes(
                            png_bytes,
                            "taskboard.png",
                        );
                        let card_embed = poise::serenity_prelude::CreateEmbed::new()
                            .title(format!("Task Board — {}", full_name))
                            .image("attachment://taskboard.png")
                            .color(branding::GH_TASK)
                            .author(branding::embed_author())
                            .footer(branding::embed_footer(None));
                        reply = reply
                            .embed(card_embed)
                            .embed(detail_embed)
                            .attachment(attachment);
                    }
                    Err(e) => {
                        warn!(error = %e, "Taskboard card render failed, falling back to text");
                        reply = reply.embed(detail_embed);
                    }
                }

                // Chart buttons
                let chart_row = poise::serenity_prelude::CreateActionRow::Buttons(vec![
                    poise::serenity_prelude::CreateButton::new(format!("chart|{full_name}|labels"))
                        .label("Labels")
                        .style(poise::serenity_prelude::ButtonStyle::Secondary)
                        .emoji(poise::serenity_prelude::ReactionType::Unicode(
                            "\u{1F3F7}".to_owned(),
                        )),
                    poise::serenity_prelude::CreateButton::new(format!(
                        "chart|{full_name}|activity"
                    ))
                    .label("Activity")
                    .style(poise::serenity_prelude::ButtonStyle::Secondary)
                    .emoji(poise::serenity_prelude::ReactionType::Unicode(
                        "\u{1F4C8}".to_owned(),
                    )),
                ]);
                reply = reply.components(vec![chart_row]);

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

                // Build text detail embed (always used)
                let mut detail_embed = poise::serenity_prelude::CreateEmbed::new()
                    .title(format!("Open Issues — {}", full_name))
                    .url(format!("https://github.com/{full_name}/issues"))
                    .color(branding::GH_GREEN)
                    .author(branding::embed_author());
                if issues.is_empty() {
                    detail_embed = detail_embed.description("No open issues!");
                } else {
                    for issue in &issues {
                        detail_embed = detail_embed.field(
                            format!("#{} {}", issue.number, truncate(&issue.title, 80)),
                            format!(
                                "by `{}` | [view]({}){}",
                                issue.user.login,
                                issue.html_url,
                                format_assignees(&issue.assignees)
                            ),
                            false,
                        );
                    }
                }

                detail_embed = detail_embed.footer(branding::embed_footer(Some(&format!(
                    "{} open",
                    issues.len()
                ))));

                match png_result {
                    Ok(png_bytes) => {
                        let attachment = poise::serenity_prelude::CreateAttachment::bytes(
                            png_bytes,
                            "issues.png",
                        );
                        let card_embed = poise::serenity_prelude::CreateEmbed::new()
                            .image("attachment://issues.png")
                            .color(branding::GH_GREEN);
                        reply = reply
                            .embed(card_embed)
                            .embed(detail_embed)
                            .attachment(attachment);
                    }
                    Err(e) => {
                        warn!(error = %e, "Issues card render failed, falling back to text");
                        reply = reply.embed(detail_embed);
                    }
                }

                // Chart buttons
                let chart_row = poise::serenity_prelude::CreateActionRow::Buttons(vec![
                    poise::serenity_prelude::CreateButton::new(format!(
                        "chart|{full_name}|activity"
                    ))
                    .label("Activity")
                    .style(poise::serenity_prelude::ButtonStyle::Secondary)
                    .emoji(poise::serenity_prelude::ReactionType::Unicode(
                        "\u{1F4C8}".to_owned(),
                    )),
                    poise::serenity_prelude::CreateButton::new(format!("chart|{full_name}|labels"))
                        .label("Labels")
                        .style(poise::serenity_prelude::ButtonStyle::Secondary)
                        .emoji(poise::serenity_prelude::ReactionType::Unicode(
                            "\u{1F3F7}".to_owned(),
                        )),
                ]);
                reply = reply.components(vec![chart_row]);

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

                let mut detail_embed = poise::serenity_prelude::CreateEmbed::new()
                    .title(format!("Open PRs — {}", full_name))
                    .url(format!("https://github.com/{full_name}/pulls"))
                    .color(branding::GH_PURPLE)
                    .author(branding::embed_author());
                if pulls.is_empty() {
                    detail_embed = detail_embed.description("No open pull requests!");
                } else {
                    for pr in &pulls {
                        let draft_tag = if pr.draft { " `draft`" } else { "" };
                        detail_embed = detail_embed.field(
                            format!("#{} {}", pr.number, truncate(&pr.title, 70)),
                            format!(
                                "by `{}` | `{}`{} | [view]({})",
                                pr.user.login,
                                truncate(&pr.head.ref_name, 20),
                                draft_tag,
                                pr.html_url
                            ),
                            false,
                        );
                    }
                }

                detail_embed = detail_embed.footer(branding::embed_footer(Some(&format!(
                    "{} open",
                    pulls.len()
                ))));

                match png_result {
                    Ok(png_bytes) => {
                        let attachment = poise::serenity_prelude::CreateAttachment::bytes(
                            png_bytes,
                            "pulls.png",
                        );
                        let card_embed = poise::serenity_prelude::CreateEmbed::new()
                            .image("attachment://pulls.png")
                            .color(branding::GH_PURPLE);
                        reply = reply
                            .embed(card_embed)
                            .embed(detail_embed)
                            .attachment(attachment);
                    }
                    Err(e) => {
                        warn!(error = %e, "Pulls card render failed, falling back to text");
                        reply = reply.embed(detail_embed);
                    }
                }
                // Chart buttons
                let chart_row = poise::serenity_prelude::CreateActionRow::Buttons(vec![
                    poise::serenity_prelude::CreateButton::new(format!(
                        "chart|{full_name}|pr_status"
                    ))
                    .label("PR Status")
                    .style(poise::serenity_prelude::ButtonStyle::Secondary)
                    .emoji(poise::serenity_prelude::ReactionType::Unicode(
                        "\u{1F4CA}".to_owned(),
                    )),
                ]);
                reply = reply.components(vec![chart_row]);

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
                let full_name = info.full_name.clone();
                let fontdb = ctx.data().app.fontdb.clone();
                let info_clone = info.clone();

                let png_result = tokio::task::spawn_blocking(move || {
                    github_cards::render_repo_card_blocking(&info_clone, &fontdb)
                })
                .await
                .map_err(|e| format!("Task panicked: {e}"))?;

                let mut reply = poise::CreateReply::default();

                let desc = info.description.as_deref().unwrap_or("No description");
                let detail_embed = poise::serenity_prelude::CreateEmbed::new()
                    .title(&info.full_name)
                    .url(&info.html_url)
                    .description(desc)
                    .field(
                        "Default Branch",
                        format!("`{}`", &info.default_branch),
                        true,
                    )
                    .field("Open Issues", info.open_issues_count.to_string(), true)
                    .color(branding::GH_DARK)
                    .author(branding::embed_author())
                    .footer(branding::embed_footer(None));

                match png_result {
                    Ok(png_bytes) => {
                        let attachment =
                            poise::serenity_prelude::CreateAttachment::bytes(png_bytes, "repo.png");
                        let card_embed = poise::serenity_prelude::CreateEmbed::new()
                            .image("attachment://repo.png")
                            .color(branding::GH_DARK);
                        reply = reply
                            .embed(card_embed)
                            .embed(detail_embed)
                            .attachment(attachment);
                    }
                    Err(e) => {
                        warn!(error = %e, "Repo card render failed, falling back to text");
                        reply = reply.embed(detail_embed);
                    }
                }

                // Chart buttons
                let chart_row = poise::serenity_prelude::CreateActionRow::Buttons(vec![
                    poise::serenity_prelude::CreateButton::new(format!(
                        "chart|{full_name}|languages"
                    ))
                    .label("Languages")
                    .style(poise::serenity_prelude::ButtonStyle::Secondary)
                    .emoji(poise::serenity_prelude::ReactionType::Unicode(
                        "\u{1F4CA}".to_owned(),
                    )),
                    poise::serenity_prelude::CreateButton::new(format!(
                        "chart|{full_name}|contributors"
                    ))
                    .label("Contributors")
                    .style(poise::serenity_prelude::ButtonStyle::Secondary)
                    .emoji(poise::serenity_prelude::ReactionType::Unicode(
                        "\u{1F465}".to_owned(),
                    )),
                ]);
                reply = reply.components(vec![chart_row]);

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

                let mut detail_embed = poise::serenity_prelude::CreateEmbed::new()
                    .title(format!("Recent Commits — {}", full_name))
                    .url(format!("https://github.com/{full_name}/commits"))
                    .color(branding::GH_COMMIT)
                    .author(branding::embed_author());
                if commits.is_empty() {
                    detail_embed = detail_embed.description("No commits found.");
                } else {
                    for c in &commits {
                        let first_line = c.commit.message.lines().next().unwrap_or("");
                        let short_sha = &c.sha[..7.min(c.sha.len())];
                        detail_embed = detail_embed.field(
                            truncate(first_line, 80),
                            format!("by `{}` | `{}`", c.commit.author.name, short_sha),
                            false,
                        );
                    }
                }

                detail_embed = detail_embed.footer(branding::embed_footer(Some(&format!(
                    "{} commits",
                    commits.len()
                ))));

                match png_result {
                    Ok(png_bytes) => {
                        let attachment = poise::serenity_prelude::CreateAttachment::bytes(
                            png_bytes,
                            "commits.png",
                        );
                        let card_embed = poise::serenity_prelude::CreateEmbed::new()
                            .image("attachment://commits.png")
                            .color(branding::GH_COMMIT);
                        reply = reply
                            .embed(card_embed)
                            .embed(detail_embed)
                            .attachment(attachment);
                    }
                    Err(e) => {
                        warn!(error = %e, "Commits card render failed, falling back to text");
                        reply = reply.embed(detail_embed);
                    }
                }
                // Chart buttons
                let chart_row = poise::serenity_prelude::CreateActionRow::Buttons(vec![
                    poise::serenity_prelude::CreateButton::new(format!(
                        "chart|{full_name}|commit_freq"
                    ))
                    .label("Heatmap")
                    .style(poise::serenity_prelude::ButtonStyle::Secondary)
                    .emoji(poise::serenity_prelude::ReactionType::Unicode(
                        "\u{1F525}".to_owned(),
                    )),
                ]);
                reply = reply.components(vec![chart_row]);

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

        let issue_color = if issue.state == "open" {
            branding::GH_GREEN
        } else {
            branding::GH_GRAY
        };

        // Build the text detail embed (always shown)
        let body_preview = issue
            .body
            .as_deref()
            .unwrap_or("")
            .lines()
            .take(3)
            .collect::<Vec<_>>()
            .join("\n");

        let mut detail_embed = poise::serenity_prelude::CreateEmbed::new()
            .title(format!("#{} — {}", number, truncate(&issue.title, 60)))
            .url(&issue.html_url)
            .color(issue_color)
            .author(branding::embed_author());

        if !body_preview.is_empty() {
            detail_embed = detail_embed.description(body_preview);
        }

        let state_icon = if issue.state == "open" {
            "Open"
        } else {
            "Closed"
        };
        detail_embed = detail_embed
            .field("State", state_icon, true)
            .field("Author", format!("`{}`", issue.user.login), true)
            .field("Comments", issue.comments.to_string(), true);

        if !issue.labels.is_empty() {
            let label_list: Vec<_> = issue
                .labels
                .iter()
                .take(6)
                .map(|l| format!("`{}`", l.name))
                .collect();
            detail_embed = detail_embed.field("Labels", label_list.join(" "), false);
        }

        if !issue.assignees.is_empty() {
            let names: Vec<_> = issue
                .assignees
                .iter()
                .map(|a| format!("`{}`", a.login))
                .collect();
            detail_embed = detail_embed.field("Assignees", names.join(", "), false);
        }

        detail_embed = detail_embed.footer(branding::embed_footer(Some(&full_name)));

        match png_result {
            Ok(png_bytes) => {
                let attachment =
                    poise::serenity_prelude::CreateAttachment::bytes(png_bytes, "issue.png");

                let card_embed = poise::serenity_prelude::CreateEmbed::new()
                    .image("attachment://issue.png")
                    .color(issue_color);

                reply = reply
                    .embed(card_embed)
                    .embed(detail_embed)
                    .attachment(attachment);

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
                reply = reply.embed(detail_embed);
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

// ═══════════════════════════════════════════════════════════════════
// Write Commands (Admin / Board tier)
// ═══════════════════════════════════════════════════════════════════

// ── /github create ──────────────────────────────────────────────────

/// Create a new issue.
#[poise::command(slash_command)]
async fn create(
    ctx: Context<'_>,
    #[description = "Issue title"] title: String,
    #[description = "Issue body (optional)"] body: Option<String>,
    #[description = "Comma-separated labels (optional)"] labels: Option<String>,
    #[description = "Issue type: Bug, Feature, or Task (optional)"] issue_type: Option<String>,
    #[description = "Repository (owner/repo, default from env)"] repo: Option<String>,
) -> Result<(), Error> {
    if !check_tier(ctx, CommandTier::Admin).await? {
        return Ok(());
    }
    ctx.defer().await?;

    match tokio::time::timeout(COMMAND_TIMEOUT, async {
        let gh = get_github_client(ctx).await?;
        let (owner, repo_name) = parse_repo(&repo, &ctx.data().app.default_repo);
        let full_name = format!("{}/{}", owner, repo_name);

        let label_list: Vec<String> = labels
            .as_deref()
            .unwrap_or("")
            .split(',')
            .map(|s| s.trim().to_owned())
            .filter(|s| !s.is_empty())
            .collect();

        let req = CreateIssueRequest {
            title: title.clone(),
            body,
            labels: label_list,
            assignees: vec![],
            issue_type,
        };

        match gh.create_issue(&owner, &repo_name, &req).await {
            Ok(issue) => {
                info!(
                    user = %ctx.author().name,
                    repo = full_name,
                    issue = issue.number,
                    "Issue created via Discord"
                );

                let embed = poise::serenity_prelude::CreateEmbed::new()
                    .title(format!(
                        "Created #{} — {}",
                        issue.number,
                        truncate(&issue.title, 60)
                    ))
                    .url(&issue.html_url)
                    .description(format!("Issue created in `{full_name}`"))
                    .color(branding::GH_GREEN)
                    .author(branding::embed_author())
                    .footer(branding::embed_footer(None));

                ctx.send(poise::CreateReply::default().embed(embed))
                    .await
                    .map_err(|e| e.to_string())?;
                Ok(())
            }
            Err(e) => {
                warn!(error = %e, repo = full_name, "Failed to create issue");
                Err(format!("Failed to create issue in `{full_name}`: {e}"))
            }
        }
    })
    .await
    {
        Ok(Ok(())) => Ok(()),
        Ok(Err(msg)) => send_error(ctx, &msg).await,
        Err(_) => send_error(ctx, "The request timed out — please try again.").await,
    }
}

// ── /github close ───────────────────────────────────────────────────

/// Close an issue or pull request.
#[poise::command(slash_command)]
async fn close(
    ctx: Context<'_>,
    #[description = "Issue or PR number"] number: u64,
    #[description = "Repository (owner/repo, default from env)"] repo: Option<String>,
) -> Result<(), Error> {
    if !check_tier(ctx, CommandTier::Admin).await? {
        return Ok(());
    }
    ctx.defer().await?;

    match tokio::time::timeout(COMMAND_TIMEOUT, async {
        let gh = get_github_client(ctx).await?;
        let (owner, repo_name) = parse_repo(&repo, &ctx.data().app.default_repo);
        let full_name = format!("{}/{}", owner, repo_name);

        let req = UpdateIssueRequest {
            state: Some("closed".to_owned()),
            ..Default::default()
        };

        match gh.update_issue(&owner, &repo_name, number, &req).await {
            Ok(_) => {
                ctx.data()
                    .app
                    .github_cache
                    .invalidate_issue(&owner, &repo_name, number);
                info!(user = %ctx.author().name, issue = number, "Issue closed via Discord");

                let embed = poise::serenity_prelude::CreateEmbed::new()
                    .title(format!("Closed #{number}"))
                    .description(format!("Issue closed in `{full_name}`"))
                    .color(branding::GH_GRAY)
                    .author(branding::embed_author())
                    .footer(branding::embed_footer(None));

                ctx.send(poise::CreateReply::default().embed(embed))
                    .await
                    .map_err(|e| e.to_string())?;
                Ok(())
            }
            Err(e) => Err(format!("Failed to close #{number}: {e}")),
        }
    })
    .await
    {
        Ok(Ok(())) => Ok(()),
        Ok(Err(msg)) => send_error(ctx, &msg).await,
        Err(_) => send_error(ctx, "The request timed out — please try again.").await,
    }
}

// ── /github reopen ──────────────────────────────────────────────────

/// Reopen a closed issue or pull request.
#[poise::command(slash_command)]
async fn reopen(
    ctx: Context<'_>,
    #[description = "Issue or PR number"] number: u64,
    #[description = "Repository (owner/repo, default from env)"] repo: Option<String>,
) -> Result<(), Error> {
    if !check_tier(ctx, CommandTier::Admin).await? {
        return Ok(());
    }
    ctx.defer().await?;

    match tokio::time::timeout(COMMAND_TIMEOUT, async {
        let gh = get_github_client(ctx).await?;
        let (owner, repo_name) = parse_repo(&repo, &ctx.data().app.default_repo);
        let full_name = format!("{}/{}", owner, repo_name);

        let req = UpdateIssueRequest {
            state: Some("open".to_owned()),
            ..Default::default()
        };

        match gh.update_issue(&owner, &repo_name, number, &req).await {
            Ok(_) => {
                ctx.data()
                    .app
                    .github_cache
                    .invalidate_issue(&owner, &repo_name, number);
                info!(user = %ctx.author().name, issue = number, "Issue reopened via Discord");

                let embed = poise::serenity_prelude::CreateEmbed::new()
                    .title(format!("Reopened #{number}"))
                    .description(format!("Issue reopened in `{full_name}`"))
                    .color(branding::GH_GREEN)
                    .author(branding::embed_author())
                    .footer(branding::embed_footer(None));

                ctx.send(poise::CreateReply::default().embed(embed))
                    .await
                    .map_err(|e| e.to_string())?;
                Ok(())
            }
            Err(e) => Err(format!("Failed to reopen #{number}: {e}")),
        }
    })
    .await
    {
        Ok(Ok(())) => Ok(()),
        Ok(Err(msg)) => send_error(ctx, &msg).await,
        Err(_) => send_error(ctx, "The request timed out — please try again.").await,
    }
}

// ── /github comment ─────────────────────────────────────────────────

/// Post a comment on an issue or pull request.
#[poise::command(slash_command)]
async fn comment(
    ctx: Context<'_>,
    #[description = "Issue or PR number"] number: u64,
    #[description = "Comment text"] text: String,
    #[description = "Repository (owner/repo, default from env)"] repo: Option<String>,
) -> Result<(), Error> {
    if !check_tier(ctx, CommandTier::Board).await? {
        return Ok(());
    }
    ctx.defer().await?;

    match tokio::time::timeout(COMMAND_TIMEOUT, async {
        let gh = get_github_client(ctx).await?;
        let (owner, repo_name) = parse_repo(&repo, &ctx.data().app.default_repo);
        let full_name = format!("{}/{}", owner, repo_name);

        // Prepend Discord author attribution
        let comment_body = format!("**{}** (via Discord):\n\n{}", ctx.author().name, text);

        match gh
            .create_comment(&owner, &repo_name, number, &comment_body)
            .await
        {
            Ok(c) => {
                info!(
                    user = %ctx.author().name,
                    issue = number,
                    comment_id = c.id,
                    "Comment posted via Discord"
                );

                let embed = poise::serenity_prelude::CreateEmbed::new()
                    .title(format!("Commented on #{number}"))
                    .url(&c.html_url)
                    .description(truncate(&text, 200))
                    .color(branding::GH_BLUE)
                    .author(branding::embed_author())
                    .footer(branding::embed_footer(Some(&full_name)));

                ctx.send(poise::CreateReply::default().embed(embed))
                    .await
                    .map_err(|e| e.to_string())?;
                Ok(())
            }
            Err(e) => Err(format!("Failed to comment on #{number}: {e}")),
        }
    })
    .await
    {
        Ok(Ok(())) => Ok(()),
        Ok(Err(msg)) => send_error(ctx, &msg).await,
        Err(_) => send_error(ctx, "The request timed out — please try again.").await,
    }
}

// ── /github assign ──────────────────────────────────────────────────

/// Assign a user to an issue.
#[poise::command(slash_command)]
async fn assign(
    ctx: Context<'_>,
    #[description = "Issue or PR number"] number: u64,
    #[description = "GitHub username to assign"] username: String,
    #[description = "Repository (owner/repo, default from env)"] repo: Option<String>,
) -> Result<(), Error> {
    if !check_tier(ctx, CommandTier::Board).await? {
        return Ok(());
    }
    ctx.defer().await?;

    match tokio::time::timeout(COMMAND_TIMEOUT, async {
        let gh = get_github_client(ctx).await?;
        let (owner, repo_name) = parse_repo(&repo, &ctx.data().app.default_repo);
        let full_name = format!("{}/{}", owner, repo_name);

        match gh.add_assignees(&owner, &repo_name, number, &[username.as_str()]).await {
            Ok(_) => {
                ctx.data().app.github_cache.invalidate_issue(&owner, &repo_name, number);
                info!(user = %ctx.author().name, issue = number, assignee = %username, "Assignee added via Discord");

                let embed = poise::serenity_prelude::CreateEmbed::new()
                    .title(format!("Assigned `{username}` to #{number}"))
                    .description(format!("in `{full_name}`"))
                    .color(branding::GH_BLUE)
                    .author(branding::embed_author())
                    .footer(branding::embed_footer(None));

                ctx.send(poise::CreateReply::default().embed(embed))
                    .await
                    .map_err(|e| e.to_string())?;
                Ok(())
            }
            Err(e) => Err(format!("Failed to assign `{username}` to #{number}: {e}")),
        }
    })
    .await
    {
        Ok(Ok(())) => Ok(()),
        Ok(Err(msg)) => send_error(ctx, &msg).await,
        Err(_) => send_error(ctx, "The request timed out — please try again.").await,
    }
}

// ── /github unassign ────────────────────────────────────────────────

/// Remove a user from an issue.
#[poise::command(slash_command)]
async fn unassign(
    ctx: Context<'_>,
    #[description = "Issue or PR number"] number: u64,
    #[description = "GitHub username to remove"] username: String,
    #[description = "Repository (owner/repo, default from env)"] repo: Option<String>,
) -> Result<(), Error> {
    if !check_tier(ctx, CommandTier::Board).await? {
        return Ok(());
    }
    ctx.defer().await?;

    match tokio::time::timeout(COMMAND_TIMEOUT, async {
        let gh = get_github_client(ctx).await?;
        let (owner, repo_name) = parse_repo(&repo, &ctx.data().app.default_repo);
        let full_name = format!("{}/{}", owner, repo_name);

        match gh.remove_assignees(&owner, &repo_name, number, &[username.as_str()]).await {
            Ok(_) => {
                ctx.data().app.github_cache.invalidate_issue(&owner, &repo_name, number);
                info!(user = %ctx.author().name, issue = number, assignee = %username, "Assignee removed via Discord");

                let embed = poise::serenity_prelude::CreateEmbed::new()
                    .title(format!("Unassigned `{username}` from #{number}"))
                    .description(format!("in `{full_name}`"))
                    .color(branding::GH_GRAY)
                    .author(branding::embed_author())
                    .footer(branding::embed_footer(None));

                ctx.send(poise::CreateReply::default().embed(embed))
                    .await
                    .map_err(|e| e.to_string())?;
                Ok(())
            }
            Err(e) => Err(format!("Failed to unassign `{username}` from #{number}: {e}")),
        }
    })
    .await
    {
        Ok(Ok(())) => Ok(()),
        Ok(Err(msg)) => send_error(ctx, &msg).await,
        Err(_) => send_error(ctx, "The request timed out — please try again.").await,
    }
}

// ═══════════════════════════════════════════════════════════════════
// Search, Labels, Comments, Workflows, Merge
// ═══════════════════════════════════════════════════════════════════

// ── /github search ─────────────────────────────────────────────────

/// Search issues and pull requests by keyword.
#[poise::command(slash_command)]
async fn search(
    ctx: Context<'_>,
    #[description = "Search query (supports GitHub search syntax)"] query: String,
    #[description = "Max results (default: 10, max: 25)"] limit: Option<u8>,
    #[description = "Repository (owner/repo, default from env)"] repo: Option<String>,
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
            .search_issues(&owner, &repo_name, &query, Some(count))
            .await
        {
            Ok(result) => {
                let mut embed = poise::serenity_prelude::CreateEmbed::new()
                    .title(format!(
                        "Search: \"{}\" — {} result{}",
                        truncate(&query, 40),
                        result.total_count,
                        if result.total_count == 1 { "" } else { "s" }
                    ))
                    .color(branding::GH_BLUE)
                    .author(branding::embed_author());

                if result.items.is_empty() {
                    embed = embed
                        .description(format!("No results found in `{full_name}` for that query."));
                } else {
                    for item in &result.items {
                        let kind = if item.is_pull_request() {
                            "PR"
                        } else {
                            "Issue"
                        };
                        let state_icon = match item.state.as_str() {
                            "open" => "🟢",
                            "closed" => "🔴",
                            _ => "⚪",
                        };
                        embed = embed.field(
                            format!(
                                "{state_icon} #{} {}",
                                item.number,
                                truncate(&item.title, 60)
                            ),
                            format!(
                                "{kind} by `{}` | [view]({}){}",
                                item.user.login,
                                item.html_url,
                                format_assignees(&item.assignees)
                            ),
                            false,
                        );
                    }
                    embed = if result.total_count > result.items.len() as u64 {
                        embed.footer(branding::embed_footer(Some(&format!(
                            "Showing {} of {}",
                            result.items.len(),
                            result.total_count
                        ))))
                    } else {
                        embed.footer(branding::embed_footer(Some(&format!(
                            "{} results",
                            result.total_count
                        ))))
                    };
                }

                ctx.send(poise::CreateReply::default().embed(embed))
                    .await
                    .map_err(|e| e.to_string())?;
                Ok(())
            }
            Err(e) => {
                warn!(error = %e, repo = full_name, query = %query, "GitHub search failed");
                Err(format!("Search failed for `{full_name}`: {e}"))
            }
        }
    })
    .await
    {
        Ok(Ok(())) => Ok(()),
        Ok(Err(msg)) => send_error(ctx, &msg).await,
        Err(_) => send_error(ctx, "The request timed out — please try again.").await,
    }
}

// ── /github labels ─────────────────────────────────────────────────

/// List all labels for a repository.
#[poise::command(slash_command)]
async fn labels(
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
        let full_name = format!("{}/{}", owner, repo_name);

        match gh.list_labels(&owner, &repo_name).await {
            Ok(labels) => {
                let mut embed = poise::serenity_prelude::CreateEmbed::new()
                    .title(format!("Labels — {full_name}"))
                    .color(branding::GH_LABELS)
                    .author(branding::embed_author());

                if labels.is_empty() {
                    embed = embed.description("No labels configured.");
                } else {
                    let label_lines: Vec<String> = labels
                        .iter()
                        .map(|l| {
                            let color_dot = l
                                .color
                                .as_deref()
                                .map(|c| format!("`#{c}` "))
                                .unwrap_or_default();
                            format!("{color_dot}**{}**", l.name)
                        })
                        .collect();

                    // Discord embed description limit is 4096 chars — chunk if needed
                    let desc = label_lines.join("\n");
                    if desc.len() <= 4000 {
                        embed = embed.description(desc);
                    } else {
                        embed = embed.description(format!(
                            "{}\n\n*…and {} more*",
                            label_lines[..50].join("\n"),
                            labels.len() - 50
                        ));
                    }

                    embed = embed.footer(branding::embed_footer(Some(&format!(
                        "{} labels",
                        labels.len()
                    ))));
                }

                ctx.send(poise::CreateReply::default().embed(embed))
                    .await
                    .map_err(|e| e.to_string())?;
                Ok(())
            }
            Err(e) => {
                warn!(error = %e, repo = full_name, "Failed to fetch labels");
                Err(format!("Failed to fetch labels for `{full_name}`: {e}"))
            }
        }
    })
    .await
    {
        Ok(Ok(())) => Ok(()),
        Ok(Err(msg)) => send_error(ctx, &msg).await,
        Err(_) => send_error(ctx, "The request timed out — please try again.").await,
    }
}

// ── /github comments ───────────────────────────────────────────────

/// View comments on an issue or pull request.
#[poise::command(slash_command)]
async fn comments(
    ctx: Context<'_>,
    #[description = "Issue or PR number"] number: u64,
    #[description = "Max results (default: 10, max: 25)"] limit: Option<u8>,
    #[description = "Repository (owner/repo, default from env)"] repo: Option<String>,
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
            .list_comments(&owner, &repo_name, number, Some(count))
            .await
        {
            Ok(comments) => {
                let mut embed = poise::serenity_prelude::CreateEmbed::new()
                    .title(format!("Comments on #{number} — {full_name}"))
                    .color(branding::GH_BLUE)
                    .author(branding::embed_author())
                    .footer(branding::embed_footer(Some(&full_name)));

                if comments.is_empty() {
                    embed = embed.description("No comments yet.");
                } else {
                    for c in &comments {
                        let body_preview =
                            truncate(&c.body.lines().take(3).collect::<Vec<_>>().join("\n"), 200);
                        embed = embed.field(
                            format!("`{}` — {}", c.user.login, &c.created_at[..10]),
                            format!("{body_preview}\n[view]({})", c.html_url),
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
                warn!(error = %e, repo = full_name, issue = number, "Failed to fetch comments");
                Err(format!(
                    "Failed to fetch comments for #{number} in `{full_name}`: {e}"
                ))
            }
        }
    })
    .await
    {
        Ok(Ok(())) => Ok(()),
        Ok(Err(msg)) => send_error(ctx, &msg).await,
        Err(_) => send_error(ctx, "The request timed out — please try again.").await,
    }
}

// ── /github workflows ──────────────────────────────────────────────

/// List GitHub Actions workflows for a repository.
#[poise::command(slash_command)]
async fn workflows(
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
        let full_name = format!("{}/{}", owner, repo_name);

        match gh.list_workflows(&owner, &repo_name).await {
            Ok(wfs) => {
                let active: Vec<_> = wfs.iter().filter(|w| w.state == "active").collect();

                let mut embed = poise::serenity_prelude::CreateEmbed::new()
                    .title(format!("Workflows — {full_name}"))
                    .url(format!("https://github.com/{full_name}/actions"))
                    .color(branding::GH_COMMIT)
                    .author(branding::embed_author());

                if active.is_empty() {
                    embed = embed.description("No active workflows found.");
                } else {
                    for wf in &active {
                        let path_short = wf
                            .path
                            .strip_prefix(".github/workflows/")
                            .unwrap_or(&wf.path);
                        embed = embed.field(
                            &wf.name,
                            format!("`{path_short}` | ID: `{}`", wf.id),
                            false,
                        );
                    }
                    embed = embed.footer(branding::embed_footer(Some(&format!(
                        "{} active of {} total",
                        active.len(),
                        wfs.len()
                    ))));
                }

                // Chart button for workflow runs
                let chart_row = poise::serenity_prelude::CreateActionRow::Buttons(vec![
                    poise::serenity_prelude::CreateButton::new(format!(
                        "chart|{full_name}|workflow_runs"
                    ))
                    .label("Run History")
                    .style(poise::serenity_prelude::ButtonStyle::Secondary)
                    .emoji(poise::serenity_prelude::ReactionType::Unicode(
                        "\u{1F4CA}".to_owned(),
                    )),
                ]);

                ctx.send(
                    poise::CreateReply::default()
                        .embed(embed)
                        .components(vec![chart_row]),
                )
                .await
                .map_err(|e| e.to_string())?;
                Ok(())
            }
            Err(e) => {
                warn!(error = %e, repo = full_name, "Failed to fetch workflows");
                Err(format!("Failed to fetch workflows for `{full_name}`: {e}"))
            }
        }
    })
    .await
    {
        Ok(Ok(())) => Ok(()),
        Ok(Err(msg)) => send_error(ctx, &msg).await,
        Err(_) => send_error(ctx, "The request timed out — please try again.").await,
    }
}

// ── /github dispatch ───────────────────────────────────────────────

/// Trigger a GitHub Actions workflow dispatch event.
#[poise::command(slash_command)]
async fn dispatch(
    ctx: Context<'_>,
    #[description = "Workflow file name (e.g. ci.yml) or numeric ID"] workflow: String,
    #[description = "Git ref to run against (branch/tag, default: dev)"] git_ref: Option<String>,
    #[description = "Repository (owner/repo, default from env)"] repo: Option<String>,
) -> Result<(), Error> {
    if !check_tier(ctx, CommandTier::Admin).await? {
        return Ok(());
    }
    ctx.defer().await?;

    match tokio::time::timeout(COMMAND_TIMEOUT, async {
        let gh = get_github_client(ctx).await?;
        let (owner, repo_name) = parse_repo(&repo, &ctx.data().app.default_repo);
        let full_name = format!("{}/{}", owner, repo_name);
        let ref_name = git_ref.as_deref().unwrap_or("dev");

        match gh
            .dispatch_workflow(&owner, &repo_name, &workflow, ref_name, None)
            .await
        {
            Ok(()) => {
                info!(
                    user = %ctx.author().name,
                    repo = full_name,
                    workflow = %workflow,
                    git_ref = ref_name,
                    "Workflow dispatched via Discord"
                );

                let embed = poise::serenity_prelude::CreateEmbed::new()
                    .title(format!("Dispatched `{workflow}`"))
                    .description(format!(
                        "Workflow triggered on `{ref_name}` in `{full_name}`"
                    ))
                    .color(branding::GH_COMMIT)
                    .author(branding::embed_author())
                    .footer(branding::embed_footer(Some(&full_name)));

                ctx.send(poise::CreateReply::default().embed(embed))
                    .await
                    .map_err(|e| e.to_string())?;
                Ok(())
            }
            Err(e) => {
                warn!(error = %e, repo = full_name, workflow = %workflow, "Failed to dispatch workflow");
                Err(format!(
                    "Failed to dispatch `{workflow}` in `{full_name}`: {e}"
                ))
            }
        }
    })
    .await
    {
        Ok(Ok(())) => Ok(()),
        Ok(Err(msg)) => send_error(ctx, &msg).await,
        Err(_) => send_error(ctx, "The request timed out — please try again.").await,
    }
}

// ── /github merge ──────────────────────────────────────────────────

/// Merge a pull request.
#[poise::command(slash_command)]
async fn merge(
    ctx: Context<'_>,
    #[description = "Pull request number"] number: u64,
    #[description = "Merge method: merge, squash, or rebase (default: squash)"] method: Option<
        String,
    >,
    #[description = "Repository (owner/repo, default from env)"] repo: Option<String>,
) -> Result<(), Error> {
    if !check_tier(ctx, CommandTier::Admin).await? {
        return Ok(());
    }
    ctx.defer().await?;

    match tokio::time::timeout(COMMAND_TIMEOUT, async {
        let gh = get_github_client(ctx).await?;
        let (owner, repo_name) = parse_repo(&repo, &ctx.data().app.default_repo);
        let full_name = format!("{}/{}", owner, repo_name);

        let merge_method = method.as_deref().unwrap_or("squash").to_lowercase();

        if !["merge", "squash", "rebase"].contains(&merge_method.as_str()) {
            return Err("Invalid merge method. Use `merge`, `squash`, or `rebase`.".to_string());
        }

        let req = MergePullRequest {
            commit_title: None,
            commit_message: None,
            merge_method: Some(merge_method.clone()),
        };

        match gh.merge_pull(&owner, &repo_name, number, &req).await {
            Ok(result) => {
                info!(
                    user = %ctx.author().name,
                    repo = full_name,
                    pr = number,
                    method = %merge_method,
                    sha = %result.sha,
                    "PR merged via Discord"
                );

                let embed = poise::serenity_prelude::CreateEmbed::new()
                    .title(format!("Merged PR #{number}"))
                    .description(format!(
                        "{} into `{full_name}` via **{merge_method}**\nCommit: `{}`",
                        result.message,
                        &result.sha[..7.min(result.sha.len())]
                    ))
                    .color(branding::GH_PURPLE)
                    .author(branding::embed_author())
                    .footer(branding::embed_footer(Some(&full_name)));

                ctx.send(poise::CreateReply::default().embed(embed))
                    .await
                    .map_err(|e| e.to_string())?;
                Ok(())
            }
            Err(e) => {
                warn!(error = %e, repo = full_name, pr = number, "Failed to merge PR");
                Err(format!(
                    "Failed to merge PR #{number} in `{full_name}`: {e}"
                ))
            }
        }
    })
    .await
    {
        Ok(Ok(())) => Ok(()),
        Ok(Err(msg)) => send_error(ctx, &msg).await,
        Err(_) => send_error(ctx, "The request timed out — please try again.").await,
    }
}
