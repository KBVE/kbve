//! Supabase access-token verification.
//!
//! Tokens are issued by GoTrue on supabase.kbve.com. They are HS256 JWTs
//! signed with the project's `SUPABASE_JWT_SECRET`. The Custom Access Token
//! hook injects a top-level `kbve_username` claim — see the project memory
//! note `project_supabase_kbve_username_hook.md` — so servers can identify
//! players without an extra DB round trip.

use serde::{Deserialize, Serialize};

use jsonwebtoken::{DecodingKey, Validation, decode};

/// Claims the server trusts after a successful Supabase JWT verify.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SupabaseClaims {
    pub sub: String,
    pub exp: i64,
    #[serde(default)]
    pub kbve_username: String,
    #[serde(default)]
    pub role: String,
    #[serde(default)]
    pub aud: String,
}

#[derive(Debug)]
pub enum AuthError {
    /// `SUPABASE_JWT_SECRET` is empty and strict mode was requested.
    MissingSecret,
    /// `jsonwebtoken` rejected the token (signature, expiry, etc.).
    Invalid(String),
    /// JWT decoded but `kbve_username` claim is missing.
    MissingUsername,
}

impl std::fmt::Display for AuthError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AuthError::MissingSecret => write!(f, "SUPABASE_JWT_SECRET is not set"),
            AuthError::Invalid(msg) => write!(f, "invalid token: {msg}"),
            AuthError::MissingUsername => write!(f, "token missing kbve_username claim"),
        }
    }
}

impl std::error::Error for AuthError {}

/// Verify a Supabase access token. `secret` is the project's
/// `SUPABASE_JWT_SECRET`. Returns the decoded claims on success.
pub fn verify_supabase_jwt(token: &str, secret: &[u8]) -> Result<SupabaseClaims, AuthError> {
    if secret.is_empty() {
        return Err(AuthError::MissingSecret);
    }
    let mut validation = Validation::new(jsonwebtoken::Algorithm::HS256);
    // GoTrue tokens default to aud=`authenticated`. Don't pin it — clients
    // may legitimately come in with different aud (e.g. service role).
    validation.validate_aud = false;
    let data = decode::<SupabaseClaims>(token, &DecodingKey::from_secret(secret), &validation)
        .map_err(|e| AuthError::Invalid(e.to_string()))?;
    if data.claims.kbve_username.is_empty() {
        return Err(AuthError::MissingUsername);
    }
    Ok(data.claims)
}
