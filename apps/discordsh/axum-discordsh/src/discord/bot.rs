use anyhow::Result;
use kbve::entity::client::vault::VaultClient;
use poise::serenity_prelude as serenity;
use tracing::{info, warn};

use super::commands;

/// Vault secret UUID for the Discord bot token (shared with the Python notification-bot).
const DISCORD_TOKEN_VAULT_ID: &str = "39781c47-be8f-4a10-ae3a-714da299ca07";

// ── Poise type aliases ──────────────────────────────────────────────────

/// Shared state available to all commands via `ctx.data()`.
pub struct Data {}

/// Error type for poise commands.
pub type Error = Box<dyn std::error::Error + Send + Sync>;

/// Convenience alias used by all command functions.
pub type Context<'a> = poise::Context<'a, Data, Error>;

// ── Token resolution (unchanged) ────────────────────────────────────────

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

// ── Bot startup ─────────────────────────────────────────────────────────

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

    let intents = serenity::GatewayIntents::non_privileged();

    let framework = poise::Framework::builder()
        .options(poise::FrameworkOptions {
            commands: commands::all(),
            ..Default::default()
        })
        .setup(|ctx, ready, framework| {
            Box::pin(async move {
                info!("Discord bot connected as {}", ready.user.name);

                // Guild-scoped registration for fast dev iteration;
                // global registration for production.
                match std::env::var("GUILD_ID")
                    .ok()
                    .and_then(|id| id.parse::<u64>().ok())
                    .map(serenity::GuildId::new)
                {
                    Some(guild_id) => {
                        info!("Registering commands in guild {guild_id} (dev mode)");
                        poise::builtins::register_in_guild(
                            ctx,
                            &framework.options().commands,
                            guild_id,
                        )
                        .await?;
                    }
                    None => {
                        info!("Registering commands globally (production mode)");
                        poise::builtins::register_globally(ctx, &framework.options().commands)
                            .await?;
                    }
                }

                Ok(Data {})
            })
        })
        .build();

    let mut client = serenity::ClientBuilder::new(&token, intents)
        .framework(framework)
        .await?;

    info!("Starting Discord bot...");
    client.start().await?;

    Ok(())
}
