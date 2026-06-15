use crate::error::ApiError;
use axum::extract::FromRequestParts;
use axum::http::HeaderMap;
use axum::http::header::AUTHORIZATION;
use axum::http::request::Parts;
use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode};
use serde::Deserialize;
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

pub fn verify_supabase_jwt(token: &str, secret: &[u8]) -> Result<SupabaseClaims, String> {
    if secret.is_empty() {
        return Err("SUPABASE_JWT_SECRET is not set".into());
    }
    let mut validation = Validation::new(Algorithm::HS256);
    validation.validate_aud = false;
    decode::<SupabaseClaims>(token, &DecodingKey::from_secret(secret), &validation)
        .map(|d| d.claims)
        .map_err(|e| e.to_string())
}

pub struct AuthUser {
    pub user_id: Uuid,
    pub username: String,
    pub role: String,
}

impl<S> FromRequestParts<S> for AuthUser
where
    S: Send + Sync,
{
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let secret = std::env::var("SUPABASE_JWT_SECRET")
            .map_err(|_| ApiError::Internal("SUPABASE_JWT_SECRET not configured".into()))?;
        let token = bearer_token(&parts.headers)
            .ok_or_else(|| ApiError::Unauthorized("missing bearer token".into()))?;
        let claims = verify_supabase_jwt(token, secret.as_bytes())
            .map_err(|e| ApiError::Unauthorized(format!("invalid token: {e}")))?;
        let user_id = Uuid::parse_str(&claims.sub)
            .map_err(|_| ApiError::Unauthorized("invalid sub claim".into()))?;
        Ok(AuthUser {
            user_id,
            username: claims.kbve_username,
            role: claims.role,
        })
    }
}
