//! Discord Activity session bridge.
//!
//! POST `/api/discord/session` — the backend half of the isolated Discord path.
//! Takes the Discord OAuth `code` from the Activity, exchanges it for a Discord
//! access token + user, resolves the linked KBVE profile, and mints a
//! Supabase-compatible HS256 JWT the game server already accepts (same claims
//! the GoTrue custom-access-token hook injects: `sub`, `exp`, `kbve_username`,
//! `role`, `aud`). Returns `{access_token, jwt, username}`.

use std::{
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};

use axum::{
    Extension, Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use jedi::state::pg::{PgCluster, tokio_postgres::Row};
use jsonwebtoken::{Algorithm, EncodingKey, Header, encode};
use serde::{Deserialize, Serialize};

const DISCORD_TOKEN_URL: &str = "https://discord.com/api/v10/oauth2/token";
const DISCORD_USER_URL: &str = "https://discord.com/api/v10/users/@me";
/// Game session lifetime. Activities are short-lived; the game reconnects with
/// a fresh exchange if it outlives this.
const JWT_TTL_SECS: u64 = 6 * 60 * 60;

#[derive(Deserialize)]
pub struct SessionRequest {
    code: String,
}

#[derive(Serialize)]
pub struct SessionResponse {
    /// Discord access token — fed back to `discordSdk.commands.authenticate`.
    access_token: String,
    /// Supabase-valid HS256 JWT for the game server.
    jwt: String,
    username: String,
}

#[derive(Deserialize)]
struct DiscordToken {
    access_token: String,
}

#[derive(Deserialize)]
struct DiscordUser {
    id: String,
}

#[derive(Serialize)]
struct MintedClaims {
    sub: String,
    exp: i64,
    kbve_username: String,
    role: String,
    aud: String,
}

pub async fn session(
    Extension(pg): Extension<Option<Arc<PgCluster>>>,
    Json(req): Json<SessionRequest>,
) -> Response {
    let client_id = std::env::var("DISCORD_CLIENT_ID").unwrap_or_default();
    let client_secret = std::env::var("DISCORD_CLIENT_SECRET").unwrap_or_default();
    let redirect_uri = std::env::var("DISCORD_REDIRECT_URI").unwrap_or_default();
    let jwt_secret = std::env::var("SUPABASE_JWT_SECRET").unwrap_or_default();
    if client_id.is_empty() || client_secret.is_empty() || jwt_secret.is_empty() {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            "discord session bridge not configured",
        )
            .into_response();
    }
    let Some(pg) = pg else {
        return (StatusCode::SERVICE_UNAVAILABLE, "database offline").into_response();
    };

    let http = reqwest::Client::new();

    // 1. OAuth code -> Discord access token.
    let token: DiscordToken = match http
        .post(DISCORD_TOKEN_URL)
        .form(&[
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("grant_type", "authorization_code"),
            ("code", req.code.as_str()),
            ("redirect_uri", redirect_uri.as_str()),
        ])
        .send()
        .await
        .and_then(|r| r.error_for_status())
    {
        Ok(r) => match r.json().await {
            Ok(t) => t,
            Err(_) => return (StatusCode::BAD_GATEWAY, "bad token response").into_response(),
        },
        Err(e) => {
            tracing::warn!(error = %e, "discord code exchange failed");
            return (StatusCode::UNAUTHORIZED, "discord code exchange failed").into_response();
        }
    };

    // 2. Access token -> Discord user id (snowflake).
    let user: DiscordUser = match http
        .get(DISCORD_USER_URL)
        .bearer_auth(&token.access_token)
        .send()
        .await
        .and_then(|r| r.error_for_status())
    {
        Ok(r) => match r.json().await {
            Ok(u) => u,
            Err(_) => return (StatusCode::BAD_GATEWAY, "bad user response").into_response(),
        },
        Err(e) => {
            tracing::warn!(error = %e, "discord /users/@me failed");
            return (StatusCode::BAD_GATEWAY, "discord user fetch failed").into_response();
        }
    };

    // 3. Discord id -> linked KBVE profile (user_id + kbve_username).
    let conn = match pg.read().await {
        Ok(c) => c,
        Err(e) => {
            tracing::error!(error = %e, "pg acquire failed");
            return (StatusCode::SERVICE_UNAVAILABLE, "database unavailable").into_response();
        }
    };
    let row: Row = match conn
        .query_opt(
            "SELECT user_id::text, kbve_username \
             FROM tracker.find_claim_identity_by_discord_id($1)",
            &[&user.id],
        )
        .await
    {
        Ok(Some(row)) => row,
        Ok(None) => {
            return (
                StatusCode::FORBIDDEN,
                "Discord account is not linked to a KBVE profile",
            )
                .into_response();
        }
        Err(e) => {
            tracing::error!(error = %e, "discord profile lookup failed");
            return (StatusCode::INTERNAL_SERVER_ERROR, "profile lookup failed").into_response();
        }
    };
    let user_id: String = row.get(0);
    let kbve_username: Option<String> = row.get(1);
    let Some(kbve_username) = kbve_username.filter(|u| !u.is_empty()) else {
        return (StatusCode::FORBIDDEN, "linked KBVE profile has no username").into_response();
    };

    // 4. Mint the Supabase-valid HS256 JWT the game server accepts.
    let exp = now_secs().saturating_add(JWT_TTL_SECS) as i64;
    let claims = MintedClaims {
        sub: user_id,
        exp,
        kbve_username: kbve_username.clone(),
        role: "authenticated".into(),
        aud: "authenticated".into(),
    };
    let jwt = match encode(
        &Header::new(Algorithm::HS256),
        &claims,
        &EncodingKey::from_secret(jwt_secret.as_bytes()),
    ) {
        Ok(t) => t,
        Err(e) => {
            tracing::error!(error = %e, "jwt mint failed");
            return (StatusCode::INTERNAL_SERVER_ERROR, "jwt mint failed").into_response();
        }
    };

    Json(SessionResponse {
        access_token: token.access_token,
        jwt,
        username: kbve_username,
    })
    .into_response()
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}
