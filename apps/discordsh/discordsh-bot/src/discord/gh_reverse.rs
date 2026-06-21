use std::sync::Arc;

use jedi::entity::github::GitHubClient;
use poise::serenity_prelude as serenity;
use tracing::{debug, info, warn};

use crate::discord::github::resolve_github_token;
use crate::state::AppState;

const DIRECTION: &str = "discord_to_github";
const MAX_COMMENT_LEN: usize = 65_536;
const TRUNCATE_NOTICE: &str = "\n\n…(truncated)";
const TOMBSTONE: &str = "_[deleted on Discord]_";

fn reverse_enabled() -> bool {
    !matches!(
        std::env::var("GH_REVERSE_SYNC_ENABLED").ok().as_deref(),
        Some("0") | Some("false") | Some("off")
    )
}

fn delete_mode_hard() -> bool {
    matches!(
        std::env::var("GH_REVERSE_DELETE_MODE").ok().as_deref(),
        Some("delete")
    )
}

async fn github_client_for(app: &Arc<AppState>, guild_id: u64) -> Option<GitHubClient> {
    let token = resolve_github_token(Some(guild_id)).await?;
    let client = GitHubClient::new(&token).with_policy(app.github_repo_policy.clone());
    let client = match std::env::var("GITHUB_API_BASE_URL") {
        Ok(url) if !url.is_empty() => client.with_base_url(&url),
        _ => client,
    };
    Some(client)
}

/// A human reply in a synced issue thread → a GitHub issue comment.
///
/// Guards (cheapest first, DB lookup last): reverse-sync enabled + store
/// configured; not bot-authored / not a webhook (echo); a regular/reply message
/// (not a system/thread-created notice); in a guild; non-empty payload; the
/// channel is a tracked forum thread mapped to a `gh.issue`; the message's guild
/// matches the mapped guild; a guild PAT resolves; and the message has not
/// already been mirrored (lease-based idempotency claim). Any failure logs +
/// returns; it never panics and never blocks the forward sync or IRC relay.
pub async fn handle_reverse_message(message: &serenity::Message, app: &Arc<AppState>) {
    if !reverse_enabled() || !app.github_store.is_enabled() {
        return;
    }
    // Echo guard: our own forward posts, other bots, and webhook deliveries.
    if message.author.bot || message.webhook_id.is_some() {
        return;
    }
    // Only mirror real user content — skip system notices (thread created,
    // pins, joins, etc.).
    if !matches!(
        message.kind,
        serenity::MessageType::Regular | serenity::MessageType::InlineReply
    ) {
        return;
    }
    let Some(guild_id) = message.guild_id else {
        return;
    };
    // Skip empty payloads before paying for a thread→issue lookup.
    if message.content.trim().is_empty() && message.attachments.is_empty() {
        return;
    }

    let thread_id = message.channel_id.get() as i64;
    let issue = match app.github_store.get_issue_by_thread_id(thread_id).await {
        Ok(Some(i)) => i,
        Ok(None) => return,
        Err(e) => {
            warn!(error = %e, thread_id, "gh reverse: thread→issue lookup failed");
            return;
        }
    };

    if issue.discord_guild_id != Some(guild_id.get() as i64) {
        warn!(
            thread_id,
            mapped = ?issue.discord_guild_id,
            actual = guild_id.get(),
            "gh reverse: thread guild mismatch, skipping"
        );
        return;
    }

    let author = author_name(message);
    let body = render_comment(&author, &message.content, &message.attachments);
    if body.trim().is_empty() {
        return;
    }

    let message_id = message.id.get() as i64;
    match app
        .github_store
        .claim_comment_mirror(
            message_id,
            thread_id,
            &issue.owner,
            &issue.repo,
            issue.number,
            DIRECTION,
            Some(&author),
        )
        .await
    {
        Ok(true) => {}
        Ok(false) => {
            debug!(
                counter = "pipe_gh_reverse_skipped_loop",
                message_id, "gh reverse: already mirrored, skipping"
            );
            return;
        }
        Err(e) => {
            warn!(error = %e, message_id, "gh reverse: claim_comment_mirror failed");
            return;
        }
    }

    let Some(client) = github_client_for(app, guild_id.get()).await else {
        warn!(
            counter = "pipe_gh_reverse_skipped_auth",
            guild = guild_id.get(),
            number = issue.number,
            "gh reverse: no guild PAT, skipping"
        );
        return;
    };

    match client
        .create_comment(&issue.owner, &issue.repo, issue.number as u64, &body)
        .await
    {
        Ok(c) => {
            if let Err(e) = app
                .github_store
                .set_comment_mirror_github_id(message_id, c.id as i64)
                .await
            {
                warn!(error = %e, message_id, comment_id = c.id, "gh reverse: failed to record comment id");
            }
            info!(
                counter = "pipe_gh_reverse_posted",
                owner = %issue.owner,
                repo = %issue.repo,
                number = issue.number,
                message_id,
                comment_id = c.id,
                "gh reverse: thread reply mirrored to GitHub"
            );
        }
        Err(e) => {
            warn!(
                counter = "pipe_gh_reverse_failed",
                error = %e,
                number = issue.number,
                message_id,
                "gh reverse: create_comment failed"
            );
        }
    }
}

/// An edit to a previously mirrored thread message → PATCH the GH comment.
pub async fn handle_reverse_edit(
    channel_id: serenity::ChannelId,
    message_id: serenity::MessageId,
    author: Option<String>,
    content: Option<String>,
    app: &Arc<AppState>,
) {
    if !reverse_enabled() || !app.github_store.is_enabled() {
        return;
    }
    let Some(content) = content else {
        return;
    };

    let mid = message_id.get() as i64;
    let mirror = match app.github_store.get_comment_mirror(mid).await {
        Ok(Some(m)) => m,
        Ok(None) => return,
        Err(e) => {
            warn!(error = %e, message_id = mid, "gh reverse: get_comment_mirror (edit) failed");
            return;
        }
    };
    if mirror.direction != DIRECTION || mirror.deleted_at.is_some() {
        return;
    }
    let Some(comment_id) = mirror.github_comment_id else {
        return;
    };

    let Some(guild_id) = guild_for_thread(app, channel_id).await else {
        return;
    };
    let display = author.unwrap_or_else(|| mirror.author.clone().unwrap_or_default());
    let body = render_comment(&display, &content, &[]);

    let Some(client) = github_client_for(app, guild_id).await else {
        warn!(
            counter = "pipe_gh_reverse_skipped_auth",
            message_id = mid,
            "gh reverse: no PAT for edit"
        );
        return;
    };
    match client
        .update_comment(&mirror.owner, &mirror.repo, comment_id as u64, &body)
        .await
    {
        Ok(_) => info!(
            counter = "pipe_gh_reverse_edited",
            message_id = mid,
            comment_id,
            "gh reverse: edit propagated"
        ),
        Err(e) => warn!(
            counter = "pipe_gh_reverse_failed",
            error = %e, message_id = mid, comment_id, "gh reverse: update_comment failed"
        ),
    }
}

/// A delete of a mirrored thread message → tombstone (default) or hard-delete
/// the GH comment, then mark the mirror row deleted.
pub async fn handle_reverse_delete(
    channel_id: serenity::ChannelId,
    message_id: serenity::MessageId,
    app: &Arc<AppState>,
) {
    if !reverse_enabled() || !app.github_store.is_enabled() {
        return;
    }
    let mid = message_id.get() as i64;
    let mirror = match app.github_store.get_comment_mirror(mid).await {
        Ok(Some(m)) => m,
        Ok(None) => return,
        Err(e) => {
            warn!(error = %e, message_id = mid, "gh reverse: get_comment_mirror (delete) failed");
            return;
        }
    };
    if mirror.direction != DIRECTION || mirror.deleted_at.is_some() {
        return;
    }
    let Some(comment_id) = mirror.github_comment_id else {
        return;
    };
    let Some(guild_id) = guild_for_thread(app, channel_id).await else {
        return;
    };
    let Some(client) = github_client_for(app, guild_id).await else {
        warn!(
            counter = "pipe_gh_reverse_skipped_auth",
            message_id = mid,
            "gh reverse: no PAT for delete"
        );
        return;
    };

    let outcome = if delete_mode_hard() {
        client
            .delete_comment(&mirror.owner, &mirror.repo, comment_id as u64)
            .await
            .map(|_| "deleted")
    } else {
        client
            .update_comment(&mirror.owner, &mirror.repo, comment_id as u64, TOMBSTONE)
            .await
            .map(|_| "tombstoned")
    };

    match outcome {
        Ok(kind) => {
            if let Err(e) = app.github_store.mark_comment_mirror_deleted(mid).await {
                warn!(error = %e, message_id = mid, "gh reverse: mark_comment_mirror_deleted failed");
            }
            info!(
                counter = "pipe_gh_reverse_deleted",
                message_id = mid,
                comment_id,
                kind,
                "gh reverse: delete propagated"
            );
        }
        Err(e) => warn!(
            counter = "pipe_gh_reverse_failed",
            error = %e, message_id = mid, comment_id, "gh reverse: delete propagation failed"
        ),
    }
}

async fn guild_for_thread(app: &Arc<AppState>, channel_id: serenity::ChannelId) -> Option<u64> {
    match app
        .github_store
        .get_issue_by_thread_id(channel_id.get() as i64)
        .await
    {
        Ok(Some(issue)) => issue.discord_guild_id.map(|g| g as u64),
        _ => None,
    }
}

fn author_name(message: &serenity::Message) -> String {
    message
        .author
        .global_name
        .clone()
        .unwrap_or_else(|| message.author.name.clone())
}

/// Render a GitHub comment body from a Discord message: attribution prefix,
/// neutralized mentions (no pings reach GitHub), appended attachment URLs, and
/// a hard truncate to GitHub's 65536-char limit.
fn render_comment(author: &str, content: &str, attachments: &[serenity::Attachment]) -> String {
    let mut body = String::new();
    let who = neutralize_mentions(author.trim());
    if !who.is_empty() {
        body.push_str(&format!("**{who}** _(via Discord)_:\n\n"));
    }
    body.push_str(&neutralize_mentions(content.trim()));
    for att in attachments {
        body.push_str(&format!("\n\n{}", att.url));
    }
    truncate_comment(&body)
}

/// Insert a zero-width space after every `@` so no Discord content can ping a
/// GitHub user, team, or `@everyone`/`@here` once mirrored.
fn neutralize_mentions(input: &str) -> String {
    input.replace('@', "@\u{200b}")
}

fn truncate_comment(s: &str) -> String {
    if s.len() <= MAX_COMMENT_LEN {
        return s.to_string();
    }
    let budget = MAX_COMMENT_LEN - TRUNCATE_NOTICE.len();
    let cut = s
        .char_indices()
        .take_while(|(i, _)| *i <= budget)
        .last()
        .map(|(i, _)| i)
        .unwrap_or(0);
    format!("{}{}", &s[..cut], TRUNCATE_NOTICE)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn neutralize_blocks_mass_mentions() {
        let out = neutralize_mentions("hey @everyone and @here and @user");
        assert!(!out.contains("@everyone"));
        assert!(!out.contains("@here"));
        assert!(out.contains("@\u{200b}everyone"));
    }

    #[test]
    fn render_has_attribution_and_attachments() {
        let body = render_comment("h0lyMac", "hello world", &[]);
        assert!(body.starts_with("**h0lyMac** _(via Discord)_:"));
        assert!(body.contains("hello world"));
    }

    #[test]
    fn render_empty_content_no_author_is_blank() {
        let body = render_comment("", "   ", &[]);
        assert!(body.trim().is_empty());
    }

    #[test]
    fn truncate_appends_notice_when_oversized() {
        let long = "a".repeat(MAX_COMMENT_LEN + 100);
        let out = truncate_comment(&long);
        assert!(out.len() <= MAX_COMMENT_LEN);
        assert!(out.ends_with(TRUNCATE_NOTICE));
    }

    #[test]
    fn truncate_passthrough_when_small() {
        assert_eq!(truncate_comment("short"), "short");
    }
}
