//! Shared branding constants for Discord embeds.

/// Bot display name used in embed footers.
pub const BOT_NAME: &str = "discordsh-bot";

/// Bot version pulled from Cargo.toml at compile time.
pub const BOT_VERSION: &str = env!("CARGO_PKG_VERSION");

/// Project page URL (clickable embed author link).
pub const PROJECT_URL: &str = "https://kbve.com/project/discordsh-bot/";

/// Source repository tree URL.
pub const SOURCE_URL: &str = "https://github.com/KBVE/kbve/tree/main/apps/discordsh/discordsh-bot";

/// Build the standard footer text: `discordsh-bot v0.1.2`
pub fn footer_text() -> String {
    format!("{BOT_NAME} v{BOT_VERSION}")
}

/// Build a source-linked footer for a specific module: `discordsh-bot v0.1.2 • source`
/// The `module` is a relative path within the bot source (e.g. `src/discord/commands/health.rs`).
pub fn footer_with_source(module: &str) -> String {
    format!("{BOT_NAME} v{BOT_VERSION} • {SOURCE_URL}/{module}")
}
