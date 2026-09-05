use jedi::entity::github::GitHubClient;
use kbve::CachedIssue;
use poise::serenity_prelude as serenity;
use tracing::{info, warn};

use crate::discord::bot::{Context, Error};
use crate::discord::branding;
use crate::discord::commands::github_board::view_issue_impl;
use crate::discord::github::resolve_github_token;
use crate::discord::github_permissions::{CommandTier, check_tier, github_permission_check};

enum IssuePrecheck {
    Cached {
        title: String,
        html_url: String,
        assignee_count: usize,
        already_assigned: bool,
    },
    Reject(String),
    NeedsRest,
}

const COMMAND_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(15);
const DEFAULT_PROFILE_URL_BASE: &str = "https://kbve.com/@";
const DEFAULT_CLAIM_MAX_ASSIGNEES: usize = 2;

#[poise::command(
    slash_command,
    check = "github_permission_check",
    subcommands("view", "claim")
)]
pub async fn gh(_ctx: Context<'_>) -> Result<(), Error> {
    Ok(())
}

#[poise::command(slash_command)]
async fn view(
    ctx: Context<'_>,
    #[description = "Issue or PR number"] number: u64,
) -> Result<(), Error> {
    if !check_tier(ctx, CommandTier::Read).await? {
        return Ok(());
    }

    let (owner, repo_name) = ctx.data().app.default_repo.clone();
    view_issue_impl(ctx, &owner, &repo_name, number).await
}

#[poise::command(slash_command)]
async fn claim(
    ctx: Context<'_>,
    #[description = "Issue number to claim"] number: u64,
    #[description = "Repository (owner/repo, default from env)"] repo: Option<String>,
) -> Result<(), Error> {
    if !check_tier(ctx, CommandTier::Read).await? {
        return Ok(());
    }
    ctx.defer().await?;

    let (owner, repo_name) = parse_repo(&repo, &ctx.data().app.default_repo);
    let full_name = format!("{owner}/{repo_name}");

    if !ctx
        .data()
        .app
        .github_repo_policy
        .is_allowed(&owner, &repo_name)
    {
        return send_ephemeral(
            ctx,
            &format!("Repository `{full_name}` is not on the claim allowlist."),
        )
        .await;
    }

    let discord_id = ctx.author().id.get();
    let identity = match ctx
        .data()
        .app
        .members
        .lookup_claim_identity(discord_id)
        .await
    {
        Some(i) => i,
        None => {
            return send_ephemeral(
                ctx,
                "No KBVE account linked to your Discord. Sign in at <https://kbve.com/account/> first.",
            )
            .await;
        }
    };

    let Some(github_login) = identity.github_login.clone().filter(|s| !s.is_empty()) else {
        return send_ephemeral(
            ctx,
            "Your KBVE account is missing a linked GitHub identity. Link one at <https://kbve.com/account/>.",
        )
        .await;
    };

    let token_guild = ctx.guild_id().map(|g| g.get());
    let token = match resolve_github_token(token_guild).await {
        Some(t) => t,
        None => {
            return send_ephemeral(
                ctx,
                "No GitHub token configured for this server. A server admin can store one at <https://kbve.com>.",
            )
            .await;
        }
    };

    let policy = ctx.data().app.github_repo_policy.clone();
    let mut gh = GitHubClient::new(&token).with_policy(policy);
    if let Ok(base) = std::env::var("GITHUB_API_BASE_URL")
        && !base.is_empty()
    {
        gh = gh.with_base_url(&base);
    }

    let max_assignees = claim_max_assignees();

    let precheck = precheck_from_store(ctx, &owner, &repo_name, number, &github_login).await;

    let outcome = tokio::time::timeout(COMMAND_TIMEOUT, async {
        let (title, html_url, assignee_count, already_assigned) = match precheck {
            IssuePrecheck::Cached {
                title,
                html_url,
                assignee_count,
                already_assigned,
            } => (title, html_url, assignee_count, already_assigned),
            IssuePrecheck::Reject(msg) => return Err(msg),
            IssuePrecheck::NeedsRest => {
                let issue = gh
                    .get_issue(&owner, &repo_name, number)
                    .await
                    .map_err(|e| format!("Failed to load #{number} from `{full_name}`: {e}"))?;

                if issue.pull_request.is_some() {
                    return Err(format!(
                        "#{number} is a pull request, not an issue — request a review instead of claiming."
                    ));
                }
                if issue.state != "open" {
                    return Err(format!("#{number} is not open (state: `{}`).", issue.state));
                }
                let already_assigned = issue
                    .assignees
                    .iter()
                    .any(|a| a.login.eq_ignore_ascii_case(&github_login));
                (
                    issue.title,
                    issue.html_url,
                    issue.assignees.len(),
                    already_assigned,
                )
            }
        };

        if already_assigned {
            return Err(format!("You already have #{number} assigned on GitHub."));
        }
        if assignee_count >= max_assignees {
            return Err(format!(
                "#{number} already has {assignee_count} assignee(s). Coordinate with them before claiming."
            ));
        }

        gh.add_assignees(&owner, &repo_name, number, &[github_login.as_str()])
            .await
            .map_err(|e| format!("Failed to assign you to #{number}: {e}"))?;

        Ok((title, html_url))
    })
    .await;

    let (issue_title, issue_url) = match outcome {
        Ok(Ok(pair)) => pair,
        Ok(Err(msg)) => return send_ephemeral(ctx, &msg).await,
        Err(_) => return send_ephemeral(ctx, "The request timed out — please try again.").await,
    };

    ctx.data()
        .app
        .github_cache
        .invalidate_issue(&owner, &repo_name, number);
    ctx.data()
        .app
        .github_store
        .invalidate(&owner, &repo_name, number as u32);

    info!(
        discord_id,
        user_id = %identity.user_id,
        kbve_username = ?identity.kbve_username,
        github_login = %github_login,
        repo = %full_name,
        issue = number,
        "Issue claimed via /gh claim"
    );

    let profile_link = identity.kbve_username().map(|u| {
        let base = profile_url_base();
        format!("[@{u}]({base}{u})")
    });

    let assignee_line = match profile_link {
        Some(link) => format!("{link} · `{github_login}`"),
        None => format!("`{github_login}`"),
    };

    let title = format!("Claimed #{number} — {issue_title}");
    let description = format!("Repository: `{full_name}`\nAssignee: {assignee_line}");

    let embed = serenity::CreateEmbed::new()
        .title(title)
        .description(description)
        .url(&issue_url)
        .color(branding::GH_BLUE)
        .author(branding::embed_author())
        .footer(branding::embed_footer(None));

    ctx.send(poise::CreateReply::default().embed(embed))
        .await
        .map_err(|e| {
            warn!(error = %e, "Failed to send claim confirmation");
            e
        })?;

    Ok(())
}

async fn precheck_from_store(
    ctx: Context<'_>,
    owner: &str,
    repo: &str,
    number: u64,
    github_login: &str,
) -> IssuePrecheck {
    let store = &ctx.data().app.github_store;
    if !store.is_enabled() {
        return IssuePrecheck::NeedsRest;
    }

    let cached = match store.get_issue(owner, repo, number as u32).await {
        Ok(Some(issue)) => issue,
        Ok(None) => return IssuePrecheck::NeedsRest,
        Err(e) => {
            warn!(error = %e, owner, repo, number, "github_store lookup failed; falling back to REST");
            return IssuePrecheck::NeedsRest;
        }
    };

    if cached.is_pull_request {
        return IssuePrecheck::Reject(format!(
            "#{number} is a pull request, not an issue — request a review instead of claiming."
        ));
    }

    if cached.state != "open" {
        return IssuePrecheck::Reject(format!(
            "#{number} is not open (state: `{}`).",
            cached.state
        ));
    }

    if cached.is_stale(store.stale_after()) {
        return IssuePrecheck::NeedsRest;
    }

    let assignee_count = cached.assignee_count();
    let already_assigned = cached
        .assignee_logins()
        .iter()
        .any(|l| l.eq_ignore_ascii_case(github_login));

    let CachedIssue {
        title, html_url, ..
    } = cached;
    IssuePrecheck::Cached {
        title,
        html_url,
        assignee_count,
        already_assigned,
    }
}

fn parse_repo(repo: &Option<String>, default: &(String, String)) -> (String, String) {
    match repo.as_deref().filter(|r| r.contains('/')) {
        Some(r) => {
            let (owner, name) = r.split_once('/').unwrap();
            (owner.to_owned(), name.to_owned())
        }
        None => default.clone(),
    }
}

async fn send_ephemeral(ctx: Context<'_>, msg: &str) -> Result<(), Error> {
    ctx.send(poise::CreateReply::default().content(msg).ephemeral(true))
        .await?;
    Ok(())
}

fn profile_url_base() -> String {
    std::env::var("KBVE_PROFILE_URL_BASE")
        .ok()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| DEFAULT_PROFILE_URL_BASE.to_owned())
}

fn claim_max_assignees() -> usize {
    std::env::var("GITHUB_CLAIM_MAX_ASSIGNEES")
        .ok()
        .and_then(|s| s.parse().ok())
        .filter(|n| *n > 0)
        .unwrap_or(DEFAULT_CLAIM_MAX_ASSIGNEES)
}
