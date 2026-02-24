use crate::discord::bot::{Context, Error};

/// Shows the current bot status.
#[poise::command(slash_command)]
pub async fn status(ctx: Context<'_>) -> Result<(), Error> {
    let version = env!("CARGO_PKG_VERSION");
    ctx.say(format!("Bot is online. Version: {version}"))
        .await?;
    Ok(())
}
