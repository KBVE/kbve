use poise::CreateReply;
use tracing::{info, warn};

use crate::discord::bot::{Context, Error};
use crate::discord::n8n::{DiscordContext, split_args};

#[poise::command(slash_command, rename = "n8n")]
pub async fn n8n(
    ctx: Context<'_>,
    #[description = "Webhook path (must match N8N_ALLOWED_PATHS)"] webhook_path: String,
    #[description = "Space-separated args forwarded to n8n"] args: Option<String>,
) -> Result<(), Error> {
    let Some(cfg) = ctx.data().app.n8n.clone() else {
        ctx.send(
            CreateReply::default()
                .content("n8n forwarder is not configured on this bot.")
                .ephemeral(true),
        )
        .await?;
        return Ok(());
    };

    let args = args.map(|s| split_args(&s)).unwrap_or_default();
    let path_for_log = webhook_path.clone();
    let arg_count = args.len();

    let discord = DiscordContext {
        user_id: ctx.author().id.get().to_string(),
        username: ctx.author().name.clone(),
        guild_id: ctx.guild_id().map(|g| g.get().to_string()),
        channel_id: ctx.channel_id().get().to_string(),
    };

    ctx.defer().await?;

    match cfg.forward(&webhook_path, &args, &discord).await {
        Ok(value) => {
            info!(
                webhook_path = %path_for_log,
                user = %discord.username,
                args = arg_count,
                "n8n forward ok"
            );
            let body = serde_json::to_string_pretty(&value).unwrap_or_else(|_| value.to_string());
            let trimmed = truncate_for_discord(&body);
            ctx.send(
                CreateReply::default()
                    .content(format!(
                        "`/n8n {path_for_log}` ok:\n```json\n{trimmed}\n```"
                    ))
                    .ephemeral(true),
            )
            .await?;
        }
        Err(e) => {
            warn!(
                webhook_path = %path_for_log,
                user = %discord.username,
                error = %e,
                "n8n forward failed"
            );
            ctx.send(
                CreateReply::default()
                    .content(format!("n8n error: {e}"))
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
