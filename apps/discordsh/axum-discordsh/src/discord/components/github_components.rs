//! Component interaction handler for GitHub issue/PR management.
//!
//! Custom ID format: `gh|<owner/repo>|<number>|<action>`
//! Values come from the select menu selection.

use poise::serenity_prelude as serenity;
use std::sync::Arc;
use tracing::{info, warn};

use crate::discord::game::github_cards;
use crate::discord::github::resolve_github_token;
use crate::discord::github_permissions::CommandTier;
use crate::state::AppState;

/// Handle a GitHub component interaction (custom_id starts with "gh|").
pub async fn handle_github_component(
    ctx: &serenity::Context,
    component: &serenity::ComponentInteraction,
    app: &Arc<AppState>,
) {
    let parts: Vec<&str> = component.data.custom_id.split('|').collect();
    if parts.len() < 4 {
        let _ = component
            .create_response(
                ctx,
                serenity::CreateInteractionResponse::Message(
                    serenity::CreateInteractionResponseMessage::new()
                        .content("Invalid interaction.")
                        .ephemeral(true),
                ),
            )
            .await;
        return;
    }

    let repo_full = parts[1]; // "KBVE/kbve"
    let number: u64 = match parts[2].parse() {
        Ok(n) => n,
        Err(_) => return,
    };
    let action = parts[3];

    // Permission check: require Board tier
    let has_permission = if let Some(member) = &component.member {
        let perms = member
            .permissions
            .unwrap_or_else(serenity::Permissions::empty);
        app.github_guard
            .has_tier_permission(CommandTier::Board, perms)
    } else {
        false
    };

    if !has_permission {
        let _ = component
            .create_response(
                ctx,
                serenity::CreateInteractionResponse::Message(
                    serenity::CreateInteractionResponseMessage::new()
                        .content("You need Board-tier permissions to manage labels.")
                        .ephemeral(true),
                ),
            )
            .await;
        return;
    }

    // Extract the selected value
    let selected_value = match &component.data.kind {
        serenity::ComponentInteractionDataKind::StringSelect { values } => {
            values.first().cloned().unwrap_or_default()
        }
        _ => String::new(),
    };

    let (owner, repo_name) = match repo_full.split_once('/') {
        Some((o, r)) => (o, r),
        None => return,
    };

    // Resolve GitHub token
    let guild_id = component.guild_id.map(|g| g.get());
    let token = match resolve_github_token(guild_id).await {
        Some(t) => t,
        None => {
            let _ = component
                .create_response(
                    ctx,
                    serenity::CreateInteractionResponse::Message(
                        serenity::CreateInteractionResponseMessage::new()
                            .content("No GitHub token configured.")
                            .ephemeral(true),
                    ),
                )
                .await;
            return;
        }
    };

    let gh =
        jedi::entity::github::GitHubClient::new(&token).with_policy(app.github_repo_policy.clone());

    match action {
        "priority" => {
            handle_priority_change(
                ctx,
                component,
                &gh,
                app,
                owner,
                repo_name,
                number,
                &selected_value,
            )
            .await;
        }
        "settype" => {
            handle_set_type(
                ctx,
                component,
                &gh,
                app,
                owner,
                repo_name,
                number,
                &selected_value,
            )
            .await;
        }
        _ => {
            let _ = component
                .create_response(
                    ctx,
                    serenity::CreateInteractionResponse::Message(
                        serenity::CreateInteractionResponseMessage::new()
                            .content("Unknown action.")
                            .ephemeral(true),
                    ),
                )
                .await;
        }
    }
}

async fn handle_priority_change(
    ctx: &serenity::Context,
    component: &serenity::ComponentInteraction,
    gh: &jedi::entity::github::GitHubClient,
    app: &Arc<AppState>,
    owner: &str,
    repo_name: &str,
    number: u64,
    selected: &str,
) {
    let new_level: u8 = selected.parse().unwrap_or(0);

    // Defer the response (we'll edit it after API calls)
    let _ = component
        .create_response(
            ctx,
            serenity::CreateInteractionResponse::Defer(
                serenity::CreateInteractionResponseMessage::new().ephemeral(true),
            ),
        )
        .await;

    // Get current issue to find existing priority label
    let issue = match gh.get_issue(owner, repo_name, number).await {
        Ok(i) => i,
        Err(e) => {
            warn!(error = %e, "Failed to fetch issue for priority change");
            let _ = component
                .edit_response(
                    ctx,
                    serenity::EditInteractionResponse::new()
                        .content(format!("Failed to fetch issue: {e}")),
                )
                .await;
            return;
        }
    };

    // Remove existing priority label
    let current_priority = github_cards::priority_from_labels(&issue.labels);
    if current_priority > 0 {
        let old_label = github_cards::priority_level_label(current_priority);
        if !old_label.is_empty() {
            let _ = gh.remove_label(owner, repo_name, number, old_label).await;
        }
    }

    // Add new priority label (if not "none")
    if new_level > 0 {
        let new_label = github_cards::priority_level_label(new_level);
        if !new_label.is_empty() {
            if let Err(e) = gh.add_labels(owner, repo_name, number, &[new_label]).await {
                warn!(error = %e, "Failed to add priority label");
                let _ = component
                    .edit_response(
                        ctx,
                        serenity::EditInteractionResponse::new()
                            .content(format!("Failed to set priority: {e}")),
                    )
                    .await;
                return;
            }
        }
    }

    // Invalidate cache
    app.github_cache.invalidate_issue(owner, repo_name, number);

    let level_name = match new_level {
        0 => "None",
        1 => "Low",
        2 => "Medium",
        3 => "High",
        4 => "Critical",
        5 => "Blocker",
        6 => "Emergency",
        _ => "Unknown",
    };

    info!(
        user = %component.user.name,
        issue = number,
        priority = level_name,
        "Priority updated via Discord component"
    );

    let _ = component
        .edit_response(
            ctx,
            serenity::EditInteractionResponse::new()
                .content(format!("Priority set to **{level_name}** for #{number}.")),
        )
        .await;
}

async fn handle_set_type(
    ctx: &serenity::Context,
    component: &serenity::ComponentInteraction,
    gh: &jedi::entity::github::GitHubClient,
    app: &Arc<AppState>,
    owner: &str,
    repo_name: &str,
    number: u64,
    type_name: &str,
) {
    let _ = component
        .create_response(
            ctx,
            serenity::CreateInteractionResponse::Defer(
                serenity::CreateInteractionResponseMessage::new().ephemeral(true),
            ),
        )
        .await;

    match gh
        .set_issue_type(owner, repo_name, number, Some(type_name))
        .await
    {
        Ok(_) => {
            app.github_cache.invalidate_issue(owner, repo_name, number);

            info!(
                user = %component.user.name,
                issue = number,
                issue_type = type_name,
                "Issue type set via Discord component"
            );

            let _ = component
                .edit_response(
                    ctx,
                    serenity::EditInteractionResponse::new()
                        .content(format!("Issue type set to **{type_name}** for #{number}.")),
                )
                .await;
        }
        Err(e) => {
            warn!(error = %e, "Failed to set issue type");
            let _ = component
                .edit_response(
                    ctx,
                    serenity::EditInteractionResponse::new()
                        .content(format!("Failed to set issue type: {e}")),
                )
                .await;
        }
    }
}
