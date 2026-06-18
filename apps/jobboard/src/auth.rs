use crate::error::ApiError;
use crate::state::{AppState, AuthMode, CachedAuth};
use axum::extract::FromRequestParts;
use axum::http::HeaderMap;
use axum::http::header::AUTHORIZATION;
use axum::http::request::Parts;
use jsonwebtoken::dangerous::insecure_decode;
use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode};
use serde::Deserialize;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

#[derive(Debug, Deserialize)]
pub struct SupabaseClaims {
    pub sub: String,
    pub exp: i64,
    #[serde(default)]
    pub kbve_username: String,
    #[serde(default)]
    pub role: String,
}

pub fn bearer_token(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| {
            v.strip_prefix("Bearer ")
                .or_else(|| v.strip_prefix("bearer "))
        })
        .map(str::trim)
        .filter(|t| !t.is_empty())
}

/// Read claims without trusting the signature. The signature is confirmed
/// out-of-band against live Supabase; this only extracts sub/username/role/exp.
/// Callers enforce `exp` separately so expired tokens skip the network.
fn decode_claims(token: &str) -> Result<SupabaseClaims, String> {
    insecure_decode::<SupabaseClaims>(token)
        .map(|d| d.claims)
        .map_err(|e| e.to_string())
}

/// Offline HS256 verification with the shared Supabase secret (prod mode).
fn verify_local(token: &str, secret: &[u8]) -> Result<(), ApiError> {
    if secret.is_empty() {
        return Err(ApiError::Internal(
            "SUPABASE_JWT_SECRET not configured".into(),
        ));
    }
    let mut validation = Validation::new(Algorithm::HS256);
    validation.validate_aud = false;
    decode::<SupabaseClaims>(token, &DecodingKey::from_secret(secret), &validation)
        .map(|_| ())
        .map_err(|e| ApiError::Unauthorized(format!("invalid token: {e}")))
}

fn now_unix() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Confirm the bearer is genuinely valid by resolving it against live Supabase
/// GoTrue (`/auth/v1/user`). A 200 means GoTrue verified the signature and the
/// token is not expired/revoked — no shared JWT secret needed on our side.
async fn remote_verify(app: &AppState, token: &str) -> Result<(), ApiError> {
    let url = format!("{}/auth/v1/user", app.supabase_url);
    let resp = app
        .http
        .get(&url)
        .header(AUTHORIZATION, format!("Bearer {token}"))
        .header("apikey", &app.anon_key)
        .send()
        .await
        .map_err(|e| ApiError::Unauthorized(format!("auth upstream unreachable: {e}")))?;
    if resp.status().is_success() {
        Ok(())
    } else {
        Err(ApiError::Unauthorized("token rejected by supabase".into()))
    }
}

pub struct AuthUser {
    pub user_id: Uuid,
    pub username: String,
    pub role: String,
}

impl FromRequestParts<Arc<AppState>> for AuthUser {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        app: &Arc<AppState>,
    ) -> Result<Self, Self::Rejection> {
        let token = bearer_token(&parts.headers)
            .ok_or_else(|| ApiError::Unauthorized("missing bearer token".into()))?
            .to_string();

        let now = now_unix();

        if let Some(hit) = {
            let mut cache = app.auth_cache.lock().unwrap();
            cache.get(&token).filter(|c| c.exp > now).cloned()
        } {
            return Ok(AuthUser {
                user_id: hit.user_id,
                username: hit.username,
                role: hit.role,
            });
        }

        let claims = decode_claims(&token)
            .map_err(|e| ApiError::Unauthorized(format!("invalid token: {e}")))?;
        if claims.exp <= now {
            return Err(ApiError::Unauthorized("token expired".into()));
        }
        let user_id = Uuid::parse_str(&claims.sub)
            .map_err(|_| ApiError::Unauthorized("invalid sub claim".into()))?;

        match app.auth_mode {
            AuthMode::Local => verify_local(&token, &app.jwt_secret)?,
            AuthMode::Remote => remote_verify(app, &token).await?,
        }

        let cached = CachedAuth {
            user_id,
            username: claims.kbve_username,
            role: claims.role,
            exp: claims.exp,
        };
        app.auth_cache.lock().unwrap().put(token, cached.clone());

        Ok(AuthUser {
            user_id: cached.user_id,
            username: cached.username,
            role: cached.role,
        })
    }
}
