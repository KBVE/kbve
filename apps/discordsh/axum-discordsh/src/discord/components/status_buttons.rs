use poise::serenity_prelude as serenity;
use tracing::info;

use crate::discord::bot::{Data, Error};
use crate::discord::embeds::{StatusSnapshot, StatusState, build_status_embed};

// ── Custom ID constants ──────────────────────────────────────────────

pub const ID_STATUS_REFRESH: &str = "status_refresh";
pub const ID_STATUS_CLEANUP: &str = "status_cleanup";
pub const ID_STATUS_RESTART: &str = "status_restart";

// ── Button row builder ───────────────────────────────────────────────

/// Build the action row of buttons attached to the `/status` embed.
pub fn build_status_action_row() -> serenity::CreateActionRow {
    serenity::CreateActionRow::Buttons(vec![
        serenity::CreateButton::new(ID_STATUS_REFRESH)
            .label("Refresh")
            .style(serenity::ButtonStyle::Primary)
            .emoji(serenity::ReactionType::Unicode("\u{1F504}".to_owned())),
        serenity::CreateButton::new(ID_STATUS_CLEANUP)
            .label("Cleanup")
            .style(serenity::ButtonStyle::Secondary)
            .emoji(serenity::ReactionType::Unicode("\u{1F9F9}".to_owned())),
        serenity::CreateButton::new(ID_STATUS_RESTART)
            .label("Restart")
            .style(serenity::ButtonStyle::Danger)
            .emoji(serenity::ReactionType::Unicode("\u{26A1}".to_owned())),
    ])
}

// ── Snapshot helper ──────────────────────────────────────────────────

/// Collect a `StatusSnapshot` from the current serenity cache and bot data.
///
/// This is the single bridge between poise `Data` + serenity cache and the
/// decoupled `StatusSnapshot` the embed builder expects.
async fn collect_snapshot(data: &Data, cache: &serenity::Cache) -> StatusSnapshot {
    let health = data.app.health_monitor.snapshot().await;
    StatusSnapshot {
        state: StatusState::Online,
        version: env!("CARGO_PKG_VERSION"),
        guild_count: cache.guild_count(),
        shard_id: None,
        uptime: data.app.start_time.elapsed(),
        health,
    }
}

// ── Interaction handler ──────────────────────────────────────────────

/// Handle a component interaction whose `custom_id` starts with `"status_"`.
///
/// Returns `Ok(true)` if handled, `Ok(false)` if the custom_id didn't match.
pub async fn handle_status_component(
    interaction: &serenity::ComponentInteraction,
    ctx: &serenity::Context,
    data: &Data,
) -> Result<bool, Error> {
    let custom_id = interaction.data.custom_id.as_str();

    match custom_id {
        ID_STATUS_REFRESH => {
            info!(user = %interaction.user.name, "Status refresh button pressed");

            data.app.health_monitor.force_refresh().await;
            let snap = collect_snapshot(data, &ctx.cache).await;
            let embed = build_status_embed(&snap);
            let components = vec![build_status_action_row()];

            interaction
                .create_response(
                    &ctx.http,
                    serenity::CreateInteractionResponse::UpdateMessage(
                        serenity::CreateInteractionResponseMessage::new()
                            .embed(embed)
                            .components(components),
                    ),
                )
                .await?;

            Ok(true)
        }

        ID_STATUS_CLEANUP => {
            info!(user = %interaction.user.name, "Status cleanup button pressed");

            let thread_id = match std::env::var("DISCORD_THREAD_ID")
                .ok()
                .and_then(|s| s.parse::<u64>().ok())
            {
                Some(id) => serenity::ChannelId::new(id),
                None => {
                    interaction
                        .create_response(
                            &ctx.http,
                            serenity::CreateInteractionResponse::Message(
                                serenity::CreateInteractionResponseMessage::new()
                                    .content("DISCORD_THREAD_ID is not configured.")
                                    .ephemeral(true),
                            ),
                        )
                        .await?;
                    return Ok(true);
                }
            };

            // Acknowledge immediately then run cleanup in background
            interaction
                .create_response(
                    &ctx.http,
                    serenity::CreateInteractionResponse::Message(
                        serenity::CreateInteractionResponseMessage::new()
                            .content("Cleanup initiated...")
                            .ephemeral(true),
                    ),
                )
                .await?;

            let http = ctx.http.clone();
            tokio::spawn(async move {
                let messages = match thread_id
                    .messages(&http, serenity::GetMessages::new().limit(50))
                    .await
                {
                    Ok(msgs) => msgs,
                    Err(e) => {
                        tracing::warn!(error = %e, "Failed to fetch thread messages for cleanup");
                        return;
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
                info!(deleted = count, "Thread cleanup complete");
            });

            Ok(true)
        }

        ID_STATUS_RESTART => {
            info!(user = %interaction.user.name, "Status restart button pressed");

            let has_permission = if let Some(member) = &interaction.member {
                member.permissions.is_some_and(|p| p.administrator())
            } else {
                false
            };

            if !has_permission {
                interaction
                    .create_response(
                        &ctx.http,
                        serenity::CreateInteractionResponse::Message(
                            serenity::CreateInteractionResponseMessage::new()
                                .content("You do not have permission to restart the bot.")
                                .ephemeral(true),
                        ),
                    )
                    .await?;
                return Ok(true);
            }

            interaction
                .create_response(
                    &ctx.http,
                    serenity::CreateInteractionResponse::Message(
                        serenity::CreateInteractionResponseMessage::new()
                            .content("Restarting bot...")
                            .ephemeral(true),
                    ),
                )
                .await?;

            data.app
                .restart_flag
                .store(true, std::sync::atomic::Ordering::Relaxed);
            if let Some(sm) = data.app.shard_manager.read().await.as_ref() {
                sm.shutdown_all().await;
            }

            Ok(true)
        }

        _ => Ok(false),
    }
}
