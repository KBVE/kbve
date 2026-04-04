//! Shared branding constants for Discord embeds.

use poise::serenity_prelude as serenity;

/// Bot display name used in embed footers.
pub const BOT_NAME: &str = "discordsh-bot";

/// Bot version pulled from Cargo.toml at compile time.
pub const BOT_VERSION: &str = env!("CARGO_PKG_VERSION");

/// Project page URL (clickable embed author link).
pub const PROJECT_URL: &str = "https://kbve.com/project/discordsh-bot/";

/// Source repository tree URL.
pub const SOURCE_URL: &str = "https://github.com/KBVE/kbve/tree/main/apps/discordsh/discordsh-bot";

// ── GitHub embed colors (matching GitHub's UI palette) ──────────────

/// Green — open issues, created, reopened
pub const GH_GREEN: u32 = 0x238636;
/// Gray — closed issues, unassigned
pub const GH_GRAY: u32 = 0x8b949e;
/// Purple — pull requests, merged
pub const GH_PURPLE: u32 = 0x8957E5;
/// Blue — comments, search, labels, assign
pub const GH_BLUE: u32 = 0x58a6ff;
/// Dark — repository info (GitHub dark theme)
pub const GH_DARK: u32 = 0x0d1117;
/// Commit green — slightly brighter for commits/workflows/dispatch
pub const GH_COMMIT: u32 = 0x2EA043;
/// Orange — notice board (warnings, blockers)
pub const GH_NOTICE: u32 = 0xE67E22;
/// Task board blue
pub const GH_TASK: u32 = 0x3498DB;
/// Light gray — labels listing
pub const GH_LABELS: u32 = 0xE8EAED;

// ── Footer helpers ──────────────────────────────────────────────────

/// Build the standard footer text: `discordsh-bot v0.1.3`
pub fn footer_text() -> String {
    format!("{BOT_NAME} v{BOT_VERSION}")
}

/// Build a Discord markdown link to the source file for a specific module.
/// Returns `[source](https://github.com/...)` — usable in embed descriptions/fields.
pub fn source_link(module: &str) -> String {
    format!("[source]({SOURCE_URL}/{module})")
}

/// Create a standard branded footer for embeds.
/// Includes version and optional extra context (e.g. pagination info).
pub fn embed_footer(extra: Option<&str>) -> serenity::CreateEmbedFooter {
    match extra {
        Some(info) => {
            serenity::CreateEmbedFooter::new(format!("{} | {BOT_NAME} v{BOT_VERSION}", info))
        }
        None => serenity::CreateEmbedFooter::new(footer_text()),
    }
}

/// Create a branded author block that links to the project page.
pub fn embed_author() -> serenity::CreateEmbedAuthor {
    serenity::CreateEmbedAuthor::new(BOT_NAME).url(PROJECT_URL)
}
