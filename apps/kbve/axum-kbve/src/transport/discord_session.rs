//! Discord Activity session bridge (shared with the arpg Activity).
//!
//! POST `/api/discord/session` — the backend half of the isolated Discord path.
//! Takes the Discord OAuth `code` from the Activity, exchanges it for a Discord
//! access token + user, resolves the linked KBVE profile (fast-registers one if
//! missing), and mints a Supabase-compatible HS256 JWT the game server already
//! accepts (same claims the GoTrue custom-access-token hook injects: `sub`,
//! `iat`, `exp`, `kbve_username`, `role`, `aud`). Returns `{access_token, jwt,
//! username}`.
//!
//! Ported from axum-cryptothrone; identical OAuth/mint/provision logic on the
//! same shared Supabase DB (`tracker.*` RPCs), differing only in using the
//! global `crate::db::get_pg_cluster()` instead of an Extension and a kbve.com
//! synthetic-email domain.

use std::sync::OnceLock;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use jedi::state::pg::PgConn;
use jsonwebtoken::{Algorithm, EncodingKey, Header, encode};
use serde::{Deserialize, Serialize};

/// Shared HTTP client for all Discord/GoTrue upstream calls. Built once with a
/// bounded timeout so a hung upstream can't pin an Axum worker (or the DB write
/// connection held across the provision step) indefinitely.
fn http_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .connect_timeout(Duration::from_secs(5))
            .build()
            .unwrap_or_default()
    })
}

const DISCORD_TOKEN_URL: &str = "https://discord.com/api/v10/oauth2/token";
const DISCORD_USER_URL: &str = "https://discord.com/api/v10/users/@me";
/// Game session lifetime. Activities are short-lived; the game reconnects with
/// a fresh exchange if it outlives this.
const JWT_TTL_SECS: u64 = 6 * 60 * 60;

#[derive(Deserialize)]
pub struct SessionRequest {
    code: String,
}

/// Structured JSON error body so the Discord Activity can surface the failing
/// stage to the player (and branch on a stable `error` code) instead of a bare
/// status line. The HTTP status still classifies the failure: 401 = the user's
/// Discord auth, 502/503 = transient upstream/DB (retryable), 500 = a server
/// misconfiguration the player can't fix.
fn err(status: StatusCode, code: &'static str) -> Response {
    (status, Json(serde_json::json!({ "error": code }))).into_response()
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
    #[serde(default)]
    email: Option<String>,
    #[serde(default)]
    verified: Option<bool>,
    #[serde(default)]
    username: Option<String>,
    #[serde(default)]
    global_name: Option<String>,
}

#[derive(Deserialize)]
struct GoTrueUser {
    id: String,
}

#[derive(Serialize)]
struct MintedClaims {
    sub: String,
    iat: i64,
    exp: i64,
    kbve_username: String,
    role: String,
    aud: String,
}

pub async fn session(Json(req): Json<SessionRequest>) -> Response {
    let client_id = std::env::var("DISCORD_CLIENT_ID").unwrap_or_default();
    let client_secret = std::env::var("DISCORD_CLIENT_SECRET").unwrap_or_default();
    let redirect_uri = std::env::var("DISCORD_REDIRECT_URI").unwrap_or_default();
    let jwt_secret = std::env::var("SUPABASE_JWT_SECRET").unwrap_or_default();
    if client_id.is_empty() || client_secret.is_empty() || jwt_secret.is_empty() {
        return err(
            StatusCode::INTERNAL_SERVER_ERROR,
            "discord session bridge not configured",
        );
    }
    let Some(pg) = crate::db::get_pg_cluster() else {
        return err(StatusCode::SERVICE_UNAVAILABLE, "database offline");
    };

    let http = http_client();

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
            Err(_) => return err(StatusCode::BAD_GATEWAY, "bad token response"),
        },
        Err(e) => {
            tracing::warn!(error = %e, "discord code exchange failed");
            return err(StatusCode::UNAUTHORIZED, "discord code exchange failed");
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
            Err(_) => return err(StatusCode::BAD_GATEWAY, "bad user response"),
        },
        Err(e) => {
            tracing::warn!(error = %e, "discord /users/@me failed");
            return err(StatusCode::BAD_GATEWAY, "discord user fetch failed");
        }
    };

    // 3. Discord id -> linked KBVE profile, or fast-register one. write() pool
    // because the register path sets profile.username.
    let conn = match pg.write().await {
        Ok(c) => c,
        Err(e) => {
            tracing::error!(error = %e, "pg acquire failed");
            return err(StatusCode::SERVICE_UNAVAILABLE, "database unavailable");
        }
    };
    let linked: Option<(String, Option<String>)> = match conn
        .query_opt(
            "SELECT user_id::text, kbve_username \
             FROM tracker.find_claim_identity_by_discord_id($1)",
            &[&user.id],
        )
        .await
    {
        Ok(Some(row)) => Some((row.get(0), row.get(1))),
        Ok(None) => None,
        Err(e) => {
            tracing::error!(
                error = %e,
                discord_id = %user.id,
                "discord profile lookup failed (tracker.find_claim_identity_by_discord_id)"
            );
            return err(StatusCode::INTERNAL_SERVER_ERROR, "profile lookup failed");
        }
    };

    let (user_id, kbve_username) = match linked {
        Some((uid, Some(name))) if !name.is_empty() => (uid, name),
        other => {
            let existing = other.map(|(uid, _)| uid);
            match provision_user(http, &conn, &user, existing).await {
                Ok(pair) => pair,
                Err((code, msg)) => return err(code, msg),
            }
        }
    };

    // 4. Mint the Supabase-valid HS256 JWT the game server accepts.
    let exp = now_secs().saturating_add(JWT_TTL_SECS) as i64;
    let jwt = match mint_session_jwt(&user_id, &kbve_username, jwt_secret.as_bytes(), exp) {
        Ok(t) => t,
        Err(e) => {
            tracing::error!(
                error = %e,
                discord_id = %user.id,
                user_id = %user_id,
                "session jwt mint failed"
            );
            return err(StatusCode::INTERNAL_SERVER_ERROR, "jwt mint failed");
        }
    };

    Json(SessionResponse {
        access_token: token.access_token,
        jwt,
        username: kbve_username,
    })
    .into_response()
}

/// Email key for a Discord user: their verified Discord email, else a stable
/// synthetic address derived from the snowflake so the GoTrue create-or-get is
/// still idempotent for users who didn't grant email or whose email is unverified.
fn discord_email(user: &DiscordUser) -> String {
    match (&user.email, user.verified) {
        (Some(e), Some(true)) if !e.is_empty() => e.to_lowercase(),
        _ => format!("discord_{}@users.kbve.com", user.id),
    }
}

/// Resolve the KBVE user for a Discord identity that isn't fully linked yet:
/// reuse an existing user_id (linked but no username) or fast-register via
/// GoTrue create-or-get on the email key, then ensure a profile.username.
async fn provision_user(
    http: &reqwest::Client,
    conn: &PgConn<'_>,
    user: &DiscordUser,
    existing_uid: Option<String>,
) -> Result<(String, String), (StatusCode, &'static str)> {
    let user_id = match existing_uid {
        Some(uid) => uid,
        None => gotrue_create_or_get(http, conn, &discord_email(user), &user.id).await?,
    };

    let base = user
        .global_name
        .clone()
        .or_else(|| user.username.clone())
        .unwrap_or_default();
    let username: String = match conn
        .query_one(
            "SELECT tracker.ensure_discord_username($1::text::uuid, $2, $3)",
            &[&user_id, &base, &user.id],
        )
        .await
    {
        Ok(row) => row.get(0),
        Err(e) => {
            tracing::error!(
                error = ?e,
                discord_id = %user.id,
                user_id = %user_id,
                "ensure_discord_username failed (assigning profile.username)"
            );
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                "username provisioning failed",
            ));
        }
    };
    Ok((user_id, username))
}

/// GoTrue admin create-or-get keyed on email. GoTrue owns auth.users, so we
/// never hand-craft it; on "already registered" we resolve the existing user.
async fn gotrue_create_or_get(
    http: &reqwest::Client,
    conn: &PgConn<'_>,
    email: &str,
    discord_id: &str,
) -> Result<String, (StatusCode, &'static str)> {
    // Mint a short-lived service_role JWT from the project secret to authorize
    // the admin call. GoTrue's GOTRUE_JWT_SECRET is the same value, and
    // service_role is in GOTRUE_JWT_ADMIN_ROLES — the stored
    // SUPABASE_SERVICE_ROLE_KEY was rejected as not_admin.
    let secret = std::env::var("SUPABASE_JWT_SECRET").unwrap_or_default();
    if secret.is_empty() {
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            "supabase admin not configured",
        ));
    }
    let key = match mint_admin_jwt(secret.as_bytes()) {
        Ok(t) => t,
        Err(e) => {
            tracing::error!(error = %e, "admin jwt mint failed");
            return Err((StatusCode::INTERNAL_SERVER_ERROR, "admin jwt mint failed"));
        }
    };
    // Prefer talking to GoTrue directly (in-cluster auth service) so the admin
    // call doesn't depend on Kong's gateway ACL for /auth/v1/admin. Falls back
    // to the Kong-fronted SUPABASE_URL when the internal URL isn't configured.
    let admin_url = match std::env::var("GOTRUE_INTERNAL_URL") {
        Ok(u) if !u.is_empty() => format!("{}/admin/users", u.trim_end_matches('/')),
        _ => {
            let base = std::env::var("SUPABASE_URL").unwrap_or_default();
            if base.is_empty() {
                return Err((
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "supabase admin not configured",
                ));
            }
            format!("{base}/auth/v1/admin/users")
        }
    };
    let body = serde_json::json!({
        "email": email,
        "email_confirm": true,
        "user_metadata": { "provider": "discord", "discord_id": discord_id },
    });
    match http
        .post(&admin_url)
        .header("apikey", key.as_str())
        .bearer_auth(&key)
        .json(&body)
        .send()
        .await
    {
        Ok(r) if r.status().is_success() => {
            let txt = r.text().await.unwrap_or_default();
            match serde_json::from_str::<GoTrueUser>(&txt) {
                Ok(u) => Ok(u.id),
                Err(_) => {
                    tracing::error!(
                        discord_id = %discord_id,
                        len = txt.len(),
                        "gotrue create returned an unparseable user object (body withheld; contains email)"
                    );
                    Err((StatusCode::BAD_GATEWAY, "bad gotrue response"))
                }
            }
        }
        Ok(r)
            if r.status() == StatusCode::UNPROCESSABLE_ENTITY
                || r.status() == StatusCode::CONFLICT =>
        {
            find_user_id_by_email(conn, email).await
        }
        Ok(r) => {
            let status = r.status();
            let body = r.text().await.unwrap_or_default();
            tracing::error!(
                %status,
                discord_id = %discord_id,
                body = %body,
                "gotrue admin create failed"
            );
            Err((StatusCode::BAD_GATEWAY, "gotrue admin create failed"))
        }
        Err(e) => {
            tracing::error!(
                error = %e,
                discord_id = %discord_id,
                "gotrue admin request failed (network/transport)"
            );
            Err((StatusCode::BAD_GATEWAY, "gotrue admin request failed"))
        }
    }
}

async fn find_user_id_by_email(
    conn: &PgConn<'_>,
    email: &str,
) -> Result<String, (StatusCode, &'static str)> {
    match conn
        .query_opt(
            "SELECT tracker.find_user_id_by_email($1)::text",
            &[&email.to_lowercase()],
        )
        .await
    {
        Ok(Some(row)) => row
            .get::<_, Option<String>>(0)
            .ok_or((StatusCode::INTERNAL_SERVER_ERROR, "user not found by email")),
        Ok(None) => Err((StatusCode::INTERNAL_SERVER_ERROR, "user not found by email")),
        Err(e) => {
            tracing::error!(error = %e, "find_user_id_by_email failed");
            Err((StatusCode::INTERNAL_SERVER_ERROR, "user lookup failed"))
        }
    }
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Mint the Supabase-compatible HS256 JWT the game server accepts. Mirrors the
/// claim set the GoTrue custom-access-token hook injects (`sub`, `iat`, `exp`,
/// `kbve_username`, `role`, `aud`). Pure — no env/IO — so it is unit tested.
fn mint_session_jwt(
    sub: &str,
    kbve_username: &str,
    secret: &[u8],
    exp: i64,
) -> Result<String, jsonwebtoken::errors::Error> {
    let claims = MintedClaims {
        sub: sub.to_string(),
        iat: now_secs() as i64,
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

#[derive(Serialize)]
struct AdminClaims {
    role: String,
    aud: String,
    iss: String,
    iat: i64,
    exp: i64,
}

/// Short-lived `service_role` JWT for the GoTrue admin API. Signed with the
/// project JWT secret (== GoTrue's GOTRUE_JWT_SECRET); `service_role` is in
/// GOTRUE_JWT_ADMIN_ROLES, so GoTrue authorizes the admin call.
fn mint_admin_jwt(secret: &[u8]) -> Result<String, jsonwebtoken::errors::Error> {
    let now = now_secs() as i64;
    let claims = AdminClaims {
        role: "service_role".into(),
        aud: "authenticated".into(),
        iss: "supabase".into(),
        iat: now,
        exp: now.saturating_add(60),
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
    use serial_test::serial;

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

        let c = decode_minted(&token, secret);
        assert_eq!(c.sub, "user-123");
        assert_eq!(c.kbve_username, "h0lybyte");
        assert_eq!(c.role, "authenticated");
        assert_eq!(c.aud, "authenticated");
        assert_eq!(c.exp, exp);
    }

    #[test]
    fn admin_jwt_is_service_role() {
        let token = mint_admin_jwt(b"secret").unwrap();
        use jsonwebtoken::{DecodingKey, Validation, decode};
        #[derive(Deserialize)]
        struct A {
            role: String,
            iss: String,
        }
        let mut v = Validation::new(Algorithm::HS256);
        v.validate_aud = false;
        let a = decode::<A>(&token, &DecodingKey::from_secret(b"secret"), &v)
            .unwrap()
            .claims;
        assert_eq!(a.role, "service_role");
        assert_eq!(a.iss, "supabase");
    }

    #[test]
    fn synthetic_email_for_unverified() {
        let u = DiscordUser {
            id: "12345".into(),
            email: None,
            verified: None,
            username: Some("ranger".into()),
            global_name: None,
        };
        assert_eq!(discord_email(&u), "discord_12345@users.kbve.com");
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
        let resp = session(Json(SessionRequest { code: "abc".into() }))
            .await
            .into_response();
        assert_eq!(resp.status(), StatusCode::INTERNAL_SERVER_ERROR);
    }
}
