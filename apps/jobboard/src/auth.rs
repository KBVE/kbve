use crate::error::ApiError;
use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier};
use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use password_hash::SaltString;
use rand_core::OsRng;
use tower_sessions::Session;
use uuid::Uuid;

pub const SESSION_USER_KEY: &str = "user_id";

pub fn hash_password(password: &str) -> anyhow::Result<String> {
    let salt = SaltString::generate(&mut OsRng);
    let hash = Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| anyhow::anyhow!("password hash failed: {e}"))?;
    Ok(hash.to_string())
}

pub fn verify_password(password: &str, hash: &str) -> bool {
    match PasswordHash::new(hash) {
        Ok(parsed) => Argon2::default()
            .verify_password(password.as_bytes(), &parsed)
            .is_ok(),
        Err(_) => false,
    }
}

pub struct AuthUser {
    pub user_id: Uuid,
}

impl<S> FromRequestParts<S> for AuthUser
where
    S: Send + Sync,
{
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let session = Session::from_request_parts(parts, state)
            .await
            .map_err(|_| ApiError::Unauthorized("no session".into()))?;
        let raw: Option<String> = session
            .get(SESSION_USER_KEY)
            .await
            .map_err(|e| ApiError::Internal(e.to_string()))?;
        let raw = raw.ok_or_else(|| ApiError::Unauthorized("not logged in".into()))?;
        let user_id =
            Uuid::parse_str(&raw).map_err(|_| ApiError::Unauthorized("invalid session".into()))?;
        Ok(AuthUser { user_id })
    }
}
