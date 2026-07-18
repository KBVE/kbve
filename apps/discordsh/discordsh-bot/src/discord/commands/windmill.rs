use poise::CreateReply;
use tracing::{info, warn};

use crate::discord::bot::{Context, Error};
use crate::discord::windmill::{DiscordContext, RunError, split_args, suggest_command};
use crate::discord::windmill_embed;

/// Windmill script run when `/wm` is invoked with no script name — renders the
/// self-listing command menu (`f/discordsh/help`).
const WM_INDEX_PATH: &str = "help";

#[poise::command(slash_command, rename = "wm")]
pub async fn wm(
    ctx: Context<'_>,
    #[description = "Script name (e.g. poem) → f/discordsh/; blank lists every command"] wm_path: Option<String>,
    #[description = "Space-separated args"] args: Option<String>,
) -> Result<(), Error> {
    let Some(cfg) = ctx.data().app.windmill.clone() else {
        ctx.send(
            CreateReply::default()
                .content("Windmill runner is not configured on this bot.")
                .ephemeral(true),
        )
        .await?;
        return Ok(());
    };

    let wm_path = wm_path
        .map(|s| s.trim().to_owned())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| WM_INDEX_PATH.to_owned());
    let args = args.map(|s| split_args(&s)).unwrap_or_default();
    let path_for_log = wm_path.clone();
    let arg_count = args.len();

    let discord = DiscordContext {
        user_id: ctx.author().id.get().to_string(),
        username: ctx.author().name.clone(),
        guild_id: ctx.guild_id().map(|g| g.get().to_string()),
        channel_id: ctx.channel_id().get().to_string(),
    };

    ctx.defer().await?;

    match cfg.run(&wm_path, &args, &discord).await {
        Ok(value) => {
            info!(
                wm_path = %path_for_log,
                user = %discord.username,
                args = arg_count,
                "windmill run ok"
            );
            let json_reply = || {
                let body =
                    serde_json::to_string_pretty(&value).unwrap_or_else(|_| value.to_string());
                let trimmed = truncate_for_discord(&body);
                CreateReply::default()
                    .content(format!("`/wm {path_for_log}` ok:\n```json\n{trimmed}\n```"))
                    .ephemeral(true)
            };

            // Try the rich embed first; if Discord rejects it (total size, bad
            // URL, empty field), fall back to the JSON block so the job result
            // is never lost.
            match windmill_embed::embed_from_value(&value) {
                Some(embed) => {
                    if ctx
                        .send(CreateReply::default().embed(embed).ephemeral(true))
                        .await
                        .is_err()
                    {
                        warn!(
                            wm_path = %path_for_log,
                            "embed send rejected; falling back to JSON"
                        );
                        ctx.send(json_reply()).await?;
                    }
                }
                None => {
                    ctx.send(json_reply()).await?;
                }
            }
        }
        Err(e) => {
            warn!(
                wm_path = %path_for_log,
                user = %discord.username,
                error = %e,
                "windmill run failed"
            );
            let content = match e {
                // Unknown or blocked command name → guide to the menu rather
                // than leaking that an allowlist rejected it, and suggest the
                // closest real command when the miss looks like a typo.
                RunError::PathNotAllowed => {
                    let attempted = command_leaf(&path_for_log);
                    let mut msg = format!("❓ Unknown command `/wm {attempted}`.");
                    if let Some(near) = suggest_command(&attempted, &cfg.list_command_names().await) {
                        msg.push_str(&format!(" Did you mean `/wm {near}`?"));
                    }
                    msg.push_str(" Run `/wm help` for the full list.");
                    msg
                }
                other => format!("windmill error: {other}"),
            };
            ctx.send(CreateReply::default().content(content).ephemeral(true))
                .await?;
        }
    }
    Ok(())
}

/// Reduce whatever the user typed to a safe, bare command name for display in
/// the unknown-command hint: drop any folder/kind prefix (`f/discordsh/`,
/// `p/…`) and remove every backtick so it can't break out of the code span.
fn command_leaf(raw: &str) -> String {
    raw.trim_matches('/')
        .rsplit('/')
        .next()
        .unwrap_or(raw)
        .replace('`', "")
}

fn truncate_for_discord(s: &str) -> String {
    const MAX: usize = 1800;
    if s.len() <= MAX {
        return s.to_owned();
    }
    let mut cut = MAX;
    while !s.is_char_boundary(cut) {
        cut -= 1;
    }
    format!("{}…(truncated)", &s[..cut])
}

#[cfg(test)]
mod tests {
    use super::{command_leaf, truncate_for_discord};

    #[test]
    fn command_leaf_strips_prefix() {
        assert_eq!(command_leaf("poem"), "poem");
        assert_eq!(command_leaf("f/discordsh/poem"), "poem");
        assert_eq!(command_leaf("/f/discordsh/poem/"), "poem");
    }

    #[test]
    fn command_leaf_removes_backticks() {
        // A code-span breakout attempt collapses to a bare token.
        assert_eq!(command_leaf("po`em"), "poem");
        assert_eq!(command_leaf("`inject`"), "inject");
    }

    #[test]
    fn truncate_passthrough() {
        assert_eq!(truncate_for_discord("short"), "short");
    }

    #[test]
    fn truncate_long() {
        let s = "a".repeat(3000);
        let out = truncate_for_discord(&s);
        assert!(out.ends_with("…(truncated)"));
        assert!(out.len() < 3000);
    }

    #[test]
    fn truncate_respects_char_boundary() {
        let mut s = "é".repeat(1000);
        s.push('é');
        let out = truncate_for_discord(&s);
        assert!(out.ends_with("…(truncated)"));
    }
}
