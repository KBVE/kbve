use serde::{Deserialize, Serialize};

use jsonwebtoken::{DecodingKey, Validation, decode};

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
    MissingSecret,
    Invalid(String),
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
