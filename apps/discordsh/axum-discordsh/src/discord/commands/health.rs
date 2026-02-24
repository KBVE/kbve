use crate::discord::bot::{Context, Error};

/// Reports system health information.
#[poise::command(slash_command)]
pub async fn health(ctx: Context<'_>) -> Result<(), Error> {
    ctx.say("System health: OK").await?;
    Ok(())
}
