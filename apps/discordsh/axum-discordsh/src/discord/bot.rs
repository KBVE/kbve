use anyhow::Result;
use serenity::async_trait;
use serenity::model::channel::Message;
use serenity::model::gateway::Ready;
use serenity::prelude::*;
use tracing::info;

struct Handler;

#[async_trait]
impl EventHandler for Handler {
    async fn message(&self, ctx: Context, msg: Message) {
        if msg.author.bot {
            return;
        }

        if msg.content == "!ping" {
            if let Err(e) = msg.channel_id.say(&ctx.http, "Pong!").await {
                tracing::error!(error = %e, "failed to send message");
            }
        }
    }

    async fn ready(&self, _ctx: Context, ready: Ready) {
        info!("Discord bot connected as {}", ready.user.name);
    }
}

pub async fn start() -> Result<()> {
    let token = match std::env::var("DISCORD_TOKEN") {
        Ok(t) if !t.is_empty() => t,
        _ => {
            info!("DISCORD_TOKEN not set, skipping Discord bot");
            // Park this task so tokio::select! doesn't immediately resolve
            std::future::pending::<()>().await;
            return Ok(());
        }
    };

    let intents = GatewayIntents::GUILD_MESSAGES | GatewayIntents::MESSAGE_CONTENT;

    let mut client = Client::builder(&token, intents)
        .event_handler(Handler)
        .await?;

    info!("Starting Discord bot...");
    client.start().await?;

    Ok(())
}
