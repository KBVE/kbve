//! Shared branding constants for Discord embeds.

/// Bot display name used in embed footers.
pub const BOT_NAME: &str = "discordsh-bot";

/// Bot version pulled from Cargo.toml at compile time.
pub const BOT_VERSION: &str = env!("CARGO_PKG_VERSION");

/// Project page URL (clickable embed author link).
pub const PROJECT_URL: &str = "https://kbve.com/project/discordsh-bot/";

/// Source repository tree URL.
pub const SOURCE_URL: &str = "https://github.com/KBVE/kbve/tree/main/apps/discordsh/discordsh-bot";

/// Build the standard footer text: `discordsh-bot v0.1.3`
pub fn footer_text() -> String {
    format!("{BOT_NAME} v{BOT_VERSION}")
}

/// Build a Discord markdown link to the source file for a specific module.
/// Returns `[source](https://github.com/...)` — usable in embed descriptions/fields.
pub fn source_link(module: &str) -> String {
    format!("[source]({SOURCE_URL}/{module})")
}
