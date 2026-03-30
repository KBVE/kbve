//! Top-level `/gh <number>` shortcut command.
//!
//! Uses the default repo from `AppState` and delegates to the shared
//! issue/PR viewer logic.

use crate::discord::bot::{Context, Error};
use crate::discord::commands::github_board::view_issue_impl;
use crate::discord::github_permissions::{CommandTier, check_tier, github_permission_check};

/// Quick issue/PR lookup using the default repository.
#[poise::command(slash_command, check = "github_permission_check")]
pub async fn gh(
    ctx: Context<'_>,
    #[description = "Issue or PR number"] number: u64,
) -> Result<(), Error> {
    if !check_tier(ctx, CommandTier::Read).await? {
        return Ok(());
    }

    let (owner, repo_name) = ctx.data().app.default_repo.clone();
    view_issue_impl(ctx, &owner, &repo_name, number).await
}
