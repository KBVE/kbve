use crate::discord::bot::{Context, Error};

/// Responds with Pong! to verify the bot is responsive.
#[poise::command(slash_command)]
pub async fn ping(ctx: Context<'_>) -> Result<(), Error> {
    ctx.say("Pong!").await?;
    Ok(())
}
