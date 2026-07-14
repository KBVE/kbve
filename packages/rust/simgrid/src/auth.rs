use serde::{Deserialize, Serialize};

use jsonwebtoken::{DecodingKey, Validation, decode};

/// A token verified by an external authority (e.g. Supabase GoTrue): the stable
/// identity and the canonical KBVE username.
#[derive(Clone, Debug)]
pub struct VerifiedUser {
    pub sub: String,
    pub kbve_username: String,
}

/// Pluggable async token verification. The sim is content/infra-agnostic, so a
/// host (the arpg server) injects a verifier — typically the shared jedi
/// GoTrue + LRU cache — without simgrid taking that dependency. When no verifier
/// is set, `admit` falls back to local HS256 (jwt_secret) or dev-accept.
#[async_trait::async_trait]
pub trait TokenVerifier: Send + Sync {
    /// Verify a raw bearer token. `Ok` yields the identity; `Err` is a short,
    /// client-facing reason.
    async fn verify(&self, token: &str) -> Result<VerifiedUser, String>;
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SupabaseClaims {
    pub sub: String,
    pub exp: i64,
    #[serde(default)]
    pub kbve_username: String,
    #[serde(default)]
    pub role: String,
    #[serde(default, deserialize_with = "aud_string_or_seq")]
    pub aud: String,
}

/// GoTrue emits `aud` as either a string or an array of strings; accept both.
fn aud_string_or_seq<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: serde::Deserializer<'de>,
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum Aud {
        One(String),
        Many(Vec<String>),
    }
    Ok(match Option::<Aud>::deserialize(deserializer)? {
        Some(Aud::One(s)) => s,
        Some(Aud::Many(v)) => v.into_iter().next().unwrap_or_default(),
        None => String::new(),
    })
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
        .map_err(|e| match e.kind() {
            jsonwebtoken::errors::ErrorKind::ExpiredSignature => {
                AuthError::Invalid("session expired".into())
            }
            jsonwebtoken::errors::ErrorKind::InvalidSignature => {
                AuthError::Invalid("token signature invalid".into())
            }
            _ => AuthError::Invalid(e.to_string()),
        })?;
    if data.claims.kbve_username.is_empty() {
        return Err(AuthError::MissingUsername);
    }
    Ok(data.claims)
}
