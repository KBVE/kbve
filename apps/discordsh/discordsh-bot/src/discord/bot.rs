use std::sync::Arc;
use std::time::Duration;

use anyhow::{Result, anyhow};
use kbve::entity::client::vault::VaultClient;
use poise::serenity_prelude as serenity;
use tracing::{error, info, warn};

use super::commands;
use super::components;
use crate::state::AppState;

/// Vault secret UUID for the Discord bot token (shared with the Python notification-bot).
const DISCORD_TOKEN_VAULT_ID: &str = "39781c47-be8f-4a10-ae3a-714da299ca07";

/// Bounded retry budget for vault token fetch on startup. After exhaustion the
/// bot returns an error and lets K8s apply CrashLoopBackOff (caps at 5 min)
/// rather than spinning a hot in-process retry loop.
const VAULT_TOKEN_MAX_ATTEMPTS: u32 = 5;
const VAULT_TOKEN_BACKOFF_BASE: Duration = Duration::from_secs(1);
const VAULT_TOKEN_BACKOFF_CAP: Duration = Duration::from_secs(8);

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
/// 2. Supabase Vault via `vault-reader` Edge Function (production), with
///    bounded exponential backoff to ride out brief edge-function cold starts
///
/// Returns `Ok(Some(_))` on success, `Ok(None)` when neither source is
/// configured (dev mode), and `Err(_)` when vault was configured but every
/// attempt failed — the caller propagates the error so K8s restarts the pod.
async fn resolve_token() -> Result<Option<String>> {
    if let Ok(t) = std::env::var("DISCORD_TOKEN")
        && !t.is_empty()
    {
        info!("Using Discord token from DISCORD_TOKEN env var");
        return Ok(Some(t));
    }

    let Some(vault) = VaultClient::from_env() else {
        return Ok(None);
    };

    info!(
        max_attempts = VAULT_TOKEN_MAX_ATTEMPTS,
        "DISCORD_TOKEN not set, fetching from Supabase Vault"
    );

    let mut last_err: Option<String> = None;
    for attempt in 1..=VAULT_TOKEN_MAX_ATTEMPTS {
        match vault.get_secret(DISCORD_TOKEN_VAULT_ID).await {
            Ok(token) => {
                info!(attempt, "Discord token retrieved from Supabase Vault");
                return Ok(Some(token));
            }
            Err(e) => {
                let msg = e.to_string();
                if attempt < VAULT_TOKEN_MAX_ATTEMPTS {
                    let delay = backoff_delay(attempt);
                    warn!(
                        attempt,
                        max_attempts = VAULT_TOKEN_MAX_ATTEMPTS,
                        retry_in_ms = delay.as_millis() as u64,
                        error = %msg,
                        "Vault fetch failed, retrying"
                    );
                    tokio::time::sleep(delay).await;
                } else {
                    error!(
                        attempt,
                        max_attempts = VAULT_TOKEN_MAX_ATTEMPTS,
                        error = %msg,
                        "Vault fetch failed, retries exhausted"
                    );
                }
                last_err = Some(msg);
            }
        }
    }

    Err(anyhow!(
        "Discord token unavailable after {} vault attempts: {}",
        VAULT_TOKEN_MAX_ATTEMPTS,
        last_err.unwrap_or_else(|| "unknown".to_string())
    ))
}

/// Exponential backoff: 2^(attempt-1) * base, capped at `VAULT_TOKEN_BACKOFF_CAP`.
fn backoff_delay(attempt: u32) -> Duration {
    let multiplier = 1u64 << attempt.saturating_sub(1).min(16);
    VAULT_TOKEN_BACKOFF_BASE
        .saturating_mul(multiplier as u32)
        .min(VAULT_TOKEN_BACKOFF_CAP)
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
            } else if custom_id.starts_with("dngclass|") {
                components::class_picker::handle_class_pick(component, ctx, data).await
            } else if custom_id.starts_with("dng|") {
                super::game::router::handle_game_component(component, ctx, data).await
            } else if custom_id.starts_with("gh|") {
                components::github_components::handle_github_component(ctx, component, &data.app)
                    .await;
                Ok(())
            } else if custom_id.starts_with("chart|") {
                components::chart_buttons::handle_chart_component(ctx, component, &data.app).await;
                Ok(())
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
                let profiles = data.app.profiles.clone();
                tokio::spawn(async move {
                    let mut interval = tokio::time::interval(Duration::from_secs(60));
                    loop {
                        interval.tick().await;
                        sessions.cleanup_expired(Duration::from_secs(7200), Some(&profiles));
                    }
                });
            }

            // Spawn GitHub board scheduler (posts notice/task boards on interval)
            super::scheduler::spawn_github_board_scheduler(data.app.clone());

            super::relay::spawn_irc_forwarder(data.app.clone(), ctx.http.clone());

            super::gh_sync::spawn_gh_sync_worker(
                data.app.clone(),
                ctx.http.clone(),
                ctx.cache.clone(),
            );

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
            // Park the bot in its voice channel. GuildCreate re-fires on every
            // (re)connect for the shard that owns this guild, so this keeps the
            // voice presence alive across reconnects.
            if super::voice::target().is_some_and(|(g, _)| g == guild.id) {
                super::voice::park(ctx);
            }
        }

        // Rejoin the parked voice channel if the bot is moved or disconnected.
        serenity::FullEvent::VoiceStateUpdate { new, .. } => {
            super::voice::handle_voice_state_update(ctx, new);
        }

        serenity::FullEvent::GuildDelete { incomplete, .. } => {
            info!(id = %incomplete.id, "Left guild");
        }

        serenity::FullEvent::Message { new_message } => {
            super::relay::handle_discord_message(new_message, &data.app).await;
            super::gh_reverse::handle_reverse_message(new_message, &data.app).await;
        }

        serenity::FullEvent::MessageUpdate { new, event, .. } => {
            let (author, content) = match new {
                Some(msg) => (
                    Some(
                        msg.author
                            .global_name
                            .clone()
                            .unwrap_or_else(|| msg.author.name.clone()),
                    ),
                    Some(msg.content.clone()),
                ),
                None => (
                    event
                        .author
                        .as_ref()
                        .map(|a| a.global_name.clone().unwrap_or_else(|| a.name.clone())),
                    event.content.clone(),
                ),
            };
            super::gh_reverse::handle_reverse_edit(
                event.channel_id,
                event.id,
                author,
                content,
                &data.app,
            )
            .await;
        }

        serenity::FullEvent::MessageDelete {
            channel_id,
            deleted_message_id,
            ..
        } => {
            super::gh_reverse::handle_reverse_delete(*channel_id, *deleted_message_id, &data.app)
                .await;
        }

        _ => {}
    }

    Ok(())
}

// ── Bot startup ─────────────────────────────────────────────────────────

pub async fn start(app_state: Arc<AppState>) -> Result<()> {
    let token = match resolve_token().await? {
        Some(t) => t,
        None => {
            info!("No Discord token configured (env or vault), skipping Discord bot");
            // Park this task so tokio::select! doesn't immediately resolve
            std::future::pending::<()>().await;
            return Ok(());
        }
    };

    let intents =
        serenity::GatewayIntents::non_privileged() | serenity::GatewayIntents::MESSAGE_CONTENT;

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
