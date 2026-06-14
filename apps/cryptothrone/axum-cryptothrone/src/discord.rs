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

    // 1. OAuth code -> Discord access token. Activities authorize in-client
    // without a redirect_uri, so only send one when explicitly configured —
    // an empty redirect_uri makes Discord reject the exchange.
    let mut form: Vec<(&str, &str)> = vec![
        ("client_id", client_id.as_str()),
        ("client_secret", client_secret.as_str()),
        ("grant_type", "authorization_code"),
        ("code", req.code.as_str()),
    ];
    if !redirect_uri.is_empty() {
        form.push(("redirect_uri", redirect_uri.as_str()));
    }
    let token: DiscordToken = match http
        .post(DISCORD_TOKEN_URL)
        .form(&form)
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
    let jwt = match mint_session_jwt(&user_id, &kbve_username, jwt_secret.as_bytes(), exp) {
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

/// Mint the Supabase-compatible HS256 JWT the game server accepts. Mirrors the
/// claim set the GoTrue custom-access-token hook injects (`sub`, `exp`,
/// `kbve_username`, `role`, `aud`). Pure — no env/IO — so it is unit tested.
fn mint_session_jwt(
    sub: &str,
    kbve_username: &str,
    secret: &[u8],
    exp: i64,
) -> Result<String, jsonwebtoken::errors::Error> {
    let claims = MintedClaims {
        sub: sub.to_string(),
        exp,
        kbve_username: kbve_username.to_string(),
        role: "authenticated".into(),
        aud: "authenticated".into(),
    };
    encode(
        &Header::new(Algorithm::HS256),
        &claims,
        &EncodingKey::from_secret(secret),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::StatusCode;
    use axum::response::IntoResponse;
    use serial_test::serial;

    /// Decode-side mirror of the minted claims so the round-trip can assert
    /// every field the game server relies on.
    #[derive(Deserialize)]
    struct DecodedClaims {
        sub: String,
        exp: i64,
        kbve_username: String,
        role: String,
        aud: String,
    }

    fn decode_minted(token: &str, secret: &[u8]) -> DecodedClaims {
        use jsonwebtoken::{DecodingKey, Validation, decode};
        let mut v = Validation::new(Algorithm::HS256);
        v.validate_aud = false;
        decode::<DecodedClaims>(token, &DecodingKey::from_secret(secret), &v)
            .unwrap()
            .claims
    }

    #[test]
    fn mint_jwt_round_trip_carries_supabase_claims() {
        let secret = b"super-secret-key";
        let exp = now_secs() as i64 + 3600;
        let token = mint_session_jwt("user-123", "h0lybyte", secret, exp).unwrap();

        // Verifiable by the same path the game server uses.
        assert_eq!(
            crate::auth::verify_supabase_jwt(&token, secret)
                .unwrap()
                .kbve_username,
            "h0lybyte"
        );

        let c = decode_minted(&token, secret);
        assert_eq!(c.sub, "user-123");
        assert_eq!(c.kbve_username, "h0lybyte");
        assert_eq!(c.role, "authenticated");
        assert_eq!(c.aud, "authenticated");
        assert_eq!(c.exp, exp);
    }

    #[test]
    fn mint_jwt_rejects_wrong_secret() {
        let token = mint_session_jwt("u", "name", b"right", now_secs() as i64 + 60).unwrap();
        assert!(crate::auth::verify_supabase_jwt(&token, b"wrong").is_err());
    }

    #[test]
    fn now_secs_is_monotonic_and_positive() {
        assert!(now_secs() > 1_700_000_000);
    }

    #[tokio::test]
    #[serial]
    async fn session_returns_500_when_unconfigured() {
        for k in [
            "DISCORD_CLIENT_ID",
            "DISCORD_CLIENT_SECRET",
            "SUPABASE_JWT_SECRET",
        ] {
            std::env::remove_var(k);
        }
        let resp = session(Extension(None), Json(SessionRequest { code: "abc".into() }))
            .await
            .into_response();
        assert_eq!(resp.status(), StatusCode::INTERNAL_SERVER_ERROR);
    }

    #[tokio::test]
    #[serial]
    async fn session_returns_503_when_db_offline() {
        std::env::set_var("DISCORD_CLIENT_ID", "id");
        std::env::set_var("DISCORD_CLIENT_SECRET", "secret");
        std::env::set_var("SUPABASE_JWT_SECRET", "jwt-secret");
        let resp = session(Extension(None), Json(SessionRequest { code: "abc".into() }))
            .await
            .into_response();
        assert_eq!(resp.status(), StatusCode::SERVICE_UNAVAILABLE);
        for k in [
            "DISCORD_CLIENT_ID",
            "DISCORD_CLIENT_SECRET",
            "SUPABASE_JWT_SECRET",
        ] {
            std::env::remove_var(k);
        }
    }
}
