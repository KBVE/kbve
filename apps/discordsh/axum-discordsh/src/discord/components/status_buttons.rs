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
fn collect_snapshot(data: &Data, cache: &serenity::Cache) -> StatusSnapshot {
    StatusSnapshot {
        state: StatusState::Online,
        version: env!("CARGO_PKG_VERSION"),
        guild_count: cache.guild_count(),
        shard_id: None,
        uptime: data.start_time.elapsed(),
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

            let snap = collect_snapshot(data, &ctx.cache);
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

            interaction
                .create_response(
                    &ctx.http,
                    serenity::CreateInteractionResponse::Message(
                        serenity::CreateInteractionResponseMessage::new()
                            .content("Cleanup is not yet implemented.")
                            .ephemeral(true),
                    ),
                )
                .await?;

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
                            .content("Restart is not yet implemented.")
                            .ephemeral(true),
                    ),
                )
                .await?;

            Ok(true)
        }

        _ => Ok(false),
    }
}
