use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use kbve::entity::client::vault::VaultClient;
use poise::serenity_prelude as serenity;
use tracing::{error, info, warn};

use super::commands;
use super::components;
use crate::state::AppState;

/// Vault secret UUID for the Discord bot token (shared with the Python notification-bot).
const DISCORD_TOKEN_VAULT_ID: &str = "39781c47-be8f-4a10-ae3a-714da299ca07";

// ── Poise type aliases ──────────────────────────────────────────────────

/// Shared state available to all commands via `ctx.data()`.
pub struct Data {
    /// Central application state shared with the HTTP server.
    pub app: Arc<AppState>,
}

/// Error type for poise commands.
pub type Error = Box<dyn std::error::Error + Send + Sync>;

/// Convenience alias used by all command functions.
pub type Context<'a> = poise::Context<'a, Data, Error>;

// ── Token resolution ────────────────────────────────────────────────────

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

// ── Event handler ───────────────────────────────────────────────────────

/// Global event handler for poise. Routes component interactions and
/// handles lifecycle events (ready, guild join/leave).
async fn event_handler(
    ctx: &serenity::Context,
    event: &serenity::FullEvent,
    _framework: poise::FrameworkContext<'_, Data, Error>,
    data: &Data,
) -> Result<(), Error> {
    match event {
        // ── Component interactions ──────────────────────────────────
        serenity::FullEvent::InteractionCreate {
            interaction: serenity::Interaction::Component(component),
        } => {
            let custom_id = component.data.custom_id.clone();
            let result = if custom_id.starts_with("status_") {
                components::handle_status_component(component, ctx, data)
                    .await
                    .map(|_| ())
            } else if custom_id.starts_with("dng|") {
                super::game::router::handle_game_component(component, ctx, data).await
            } else {
                Ok(())
            };
            if let Err(e) = result {
                error!(
                    error = %e,
                    error_debug = ?e,
                    custom_id,
                    user = %component.user.name,
                    "Component interaction failed"
                );
            }
        }

        // ── Bot ready ──────────────────────────────────────────────
        serenity::FullEvent::Ready { data_about_bot } => {
            let guild_count = ctx.cache.guild_count();
            let shard_id = ctx.shard_id.0;
            info!(
                user = %data_about_bot.user.name,
                guilds = guild_count,
                shard_id,
                "Bot ready"
            );

            // Spawn session cleanup task for Embed Dungeon
            {
                let sessions = data.app.sessions.clone();
                tokio::spawn(async move {
                    let mut interval = tokio::time::interval(Duration::from_secs(60));
                    loop {
                        interval.tick().await;
                        sessions.cleanup_expired(Duration::from_secs(600));
                    }
                });
            }

            // Record shard in tracker (best-effort)
            if let Some(ref tracker) = data.app.tracker {
                let instance_id = std::env::var("HOSTNAME")
                    .unwrap_or_else(|_| format!("local-{}", std::process::id()));
                let cluster_name =
                    std::env::var("CLUSTER_NAME").unwrap_or_else(|_| "default".into());
                let total_shards = std::env::var("SHARD_COUNT")
                    .ok()
                    .and_then(|s| s.parse::<u32>().ok())
                    .unwrap_or(1);

                tracker
                    .record_shard(
                        &instance_id,
                        &cluster_name,
                        shard_id,
                        total_shards,
                        guild_count,
                        0.0,
                    )
                    .await;

                // Spawn periodic heartbeat
                let tracker_clone = data.app.clone();
                let cache = ctx.cache.clone();
                tokio::spawn(async move {
                    let mut interval = tokio::time::interval(Duration::from_secs(30));
                    loop {
                        interval.tick().await;
                        if let Some(ref t) = tracker_clone.tracker {
                            let gc = cache.guild_count();
                            t.update_heartbeat(&instance_id, &cluster_name, gc, 0.0)
                                .await;
                        }
                    }
                });
            }
        }

        // ── Guild events ───────────────────────────────────────────
        serenity::FullEvent::GuildCreate { guild, is_new } => {
            if is_new.unwrap_or(false) {
                info!(guild = %guild.name, id = %guild.id, "Joined new guild");
            }
        }

        serenity::FullEvent::GuildDelete { incomplete, .. } => {
            info!(id = %incomplete.id, "Left guild");
        }

        _ => {}
    }

    Ok(())
}

// ── Bot startup ─────────────────────────────────────────────────────────

pub async fn start(app_state: Arc<AppState>) -> Result<()> {
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

    let app_for_setup = Arc::clone(&app_state);
    let framework = poise::Framework::builder()
        .options(poise::FrameworkOptions {
            commands: commands::all(),
            event_handler: |ctx, event, framework, data| {
                Box::pin(event_handler(ctx, event, framework, data))
            },
            on_error: |framework_error| {
                Box::pin(async move {
                    error!(
                        error = %framework_error,
                        "Poise framework error"
                    );
                    if let Err(e) = poise::builtins::on_error(framework_error).await {
                        error!(error = %e, "Failed to handle poise error");
                    }
                })
            },
            ..Default::default()
        })
        .setup(move |ctx, ready, framework| {
            let app = app_for_setup;
            Box::pin(async move {
                info!("Discord bot connected as {}", ready.user.name);

                // Store serenity HTTP client for HTTP-side API calls
                *app.bot_http.write().await = Some(ctx.http.clone());

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

                Ok(Data { app })
            })
        })
        .build();

    let mut client = serenity::ClientBuilder::new(&token, intents)
        .framework(framework)
        .await?;

    // Store shard manager so HTTP endpoints can trigger shutdown/restart
    *app_state.shard_manager.write().await = Some(client.shard_manager.clone());

    // Start with the appropriate sharding mode.
    //
    // Shard ID resolution priority:
    // 1. Explicit SHARD_ID env var
    // 2. StatefulSet pod ordinal parsed from HOSTNAME (e.g. "discordsh-2" → 2)
    // 3. Fall back to single-shard mode
    let shard_id = std::env::var("SHARD_ID")
        .ok()
        .and_then(|s| s.parse::<u32>().ok())
        .or_else(|| {
            // StatefulSet pods have HOSTNAME like "<name>-<ordinal>"
            std::env::var("HOSTNAME")
                .ok()
                .and_then(|h| h.rsplit('-').next().and_then(|s| s.parse::<u32>().ok()))
        });
    let shard_count = std::env::var("SHARD_COUNT")
        .ok()
        .and_then(|s| s.parse::<u32>().ok());

    match (shard_id, shard_count) {
        (Some(id), Some(count)) => {
            info!(
                shard_id = id,
                shard_count = count,
                "Starting shard (distributed mode)"
            );
            client.start_shard(id, count).await?;
        }
        _ => {
            info!("Starting Discord bot (single shard)...");
            client.start().await?;
        }
    }

    // Clear shared state on exit
    *app_state.shard_manager.write().await = None;
    *app_state.bot_http.write().await = None;

    Ok(())
}
