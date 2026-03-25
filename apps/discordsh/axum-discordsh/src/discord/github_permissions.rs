//! Discord-specific permission guards for `/github` commands.
//!
//! Three permission tiers with sensible defaults:
//!
//! - **Read** (`issues`, `pulls`, `repo`, `commits`) — no permission required
//! - **Board** (`noticeboard`, `taskboard`) — `MANAGE_MESSAGES` required
//! - **Admin** (future write commands) — `ADMINISTRATOR` required
//!
//! Each tier's default can be overridden via env vars, or set to `NONE` to
//! make it unrestricted. Per-user rate limiting applies to all tiers.

use std::time::Instant;

use dashmap::DashMap;
use poise::serenity_prelude as serenity;
use tracing::info;

use crate::discord::bot::{Context, Error};

// ── Command Tiers ───────────────────────────────────────────────────

/// Permission tiers for `/github` subcommands.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CommandTier {
    /// Read-only queries: issues, pulls, repo, commits.
    Read,
    /// Board embeds that post persistent content: noticeboard, taskboard.
    Board,
    /// Destructive or write operations (future: create issue, close PR).
    Admin,
}

impl CommandTier {
    /// The default Discord permission for this tier (before env override).
    fn default_permission(self) -> Option<serenity::Permissions> {
        match self {
            CommandTier::Read => None,
            CommandTier::Board => Some(serenity::Permissions::MANAGE_MESSAGES),
            CommandTier::Admin => Some(serenity::Permissions::ADMINISTRATOR),
        }
    }

    /// The env var name that overrides this tier's permission.
    fn env_key(self) -> &'static str {
        match self {
            CommandTier::Read => "GITHUB_PERM_READ",
            CommandTier::Board => "GITHUB_PERM_BOARD",
            CommandTier::Admin => "GITHUB_PERM_ADMIN",
        }
    }

    fn label(self) -> &'static str {
        match self {
            CommandTier::Read => "read",
            CommandTier::Board => "board",
            CommandTier::Admin => "admin",
        }
    }
}

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

/// Bundles per-user rate limiting + tiered Discord permission requirements
/// for `/github` subcommands.
pub struct GitHubCommandGuard {
    pub rate_limiter: CommandRateLimiter,
    /// Resolved permission for each tier: `[Read, Board, Admin]`.
    tier_permissions: [Option<serenity::Permissions>; 3],
}

impl GitHubCommandGuard {
    /// Build from environment variables:
    ///
    /// - `GITHUB_CMD_RATE_LIMIT` — max commands per user per window (default: 5)
    /// - `GITHUB_CMD_RATE_WINDOW` — window in seconds (default: 60)
    /// - `GITHUB_PERM_READ` — permission for read commands (default: NONE)
    /// - `GITHUB_PERM_BOARD` — permission for board commands (default: MANAGE_MESSAGES)
    /// - `GITHUB_PERM_ADMIN` — permission for admin commands (default: ADMINISTRATOR)
    ///
    /// Set any tier to `NONE` to make it unrestricted.
    pub fn from_env() -> Self {
        let max = std::env::var("GITHUB_CMD_RATE_LIMIT")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(5);
        let window = std::env::var("GITHUB_CMD_RATE_WINDOW")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(60);

        let tiers = [CommandTier::Read, CommandTier::Board, CommandTier::Admin];
        let tier_permissions = tiers.map(|tier| resolve_tier_permission(tier));

        for (tier, perm) in tiers.iter().zip(tier_permissions.iter()) {
            match perm {
                Some(p) => info!(tier = tier.label(), permissions = ?p, "GitHub tier permission"),
                None => info!(tier = tier.label(), "GitHub tier: unrestricted"),
            }
        }

        Self {
            rate_limiter: CommandRateLimiter::new(max, window),
            tier_permissions,
        }
    }

    /// Check if the member has permission for a specific tier.
    /// Administrators bypass all tier checks (matching Discord's behavior).
    pub fn has_tier_permission(
        &self,
        tier: CommandTier,
        member_permissions: serenity::Permissions,
    ) -> bool {
        if member_permissions.administrator() {
            return true;
        }
        match self.tier_permissions[tier as usize] {
            None => true,
            Some(required) => member_permissions.contains(required),
        }
    }
}

/// Resolve a tier's permission: env override → default.
fn resolve_tier_permission(tier: CommandTier) -> Option<serenity::Permissions> {
    match std::env::var(tier.env_key())
        .ok()
        .map(|s| s.trim().to_uppercase())
    {
        Some(ref val) if val == "NONE" || val.is_empty() => None,
        Some(ref val) => Some(parse_permissions(val)),
        None => tier.default_permission(),
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
            "NONE" => serenity::Permissions::empty(),
            other => {
                tracing::warn!(flag = other, "Unknown Discord permission flag, skipping");
                serenity::Permissions::empty()
            }
        };
        perms |= p;
    }
    perms
}

// ── Poise Check Functions ────────────────────────────────────────────

/// Rate-limit check applied to all `/github` subcommands via the parent command.
pub async fn github_permission_check(ctx: Context<'_>) -> Result<bool, Error> {
    let guard = &ctx.data().app.github_guard;
    let user_id = ctx.author().id.get();

    if !guard.rate_limiter.check_user(user_id) {
        ctx.send(
            poise::CreateReply::default()
                .content("You're using GitHub commands too quickly. Please wait a moment.")
                .ephemeral(true),
        )
        .await?;
        return Ok(false);
    }

    Ok(true)
}

/// Tier-specific permission check. Call from within each subcommand body.
pub async fn check_tier(ctx: Context<'_>, tier: CommandTier) -> Result<bool, Error> {
    let guard = &ctx.data().app.github_guard;

    if let Some(member) = ctx.author_member().await {
        let member_perms = member
            .permissions
            .unwrap_or_else(serenity::Permissions::empty);
        if !guard.has_tier_permission(tier, member_perms) {
            ctx.send(
                poise::CreateReply::default()
                    .content(format!(
                        "You need additional permissions to use this command ({} tier).",
                        tier.label()
                    ))
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
    fn tier_defaults() {
        assert_eq!(CommandTier::Read.default_permission(), None);
        assert_eq!(
            CommandTier::Board.default_permission(),
            Some(serenity::Permissions::MANAGE_MESSAGES)
        );
        assert_eq!(
            CommandTier::Admin.default_permission(),
            Some(serenity::Permissions::ADMINISTRATOR)
        );
    }

    #[test]
    fn guard_read_tier_unrestricted_by_default() {
        let guard = GitHubCommandGuard {
            rate_limiter: CommandRateLimiter::new(100, 60),
            tier_permissions: [
                None,
                Some(serenity::Permissions::MANAGE_MESSAGES),
                Some(serenity::Permissions::ADMINISTRATOR),
            ],
        };
        assert!(guard.has_tier_permission(CommandTier::Read, serenity::Permissions::empty()));
    }

    #[test]
    fn guard_board_tier_requires_manage_messages() {
        let guard = GitHubCommandGuard {
            rate_limiter: CommandRateLimiter::new(100, 60),
            tier_permissions: [
                None,
                Some(serenity::Permissions::MANAGE_MESSAGES),
                Some(serenity::Permissions::ADMINISTRATOR),
            ],
        };
        assert!(
            !guard.has_tier_permission(CommandTier::Board, serenity::Permissions::SEND_MESSAGES)
        );
        assert!(
            guard.has_tier_permission(CommandTier::Board, serenity::Permissions::MANAGE_MESSAGES)
        );
    }

    #[test]
    fn guard_admin_tier_requires_administrator() {
        let guard = GitHubCommandGuard {
            rate_limiter: CommandRateLimiter::new(100, 60),
            tier_permissions: [
                None,
                Some(serenity::Permissions::MANAGE_MESSAGES),
                Some(serenity::Permissions::ADMINISTRATOR),
            ],
        };
        assert!(
            !guard.has_tier_permission(CommandTier::Admin, serenity::Permissions::MANAGE_MESSAGES)
        );
        assert!(
            guard.has_tier_permission(CommandTier::Admin, serenity::Permissions::ADMINISTRATOR)
        );
    }

    #[test]
    fn guard_admin_passes_for_administrator() {
        let guard = GitHubCommandGuard {
            rate_limiter: CommandRateLimiter::new(100, 60),
            tier_permissions: [
                None,
                Some(serenity::Permissions::MANAGE_MESSAGES),
                Some(serenity::Permissions::ADMINISTRATOR),
            ],
        };
        // Administrators should pass all tiers
        let admin = serenity::Permissions::ADMINISTRATOR;
        assert!(guard.has_tier_permission(CommandTier::Read, admin));
        assert!(guard.has_tier_permission(CommandTier::Board, admin));
        assert!(guard.has_tier_permission(CommandTier::Admin, admin));
    }
}
