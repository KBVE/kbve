use crate::discord::bot::{Context, Error};
use crate::discord::components::build_status_action_row;
use crate::discord::embeds::{StatusSnapshot, StatusState, build_status_embed};

/// Shows the current bot status as a rich embed with interactive buttons.
#[poise::command(slash_command)]
pub async fn status(ctx: Context<'_>) -> Result<(), Error> {
    let data = ctx.data();
    let health = data.health_monitor.snapshot().await;

    let snap = StatusSnapshot {
        state: StatusState::Online,
        version: env!("CARGO_PKG_VERSION"),
        guild_count: ctx.cache().guild_count(),
        shard_id: Some(ctx.serenity_context().shard_id.0),
        uptime: data.start_time.elapsed(),
        health,
    };

    let embed = build_status_embed(&snap);
    let components = vec![build_status_action_row()];

    let reply = poise::CreateReply::default()
        .embed(embed)
        .components(components);

    ctx.send(reply).await?;
    Ok(())
}
