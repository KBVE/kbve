// Authentication module - JWT validation for Supabase

pub mod jwt_cache;

pub use jwt_cache::{JwtCacheError, get_jwt_cache, init_jwt_cache};

use jsonwebtoken::{Algorithm, DecodingKey, TokenData, Validation, decode};
use serde::{Deserialize, Serialize};

/// JWT Claims from Supabase
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    /// Subject (user ID as UUID)
    pub sub: String,
    /// Issued at (Unix timestamp)
    pub iat: i64,
    /// Expiration time (Unix timestamp)
    pub exp: i64,
    /// Issuer
    #[serde(default)]
    pub iss: String,
    /// Role (e.g., "authenticated", "anon")
    #[serde(default)]
    pub role: String,
    /// User email
    pub email: Option<String>,
    /// User phone
    pub phone: Option<String>,
    /// App metadata
    pub app_metadata: Option<serde_json::Value>,
    /// User metadata
    pub user_metadata: Option<serde_json::Value>,
}

/// Authenticated user information
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

/// Authentication errors
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

/// Validate a JWT token using the Supabase JWT secret
#[allow(dead_code)]
pub fn validate_token(token: &str, jwt_secret: &str) -> Result<TokenData<Claims>, AuthError> {
    let key = DecodingKey::from_secret(jwt_secret.as_bytes());

    let mut validation = Validation::new(Algorithm::HS256);
    validation.validate_exp = true;
    validation.set_issuer(&["supabase"]);

    decode::<Claims>(token, &key, &validation).map_err(|e| match e.kind() {
        jsonwebtoken::errors::ErrorKind::ExpiredSignature => AuthError::TokenExpired,
        _ => AuthError::InvalidToken(e.to_string()),
    })
}

/// Extract bearer token from Authorization header
pub fn extract_bearer_token(auth_header: &str) -> Option<&str> {
    auth_header
        .strip_prefix("Bearer ")
        .or_else(|| auth_header.strip_prefix("bearer "))
}

/// Check if a token is expired (with optional grace period in seconds)
#[allow(dead_code)]
pub fn is_token_expired(claims: &Claims, grace_seconds: i64) -> bool {
    let now = chrono::Utc::now().timestamp();
    claims.exp + grace_seconds < now
}
