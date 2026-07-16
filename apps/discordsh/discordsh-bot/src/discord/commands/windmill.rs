use poise::CreateReply;
use tracing::{info, warn};

use crate::discord::bot::{Context, Error};
use crate::discord::windmill::{DiscordContext, split_args};
use crate::discord::windmill_embed;

#[poise::command(slash_command, rename = "wm")]
pub async fn wm(
    ctx: Context<'_>,
    #[description = "Script name (e.g. poem) → f/discordsh/; only the f/discordsh/ folder is reachable"] wm_path: String,
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
            ctx.send(
                CreateReply::default()
                    .content(format!("windmill error: {e}"))
                    .ephemeral(true),
            )
            .await?;
        }
    }
    Ok(())
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
    use super::truncate_for_discord;

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
