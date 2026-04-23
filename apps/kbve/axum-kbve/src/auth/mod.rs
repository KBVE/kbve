pub mod jwt_cache;

pub use jwt_cache::{JwtCacheError, get_jwt_cache, init_jwt_cache};

use jsonwebtoken::{Algorithm, DecodingKey, TokenData, Validation, decode};
use serde::{Deserialize, Serialize};

// TODO: Thiserror for Auth Error

/*
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AuthError {
    #[error("Missing authentication token")]
    MissingToken,

    #[error("Invalid token: {0}")]
    InvalidToken(String),

    #[error("Token has expired")]
    TokenExpired,

    #[error("JWT secret not configured")]
    MissingSecret,
}
*/

// TODO: Inline time
/*

#[inline]
fn now_epoch() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

pub fn is_token_expired(claims: &Claims, grace_seconds: i64) -> bool {
    claims.exp.saturating_add(grace_seconds) < now_epoch()
}

*/

// TODO: Adjust Claims

/*
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub iat: i64,
    pub exp: i64,

    #[serde(default)]
    pub iss: String,

    #[serde(default = "default_role")]
    pub role: String,

    #[serde(default)]
    pub email: Option<String>,

    #[serde(default)]
    pub phone: Option<String>,

    #[serde(default)]
    pub app_metadata: Option<serde_json::Value>,

    #[serde(default)]
    pub user_metadata: Option<serde_json::Value>,
}

fn default_role() -> String {
    "authenticated".to_string()
}

impl From<&Claims> for AuthUser {
    fn from(claims: &Claims) -> Self {
        Self {
            id: claims.sub.clone(),
            email: claims.email.clone(),
            role: claims.role.clone(),
        }
    }
}

impl From<Claims> for AuthUser {
    fn from(claims: Claims) -> Self {
        Self {
            id: claims.sub,
            email: claims.email,
            role: claims.role,
        }
    }
}

impl Claims {
    #[inline]
    pub fn is_expired(&self) -> bool {
        self.exp < now_epoch()
    }

    #[inline]
    pub fn is_expired_with_grace(&self, grace_seconds: i64) -> bool {
        self.exp.saturating_add(grace_seconds) < now_epoch()
    }
}
*/

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub iat: i64,
    pub exp: i64,
    #[serde(default)]
    pub iss: String,
    #[serde(default)]
    pub role: String,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub app_metadata: Option<serde_json::Value>,
    pub user_metadata: Option<serde_json::Value>,
}

#[allow(dead_code)]
#[derive(Debug, Clone)]
pub struct AuthUser {
    pub id: String,
    pub email: Option<String>,
    pub role: String,
}

impl From<Claims> for AuthUser {
    fn from(claims: Claims) -> Self {
        Self {
            id: claims.sub,
            email: claims.email,
            role: claims.role,
        }
    }
}

#[allow(dead_code)]
#[derive(Debug)]
pub enum AuthError {
    MissingToken,
    InvalidToken(String),
    TokenExpired,
    MissingSecret,
}

impl std::fmt::Display for AuthError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AuthError::MissingToken => write!(f, "Missing authentication token"),
            AuthError::InvalidToken(msg) => write!(f, "Invalid token: {}", msg),
            AuthError::TokenExpired => write!(f, "Token has expired"),
            AuthError::MissingSecret => write!(f, "JWT secret not configured"),
        }
    }
}

impl std::error::Error for AuthError {}

#[allow(dead_code)]
pub fn validate_token(token: &str, jwt_secret: &str) -> Result<TokenData<Claims>, AuthError> {
    let key = DecodingKey::from_secret(jwt_secret.as_bytes());

    let mut validation = Validation::new(Algorithm::HS256);
    validation.validate_exp = true;
    validation.set_issuer::<String>(&[]);

    decode::<Claims>(token, &key, &validation).map_err(|e| match e.kind() {
        jsonwebtoken::errors::ErrorKind::ExpiredSignature => AuthError::TokenExpired,
        _ => AuthError::InvalidToken(e.to_string()),
    })
}

pub fn extract_bearer_token(auth_header: &str) -> Option<&str> {
    auth_header
        .strip_prefix("Bearer ")
        .or_else(|| auth_header.strip_prefix("bearer "))
}

#[allow(dead_code)]
pub fn is_token_expired(claims: &Claims, grace_seconds: i64) -> bool {
    let now = chrono::Utc::now().timestamp();
    claims.exp + grace_seconds < now
}
