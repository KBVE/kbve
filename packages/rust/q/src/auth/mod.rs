//! Supabase access-token verification.

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

/// Verify a Supabase access token.
pub fn verify_supabase_jwt(token: &str, secret: &[u8]) -> Result<SupabaseClaims, AuthError> {
    if secret.is_empty() {
        return Err(AuthError::MissingSecret);
    }
    let mut validation = Validation::new(jsonwebtoken::Algorithm::HS256);
    validation.validate_aud = false;
    let data = decode::<SupabaseClaims>(token, &DecodingKey::from_secret(secret), &validation)
        .map_err(|e| AuthError::Invalid(e.to_string()))?;
    if data.claims.kbve_username.is_empty() {
        return Err(AuthError::MissingUsername);
    }
    Ok(data.claims)
}
