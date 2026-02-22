use anyhow::Result;
use kbve::entity::client::vault::VaultClient;
use serenity::async_trait;
use serenity::model::channel::Message;
use serenity::model::gateway::Ready;
use serenity::prelude::*;
use tracing::{info, warn};

/// Vault secret UUID for the Discord bot token (shared with the Python notification-bot).
const DISCORD_TOKEN_VAULT_ID: &str = "39781c47-be8f-4a10-ae3a-714da299ca07";

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

/// Resolve the Discord bot token from environment or Supabase Vault.
///
/// Priority:
/// 1. `DISCORD_TOKEN` env var (fast, for local dev)
/// 2. Supabase Vault via `vault-reader` Edge Function (production)
async fn resolve_token() -> Option<String> {
    // 1. Try direct env var (dev mode / backward compatible)
    if let Ok(t) = std::env::var("DISCORD_TOKEN") {
        if !t.is_empty() {
            info!("Using Discord token from DISCORD_TOKEN env var");
            return Some(t);
        }
    }

    // 2. Try Supabase Vault
    if let Some(vault) = VaultClient::from_env() {
        info!("DISCORD_TOKEN not set, fetching from Supabase Vault");
        match vault.get_secret(DISCORD_TOKEN_VAULT_ID).await {
            Ok(token) => {
                info!("Discord token retrieved from Supabase Vault");
                return Some(token);
            }
            Err(e) => {
                warn!(error = %e, "Failed to fetch Discord token from vault");
            }
        }
    }

    None
}

pub async fn start() -> Result<()> {
    let token = match resolve_token().await {
        Some(t) => t,
        None => {
            info!("No Discord token available (env or vault), skipping Discord bot");
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
