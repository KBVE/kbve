use std::sync::atomic::Ordering;

use poise::serenity_prelude as serenity;
use tracing::info;

use crate::discord::bot::{Context, Error};

/// Restart the Discord bot. Requires Administrator permission.
#[poise::command(slash_command, required_permissions = "ADMINISTRATOR")]
pub async fn restart(ctx: Context<'_>) -> Result<(), Error> {
    let data = ctx.data();

    ctx.send(
        poise::CreateReply::default()
            .content("Restarting bot...")
            .ephemeral(true),
    )
    .await?;

    info!(user = %ctx.author().name, "Bot restart triggered via /restart command");

    data.app.restart_flag.store(true, Ordering::Relaxed);
    if let Some(sm) = data.app.shard_manager.read().await.as_ref() {
        sm.shutdown_all().await;
    }

    Ok(())
}

/// Delete old bot messages from the configured status thread. Requires Administrator permission.
#[poise::command(slash_command, required_permissions = "ADMINISTRATOR")]
pub async fn cleanup(
    ctx: Context<'_>,
    #[description = "Maximum number of messages to scan (default 50, max 100)"] limit: Option<u8>,
) -> Result<(), Error> {
    let limit = limit.unwrap_or(50).min(100);

    let thread_id = match std::env::var("DISCORD_THREAD_ID")
        .ok()
        .and_then(|s| s.parse::<u64>().ok())
    {
        Some(id) => serenity::ChannelId::new(id),
        None => {
            ctx.send(
                poise::CreateReply::default()
                    .content("DISCORD_THREAD_ID is not configured.")
                    .ephemeral(true),
            )
            .await?;
            return Ok(());
        }
    };

    ctx.defer_ephemeral().await?;

    let http = ctx.serenity_context().http.clone();

    let messages = match thread_id
        .messages(&http, serenity::GetMessages::new().limit(limit))
        .await
    {
        Ok(msgs) => msgs,
        Err(e) => {
            ctx.send(
                poise::CreateReply::default()
                    .content(format!("Failed to fetch messages: {e}"))
                    .ephemeral(true),
            )
            .await?;
            return Ok(());
        }
    };

    let bot_user_id = http.get_current_user().await.map(|u| u.id).ok();
    let to_delete: Vec<serenity::MessageId> = messages
        .iter()
        .filter(|m| bot_user_id.is_some_and(|id| m.author.id == id))
        .map(|m| m.id)
        .collect();

    let count = to_delete.len();
    if count > 1 {
        let _ = thread_id.delete_messages(&http, &to_delete).await;
    } else if count == 1 {
        let _ = thread_id.delete_message(&http, to_delete[0]).await;
    }

    info!(user = %ctx.author().name, deleted = count, "Thread cleanup via /cleanup command");

    ctx.send(
        poise::CreateReply::default()
            .content(format!("Cleaned up {count} bot message(s)."))
            .ephemeral(true),
    )
    .await?;

    Ok(())
}
