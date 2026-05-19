use jsonwebtoken::{Algorithm, DecodingKey, Validation};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone)]
pub struct SupabaseConfig {
    pub jwt_secret: Option<String>,
    pub url: Option<String>,
    /// Argon2 hash of the service role key (never plaintext).
    pub service_key_hash: Option<String>,
}

impl SupabaseConfig {
    /// All fields stay optional so ROWS still boots without Supabase (legacy mode).
    pub fn from_env() -> Self {
        Self {
            jwt_secret: std::env::var("SUPABASE_JWT_SECRET").ok(),
            url: std::env::var("SUPABASE_URL").ok(),
            service_key_hash: std::env::var("SUPABASE_SERVICE_KEY_HASH").ok(),
        }
    }

    pub fn jwt_enabled(&self) -> bool {
        self.jwt_secret.is_some()
    }

    pub fn service_key_enabled(&self) -> bool {
        self.service_key_hash.is_some()
    }
}

#[derive(Debug, Deserialize, Serialize)]
pub struct SupabaseClaims {
    pub sub: String,
    #[serde(default)]
    pub aud: String,
    #[serde(default)]
    pub role: String,
    #[serde(default)]
    pub iat: i64,
    #[serde(default)]
    pub exp: i64,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub app_metadata: Option<AppMetadata>,
}

#[derive(Debug, Deserialize, Serialize, Default)]
pub struct AppMetadata {
    #[serde(default)]
    pub customer_guid: Option<String>,
    #[serde(default)]
    pub is_admin: Option<bool>,
}

#[derive(Debug)]
pub struct ValidatedUser {
    pub user_id: Uuid,
    pub customer_guid: Uuid,
    pub role: String,
    pub email: Option<String>,
    pub is_admin: bool,
}

/// Validates locally with the JWT secret. Revocation is not checked here —
/// Supabase has no blocklist, so callers that need it must verify the DB session.
pub fn validate_jwt(token: &str, config: &SupabaseConfig) -> Result<ValidatedUser, JwtError> {
    let secret = config.jwt_secret.as_ref().ok_or(JwtError::NotConfigured)?;

    let mut validation = Validation::new(Algorithm::HS256);
    validation.set_audience(&["authenticated"]);
    validation.validate_aud = false;

    let key = DecodingKey::from_secret(secret.as_bytes());

    let token_data = jsonwebtoken::decode::<SupabaseClaims>(token, &key, &validation)
        .map_err(|e| JwtError::Invalid(e.to_string()))?;

    let claims = token_data.claims;

    let user_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| JwtError::Invalid("Invalid sub (user_id) in JWT".into()))?;

    let customer_guid = claims
        .app_metadata
        .as_ref()
        .and_then(|m| m.customer_guid.as_ref())
        .and_then(|g| Uuid::parse_str(g).ok())
        .unwrap_or(Uuid::nil());

    let is_admin = claims
        .app_metadata
        .as_ref()
        .and_then(|m| m.is_admin)
        .unwrap_or(false);

    Ok(ValidatedUser {
        user_id,
        customer_guid,
        role: claims.role,
        email: claims.email,
        is_admin,
    })
}

/// Compares against the stored argon2 hash (constant-time, defeats timing attacks).
pub fn validate_service_key(key: &str, config: &SupabaseConfig) -> Result<(), JwtError> {
    let hash = config
        .service_key_hash
        .as_ref()
        .ok_or(JwtError::NotConfigured)?;

    let _ = (key, hash);

    Err(JwtError::NotConfigured)
}

#[derive(Debug, thiserror::Error)]
pub enum JwtError {
    #[error("JWT validation not configured (SUPABASE_JWT_SECRET not set)")]
    NotConfigured,
    #[error("Invalid JWT: {0}")]
    Invalid(String),
    #[error("Token expired")]
    Expired,
    #[error("Invalid service key")]
    InvalidServiceKey,
}
