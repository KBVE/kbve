//! `/vault` slash commands — guild owners manage encrypted tokens via Supabase Vault.

use serde::Deserialize;
use tracing::{info, warn};

use kbve::{MemberStatus, SupabaseClient};

use crate::discord::bot::{Context, Error};

const SCHEMA: &str = "discordsh";

// ── Response types ──────────────────────────────────────────────────

#[derive(Deserialize)]
struct SetTokenRow {
    success: bool,
    #[allow(dead_code)]
    token_id: Option<String>,
    message: String,
}

#[derive(Deserialize)]
struct ListTokenRow {
    id: String,
    token_name: String,
    service: String,
    description: Option<String>,
    is_active: bool,
}

#[derive(Deserialize)]
struct ResultRow {
    success: bool,
    message: String,
}

// ── Helpers ─────────────────────────────────────────────────────────

/// Resolve the caller's Supabase UUID and the guild's server_id string.
/// Returns `Err` with a user-facing message if the command can't proceed.
async fn resolve_owner(ctx: Context<'_>) -> Result<(String, String), String> {
    let guild_id = ctx
        .guild_id()
        .ok_or_else(|| "This command must be used in a server.".to_string())?;

    let server_id = guild_id.get().to_string();

    let member_status = ctx.data().app.members.lookup(ctx.author().id.get()).await;

    match member_status {
        MemberStatus::Member(profile) => Ok((server_id, profile.user_id)),
        MemberStatus::Guest { .. } => Err(
            "You must link your Discord account at <https://kbve.com> to use vault commands."
                .to_string(),
        ),
    }
}

fn get_client() -> Result<SupabaseClient, String> {
    SupabaseClient::from_env().ok_or_else(|| "Supabase is not configured.".to_string())
}

/// Send an ephemeral error and return Ok(()) to end the command gracefully.
async fn send_error(ctx: Context<'_>, msg: &str) -> Result<(), Error> {
    ctx.send(poise::CreateReply::default().content(msg).ephemeral(true))
        .await?;
    Ok(())
}

// ── Parent command ──────────────────────────────────────────────────

/// Manage encrypted guild vault tokens.
#[poise::command(slash_command, subcommands("set", "list", "delete", "toggle"))]
pub async fn vault(_ctx: Context<'_>) -> Result<(), Error> {
    Ok(())
}

// ── /vault set ──────────────────────────────────────────────────────

/// Store or update an encrypted token for this guild.
#[poise::command(slash_command)]
async fn set(
    ctx: Context<'_>,
    #[description = "Service name (e.g. github, openai)"] service: String,
    #[description = "Token name (3-64 chars, a-z0-9_-)"] name: String,
    #[description = "Token value (10-8000 chars)"] value: String,
    #[description = "Optional description (max 500 chars)"] description: Option<String>,
) -> Result<(), Error> {
    ctx.defer_ephemeral().await?;

    let (server_id, owner_id) = match resolve_owner(ctx).await {
        Ok(v) => v,
        Err(msg) => return send_error(ctx, &msg).await,
    };
    let client = match get_client() {
        Ok(c) => c,
        Err(msg) => return send_error(ctx, &msg).await,
    };

    let params = serde_json::json!({
        "p_owner_id": owner_id,
        "p_server_id": server_id,
        "p_service": service,
        "p_token_name": name,
        "p_token_value": value,
        "p_description": description,
    });

    match client
        .rpc_schema("service_set_guild_token", params, SCHEMA)
        .await
    {
        Ok(resp) => {
            let status = resp.status();
            match resp.json::<Vec<SetTokenRow>>().await {
                Ok(rows) if !rows.is_empty() => {
                    let row = &rows[0];
                    if row.success {
                        info!(
                            user = %ctx.author().name,
                            server_id,
                            service,
                            token_name = name,
                            "Vault token set"
                        );
                        send_error(
                            ctx,
                            &format!("Token **{}** ({}) stored successfully.", name, service),
                        )
                        .await
                    } else {
                        send_error(ctx, &row.message).await
                    }
                }
                Ok(_) => send_error(ctx, "Unexpected empty response from database.").await,
                Err(e) => {
                    warn!(status = %status, error = %e, "service_set_guild_token parse error");
                    send_error(ctx, "Failed to store token. Please try again.").await
                }
            }
        }
        Err(e) => {
            warn!(error = %e, "service_set_guild_token RPC failed");
            send_error(ctx, "Failed to reach the database. Please try again.").await
        }
    }
}

// ── /vault list ─────────────────────────────────────────────────────

/// List all tokens stored for this guild (metadata only, no secret values).
#[poise::command(slash_command)]
async fn list(ctx: Context<'_>) -> Result<(), Error> {
    ctx.defer_ephemeral().await?;

    let (server_id, owner_id) = match resolve_owner(ctx).await {
        Ok(v) => v,
        Err(msg) => return send_error(ctx, &msg).await,
    };
    let client = match get_client() {
        Ok(c) => c,
        Err(msg) => return send_error(ctx, &msg).await,
    };

    let params = serde_json::json!({
        "p_owner_id": owner_id,
        "p_server_id": server_id,
    });

    match client
        .rpc_schema("service_list_guild_tokens", params, SCHEMA)
        .await
    {
        Ok(resp) => {
            let status = resp.status();
            if !status.is_success() {
                warn!(status = %status, "service_list_guild_tokens returned non-200");
                return send_error(
                    ctx,
                    "Failed to list tokens. You may not be the server owner.",
                )
                .await;
            }
            match resp.json::<Vec<ListTokenRow>>().await {
                Ok(rows) if rows.is_empty() => {
                    send_error(ctx, "No tokens stored for this guild.").await
                }
                Ok(rows) => {
                    let mut lines = Vec::with_capacity(rows.len());
                    for row in &rows {
                        let status_icon = if row.is_active { "🟢" } else { "🔴" };
                        let desc = row.description.as_deref().unwrap_or("-");
                        lines.push(format!(
                            "{} **{}** / `{}` — {}\n  `id: {}`",
                            status_icon, row.service, row.token_name, desc, row.id
                        ));
                    }

                    let embed = poise::serenity_prelude::CreateEmbed::new()
                        .title("Guild Vault Tokens")
                        .description(lines.join("\n\n"))
                        .color(0x5865F2);

                    ctx.send(poise::CreateReply::default().embed(embed).ephemeral(true))
                        .await?;
                    Ok(())
                }
                Err(e) => {
                    warn!(error = %e, "service_list_guild_tokens parse error");
                    send_error(ctx, "Failed to parse token list.").await
                }
            }
        }
        Err(e) => {
            warn!(error = %e, "service_list_guild_tokens RPC failed");
            send_error(ctx, "Failed to reach the database. Please try again.").await
        }
    }
}

// ── /vault delete ───────────────────────────────────────────────────

/// Delete a token from this guild's vault.
#[poise::command(slash_command)]
async fn delete(
    ctx: Context<'_>,
    #[description = "Token ID (UUID from /vault list)"] token_id: String,
) -> Result<(), Error> {
    ctx.defer_ephemeral().await?;

    let (server_id, owner_id) = match resolve_owner(ctx).await {
        Ok(v) => v,
        Err(msg) => return send_error(ctx, &msg).await,
    };
    let client = match get_client() {
        Ok(c) => c,
        Err(msg) => return send_error(ctx, &msg).await,
    };

    let params = serde_json::json!({
        "p_owner_id": owner_id,
        "p_server_id": server_id,
        "p_token_id": token_id,
    });

    match client
        .rpc_schema("service_delete_guild_token", params, SCHEMA)
        .await
    {
        Ok(resp) => {
            let status = resp.status();
            match resp.json::<Vec<ResultRow>>().await {
                Ok(rows) if !rows.is_empty() => {
                    let row = &rows[0];
                    if row.success {
                        info!(
                            user = %ctx.author().name,
                            server_id,
                            token_id,
                            "Vault token deleted"
                        );
                    }
                    send_error(ctx, &row.message).await
                }
                Ok(_) => send_error(ctx, "Unexpected empty response from database.").await,
                Err(e) => {
                    warn!(status = %status, error = %e, "service_delete_guild_token parse error");
                    send_error(ctx, "Failed to delete token. Please try again.").await
                }
            }
        }
        Err(e) => {
            warn!(error = %e, "service_delete_guild_token RPC failed");
            send_error(ctx, "Failed to reach the database. Please try again.").await
        }
    }
}

// ── /vault toggle ───────────────────────────────────────────────────

/// Enable or disable a token without deleting it.
#[poise::command(slash_command)]
async fn toggle(
    ctx: Context<'_>,
    #[description = "Token ID (UUID from /vault list)"] token_id: String,
    #[description = "Enable (true) or disable (false)"] enabled: bool,
) -> Result<(), Error> {
    ctx.defer_ephemeral().await?;

    let (server_id, owner_id) = match resolve_owner(ctx).await {
        Ok(v) => v,
        Err(msg) => return send_error(ctx, &msg).await,
    };
    let client = match get_client() {
        Ok(c) => c,
        Err(msg) => return send_error(ctx, &msg).await,
    };

    let params = serde_json::json!({
        "p_owner_id": owner_id,
        "p_server_id": server_id,
        "p_token_id": token_id,
        "p_is_active": enabled,
    });

    match client
        .rpc_schema("service_toggle_guild_token_status", params, SCHEMA)
        .await
    {
        Ok(resp) => {
            let status = resp.status();
            match resp.json::<Vec<ResultRow>>().await {
                Ok(rows) if !rows.is_empty() => {
                    let row = &rows[0];
                    if row.success {
                        let action = if enabled { "enabled" } else { "disabled" };
                        info!(
                            user = %ctx.author().name,
                            server_id,
                            token_id,
                            action,
                            "Vault token toggled"
                        );
                    }
                    send_error(ctx, &row.message).await
                }
                Ok(_) => send_error(ctx, "Unexpected empty response from database.").await,
                Err(e) => {
                    warn!(status = %status, error = %e, "service_toggle_guild_token_status parse error");
                    send_error(ctx, "Failed to toggle token. Please try again.").await
                }
            }
        }
        Err(e) => {
            warn!(error = %e, "service_toggle_guild_token_status RPC failed");
            send_error(ctx, "Failed to reach the database. Please try again.").await
        }
    }
}
