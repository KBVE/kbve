//! Discord-specific permission guards for `/github` commands.
//!
//! Complements the repo-level `RepoPolicy` in the jedi crate with
//! Discord role checks and per-user command rate limiting.

use std::time::Instant;

use dashmap::DashMap;
use poise::serenity_prelude as serenity;
use tracing::info;

use crate::discord::bot::{Context, Error};

// ── Command Rate Limiter ─────────────────────────────────────────────

/// Sliding-window rate limiter keyed by Discord user ID.
pub struct CommandRateLimiter {
    buckets: DashMap<u64, (Instant, u32)>,
    max_requests: u32,
    window_secs: u64,
}

impl CommandRateLimiter {
    pub fn new(max_requests: u32, window_secs: u64) -> Self {
        Self {
            buckets: DashMap::new(),
            max_requests,
            window_secs,
        }
    }

    /// Returns `true` if the request is allowed.
    pub fn check_user(&self, user_id: u64) -> bool {
        let now = Instant::now();
        let mut entry = self.buckets.entry(user_id).or_insert((now, 0));
        let (ref mut window_start, ref mut count) = *entry;

        if now.duration_since(*window_start).as_secs() >= self.window_secs {
            *window_start = now;
            *count = 1;
            return true;
        }

        if *count >= self.max_requests {
            return false;
        }

        *count += 1;
        true
    }

    /// Prune entries older than 2x the window.
    pub fn prune(&self) {
        let now = Instant::now();
        let cutoff = self.window_secs * 2;
        self.buckets
            .retain(|_, (start, _)| now.duration_since(*start).as_secs() < cutoff);
    }
}

// ── GitHub Command Guard ─────────────────────────────────────────────

/// Bundles per-user rate limiting + optional Discord permission requirement
/// for all `/github` subcommands.
pub struct GitHubCommandGuard {
    pub rate_limiter: CommandRateLimiter,
    required_permissions: Option<serenity::Permissions>,
}

impl GitHubCommandGuard {
    /// Build from environment variables:
    ///
    /// - `GITHUB_CMD_RATE_LIMIT` — max commands per user per window (default: 5)
    /// - `GITHUB_CMD_RATE_WINDOW` — window in seconds (default: 60)
    /// - `GITHUB_REQUIRED_PERMISSIONS` — comma-separated Discord permission
    ///   flags (e.g. `MANAGE_MESSAGES,SEND_MESSAGES`). Unset = unrestricted.
    pub fn from_env() -> Self {
        let max = std::env::var("GITHUB_CMD_RATE_LIMIT")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(5);
        let window = std::env::var("GITHUB_CMD_RATE_WINDOW")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(60);

        let required_permissions = std::env::var("GITHUB_REQUIRED_PERMISSIONS")
            .ok()
            .filter(|s| !s.trim().is_empty())
            .map(|s| parse_permissions(&s));

        if let Some(perms) = &required_permissions {
            info!(permissions = ?perms, "GitHub commands require Discord permissions");
        }

        Self {
            rate_limiter: CommandRateLimiter::new(max, window),
            required_permissions,
        }
    }

    /// Check if the member has the required Discord permissions.
    pub fn has_permission(&self, member_permissions: serenity::Permissions) -> bool {
        match &self.required_permissions {
            None => true,
            Some(required) => member_permissions.contains(*required),
        }
    }
}

/// Parse comma-separated permission flag names into a `Permissions` bitfield.
fn parse_permissions(s: &str) -> serenity::Permissions {
    let mut perms = serenity::Permissions::empty();
    for flag in s.split(',').map(str::trim) {
        let p = match flag.to_uppercase().as_str() {
            "ADMINISTRATOR" => serenity::Permissions::ADMINISTRATOR,
            "MANAGE_GUILD" => serenity::Permissions::MANAGE_GUILD,
            "MANAGE_MESSAGES" => serenity::Permissions::MANAGE_MESSAGES,
            "MANAGE_CHANNELS" => serenity::Permissions::MANAGE_CHANNELS,
            "MANAGE_ROLES" => serenity::Permissions::MANAGE_ROLES,
            "SEND_MESSAGES" => serenity::Permissions::SEND_MESSAGES,
            "VIEW_CHANNEL" => serenity::Permissions::VIEW_CHANNEL,
            "MODERATE_MEMBERS" => serenity::Permissions::MODERATE_MEMBERS,
            other => {
                tracing::warn!(flag = other, "Unknown Discord permission flag, skipping");
                serenity::Permissions::empty()
            }
        };
        perms |= p;
    }
    perms
}

// ── Poise Check Function ─────────────────────────────────────────────

/// Pre-command check applied to all `/github` subcommands.
///
/// Enforces per-user rate limiting and optional Discord permissions.
pub async fn github_permission_check(ctx: Context<'_>) -> Result<bool, Error> {
    let guard = &ctx.data().app.github_guard;
    let user_id = ctx.author().id.get();

    // Rate limit
    if !guard.rate_limiter.check_user(user_id) {
        ctx.send(
            poise::CreateReply::default()
                .content("You're using GitHub commands too quickly. Please wait a moment.")
                .ephemeral(true),
        )
        .await?;
        return Ok(false);
    }

    // Discord permissions (skip in DMs — guild-only commands will catch this later)
    if let Some(member) = ctx.author_member().await {
        let member_perms = member
            .permissions
            .unwrap_or_else(serenity::Permissions::empty);
        if !guard.has_permission(member_perms) {
            ctx.send(
                poise::CreateReply::default()
                    .content("You don't have permission to use GitHub commands in this server.")
                    .ephemeral(true),
            )
            .await?;
            return Ok(false);
        }
    }

    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rate_limiter_allows_up_to_limit() {
        let limiter = CommandRateLimiter::new(3, 60);
        assert!(limiter.check_user(1));
        assert!(limiter.check_user(1));
        assert!(limiter.check_user(1));
        assert!(!limiter.check_user(1));
    }

    #[test]
    fn rate_limiter_users_independent() {
        let limiter = CommandRateLimiter::new(1, 60);
        assert!(limiter.check_user(1));
        assert!(!limiter.check_user(1));
        assert!(limiter.check_user(2));
    }

    #[test]
    fn rate_limiter_prune() {
        let limiter = CommandRateLimiter::new(10, 0);
        limiter.check_user(1);
        assert_eq!(limiter.buckets.len(), 1);
        limiter.prune();
        assert_eq!(limiter.buckets.len(), 0);
    }

    #[test]
    fn parse_permissions_valid() {
        let perms = parse_permissions("ADMINISTRATOR,MANAGE_MESSAGES");
        assert!(perms.contains(serenity::Permissions::ADMINISTRATOR));
        assert!(perms.contains(serenity::Permissions::MANAGE_MESSAGES));
    }

    #[test]
    fn parse_permissions_unknown_ignored() {
        let perms = parse_permissions("NONEXISTENT,ADMINISTRATOR");
        assert!(perms.contains(serenity::Permissions::ADMINISTRATOR));
    }

    #[test]
    fn guard_no_perms_allows_all() {
        let guard = GitHubCommandGuard {
            rate_limiter: CommandRateLimiter::new(100, 60),
            required_permissions: None,
        };
        assert!(guard.has_permission(serenity::Permissions::empty()));
    }

    #[test]
    fn guard_with_perms_blocks_missing() {
        let guard = GitHubCommandGuard {
            rate_limiter: CommandRateLimiter::new(100, 60),
            required_permissions: Some(serenity::Permissions::MANAGE_MESSAGES),
        };
        assert!(!guard.has_permission(serenity::Permissions::SEND_MESSAGES));
        assert!(guard.has_permission(serenity::Permissions::MANAGE_MESSAGES));
    }
}
