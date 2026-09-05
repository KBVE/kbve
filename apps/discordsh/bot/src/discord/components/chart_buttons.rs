//! Chart button interaction handler — renders on-demand SVG charts
//! when users click chart buttons on `/github` and `/health` embeds.

use poise::serenity_prelude as serenity;
use std::sync::Arc;
use tracing::{info, warn};

use crate::discord::branding;
use crate::discord::game::github_cards;
use crate::discord::github::resolve_github_token;
use crate::state::AppState;

/// Handle a component interaction whose `custom_id` starts with `"chart|"`.
///
/// Custom ID format: `chart|<owner/repo>|<chart_type>` or `chart|health|history`
/// Chart types: `languages`, `activity`, `labels`, `pr_status`, `commit_freq`,
/// `contributors`, `workflow_runs`, `history`
pub async fn handle_chart_component(
    ctx: &serenity::Context,
    component: &serenity::ComponentInteraction,
    app: &Arc<AppState>,
) {
    let parts: Vec<&str> = component.data.custom_id.split('|').collect();
    if parts.len() != 3 {
        warn!(custom_id = %component.data.custom_id, "Invalid chart custom_id");
        return;
    }

    let target = parts[1].to_owned();
    let chart_type = parts[2].to_owned();

    // Defer with ephemeral — chart is shown only to the requester
    if let Err(e) = component
        .create_response(
            &ctx.http,
            serenity::CreateInteractionResponse::Defer(
                serenity::CreateInteractionResponseMessage::new().ephemeral(true),
            ),
        )
        .await
    {
        warn!(error = %e, "Failed to defer chart interaction");
        return;
    }

    // Health chart is special — no GitHub API needed
    if target == "health" && chart_type == "history" {
        handle_health_chart(ctx, component, app).await;
        return;
    }

    let result = render_github_chart(ctx, component, app, &target, &chart_type).await;

    match result {
        Ok((png_bytes, filename, title, full_name)) => {
            let attachment = serenity::CreateAttachment::bytes(png_bytes, filename.clone());
            let embed = serenity::CreateEmbed::new()
                .title(format!("{title} -- {full_name}"))
                .image(format!("attachment://{filename}"))
                .color(branding::GH_DARK)
                .author(branding::embed_author())
                .footer(branding::embed_footer(Some(&full_name)));

            let _ = component
                .edit_response(
                    &ctx.http,
                    serenity::EditInteractionResponse::new()
                        .embed(embed)
                        .new_attachment(attachment),
                )
                .await;
        }
        Err(msg) => {
            warn!(error = %msg, "Chart render failed");
            let _ = component
                .edit_response(
                    &ctx.http,
                    serenity::EditInteractionResponse::new()
                        .content(format!("Failed to render chart: {msg}")),
                )
                .await;
        }
    }
}

async fn handle_health_chart(
    ctx: &serenity::Context,
    component: &serenity::ComponentInteraction,
    app: &Arc<AppState>,
) {
    let history = app.health_monitor.history().await;

    if history.len() < 2 {
        let _ = component
            .edit_response(
                &ctx.http,
                serenity::EditInteractionResponse::new()
                    .content("Not enough health data yet — try again in a few minutes."),
            )
            .await;
        return;
    }

    let uptime = app
        .health_monitor
        .snapshot()
        .await
        .map(|s| s.uptime_formatted.clone())
        .unwrap_or_else(|| "unknown".to_owned());

    let fontdb = app.fontdb.clone();

    let result = tokio::task::spawn_blocking(move || {
        github_cards::render_health_chart_blocking(&history, &uptime, &fontdb)
    })
    .await;

    match result {
        Ok(Ok(png_bytes)) => {
            let attachment = serenity::CreateAttachment::bytes(png_bytes, "health.png");
            let embed = serenity::CreateEmbed::new()
                .title("System Health History")
                .image("attachment://health.png")
                .color(0x57F287)
                .author(branding::embed_author())
                .footer(branding::embed_footer(None));

            let _ = component
                .edit_response(
                    &ctx.http,
                    serenity::EditInteractionResponse::new()
                        .embed(embed)
                        .new_attachment(attachment),
                )
                .await;
        }
        Ok(Err(e)) => {
            warn!(error = %e, "Health chart render error");
            let _ = component
                .edit_response(
                    &ctx.http,
                    serenity::EditInteractionResponse::new()
                        .content(format!("Chart render failed: {e}")),
                )
                .await;
        }
        Err(e) => {
            warn!(error = %e, "Health chart task panicked");
            let _ = component
                .edit_response(
                    &ctx.http,
                    serenity::EditInteractionResponse::new().content("Chart render failed"),
                )
                .await;
        }
    }
}

async fn render_github_chart(
    _ctx: &serenity::Context,
    component: &serenity::ComponentInteraction,
    app: &Arc<AppState>,
    repo: &str,
    chart_type: &str,
) -> Result<(Vec<u8>, String, String, String), String> {
    let (owner, repo_name) = repo
        .split_once('/')
        .ok_or_else(|| "Invalid repository format.".to_string())?;

    let guild_id = component.guild_id.map(|g| g.get());
    let token = resolve_github_token(guild_id)
        .await
        .ok_or_else(|| "No GitHub token configured for this server.".to_string())?;

    let gh =
        jedi::entity::github::GitHubClient::new(&token).with_policy(app.github_repo_policy.clone());

    let fontdb = app.fontdb.clone();
    let owner = owner.to_owned();
    let repo_name = repo_name.to_owned();
    let full_name = format!("{}/{}", owner, repo_name);

    info!(
        user = %component.user.name,
        repo = full_name,
        chart = chart_type,
        "Chart requested"
    );

    match chart_type {
        "languages" => {
            let langs = gh
                .get_languages(&owner, &repo_name)
                .await
                .map_err(|e| format!("Failed to fetch languages: {e}"))?;

            let full_clone = full_name.clone();
            let png = tokio::task::spawn_blocking(move || {
                github_cards::render_languages_chart_blocking(&langs, &full_clone, &fontdb)
            })
            .await
            .map_err(|e| format!("Task panicked: {e}"))??;

            Ok((
                png,
                "languages.png".to_owned(),
                "Languages".to_owned(),
                full_name,
            ))
        }
        "activity" => {
            let issues = gh
                .list_issues(&owner, &repo_name, None, Some(100))
                .await
                .map_err(|e| format!("Failed to fetch issues: {e}"))?;

            let full_clone = full_name.clone();
            let png = tokio::task::spawn_blocking(move || {
                github_cards::render_activity_chart_blocking(&issues, &full_clone, &fontdb)
            })
            .await
            .map_err(|e| format!("Task panicked: {e}"))??;

            Ok((
                png,
                "activity.png".to_owned(),
                "Issue Activity".to_owned(),
                full_name,
            ))
        }
        "labels" => {
            let issues = gh
                .list_issues(&owner, &repo_name, Some("open"), Some(100))
                .await
                .map_err(|e| format!("Failed to fetch issues: {e}"))?;

            let full_clone = full_name.clone();
            let png = tokio::task::spawn_blocking(move || {
                github_cards::render_label_chart_blocking(&issues, &full_clone, &fontdb)
            })
            .await
            .map_err(|e| format!("Task panicked: {e}"))??;

            Ok((
                png,
                "labels.png".to_owned(),
                "Label Distribution".to_owned(),
                full_name,
            ))
        }
        "pr_status" => {
            let pulls = gh
                .list_pulls(&owner, &repo_name, Some("open"), Some(25))
                .await
                .map_err(|e| format!("Failed to fetch PRs: {e}"))?;

            let full_clone = full_name.clone();
            let png = tokio::task::spawn_blocking(move || {
                github_cards::render_pr_status_chart_blocking(&pulls, &full_clone, &fontdb)
            })
            .await
            .map_err(|e| format!("Task panicked: {e}"))??;

            Ok((
                png,
                "pr_status.png".to_owned(),
                "PR Status".to_owned(),
                full_name,
            ))
        }
        "commit_freq" => {
            let commits = gh
                .list_commits(&owner, &repo_name, None, Some(100))
                .await
                .map_err(|e| format!("Failed to fetch commits: {e}"))?;

            let full_clone = full_name.clone();
            let png = tokio::task::spawn_blocking(move || {
                github_cards::render_commit_frequency_chart_blocking(&commits, &full_clone, &fontdb)
            })
            .await
            .map_err(|e| format!("Task panicked: {e}"))??;

            Ok((
                png,
                "commit_freq.png".to_owned(),
                "Commit Frequency".to_owned(),
                full_name,
            ))
        }
        "contributors" => {
            let contribs = gh
                .get_contributors(&owner, &repo_name, Some(25))
                .await
                .map_err(|e| format!("Failed to fetch contributors: {e}"))?;

            if contribs.is_empty() {
                return Err("No contributors found.".to_owned());
            }

            let full_clone = full_name.clone();
            let png = tokio::task::spawn_blocking(move || {
                github_cards::render_contributors_chart_blocking(&contribs, &full_clone, &fontdb)
            })
            .await
            .map_err(|e| format!("Task panicked: {e}"))??;

            Ok((
                png,
                "contributors.png".to_owned(),
                "Top Contributors".to_owned(),
                full_name,
            ))
        }
        "workflow_runs" => {
            let runs = gh
                .list_workflow_runs(&owner, &repo_name, Some(30))
                .await
                .map_err(|e| format!("Failed to fetch workflow runs: {e}"))?;

            if runs.is_empty() {
                return Err("No workflow runs found.".to_owned());
            }

            let full_clone = full_name.clone();
            let png = tokio::task::spawn_blocking(move || {
                github_cards::render_workflow_runs_chart_blocking(&runs, &full_clone, &fontdb)
            })
            .await
            .map_err(|e| format!("Task panicked: {e}"))??;

            Ok((
                png,
                "workflow_runs.png".to_owned(),
                "Workflow Runs".to_owned(),
                full_name,
            ))
        }
        other => Err(format!("Unknown chart type: {other}")),
    }
}
