use jsonwebtoken::{Algorithm, DecodingKey, Validation};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone)]
pub struct SupabaseConfig {
    pub jwt_secret: Option<String>,
    pub url: Option<String>,
    /// Argon2 hash of the service role key (never plaintext).
    pub service_key_hash: Option<String>,
    /// Accept-both verifier (HS256 + ES256/JWKS) for the asymmetric-signing
    /// transition. `None` → HS256-only via the local secret.
    pub verifier: Option<jedi::jwks::JwtVerifier>,
}

impl SupabaseConfig {
    /// All fields stay optional so ROWS still boots without Supabase (legacy mode).
    pub fn from_env() -> Self {
        let jwt_secret = std::env::var("SUPABASE_JWT_SECRET").ok();
        let url = std::env::var("SUPABASE_URL").ok();
        let verifier = std::env::var("SUPABASE_JWKS_URI")
            .ok()
            .filter(|s| !s.trim().is_empty())
            .or_else(|| {
                url.as_deref().map(str::trim).and_then(|u| {
                    let u = u.trim_end_matches('/');
                    (!u.is_empty()).then(|| format!("{u}/auth/v1/.well-known/jwks.json"))
                })
            })
            .map(|jwks_uri| {
                let issuer = std::env::var("SUPABASE_JWT_ISSUER")
                    .ok()
                    .filter(|s| !s.trim().is_empty());
                let secret = jwt_secret.as_deref().map(str::as_bytes);
                let v = jedi::jwks::JwtVerifier::new(jwks_uri, secret, issuer, None);
                let bg = v.clone();
                tokio::spawn(async move {
                    bg.start(std::time::Duration::from_secs(300)).await;
                });
                v
            });
        Self {
            jwt_secret,
            url,
            service_key_hash: std::env::var("SUPABASE_SERVICE_KEY_HASH").ok(),
            verifier,
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
    let claims: SupabaseClaims = match &config.verifier {
        Some(v) => v
            .verify::<SupabaseClaims>(token)
            .map_err(|e| JwtError::Invalid(e.to_string()))?,
        None => {
            let secret = config.jwt_secret.as_ref().ok_or(JwtError::NotConfigured)?;
            let mut validation = Validation::new(Algorithm::HS256);
            // Supabase tokens carry aud="authenticated", but ROWS authorizes on
            // role/customer_guid, not audience — leave aud validation off.
            validation.validate_aud = false;
            let key = DecodingKey::from_secret(secret.as_bytes());
            jsonwebtoken::decode::<SupabaseClaims>(token, &key, &validation)
                .map_err(|e| JwtError::Invalid(e.to_string()))?
                .claims
        }
    };

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

/// Verifies a presented service key against the stored argon2 hash (`SUPABASE_SERVICE_KEY_HASH`).
/// Used for trusted server-to-server callers (e.g. the UE dedicated server) that have no player
/// JWT. argon2 verification is constant-time, defeating timing attacks.
pub fn validate_service_key(key: &str, config: &SupabaseConfig) -> Result<(), JwtError> {
    use argon2::{Argon2, PasswordHash, PasswordVerifier};

    let hash = config
        .service_key_hash
        .as_ref()
        .ok_or(JwtError::NotConfigured)?;

    let parsed = PasswordHash::new(hash).map_err(|_| JwtError::InvalidServiceKey)?;
    Argon2::default()
        .verify_password(key.as_bytes(), &parsed)
        .map_err(|_| JwtError::InvalidServiceKey)?;
    Ok(())
}

#[derive(Debug, thiserror::Error)]
pub enum JwtError {
    #[error("JWT validation not configured (SUPABASE_JWT_SECRET not set)")]
    NotConfigured,
    #[error("Invalid JWT: {0}")]
    Invalid(String),
    #[error("Invalid service key")]
    InvalidServiceKey,
}

#[cfg(test)]
mod tests {
    use super::*;
    use jsonwebtoken::{EncodingKey, Header, encode};

    fn config(secret: &str) -> SupabaseConfig {
        SupabaseConfig {
            jwt_secret: Some(secret.to_string()),
            url: None,
            service_key_hash: None,
            verifier: None,
        }
    }

    fn sign(secret: &str, claims: &SupabaseClaims) -> String {
        encode(
            &Header::new(Algorithm::HS256),
            claims,
            &EncodingKey::from_secret(secret.as_bytes()),
        )
        .expect("signing an HS256 token should succeed")
    }

    fn sample_claims() -> SupabaseClaims {
        SupabaseClaims {
            sub: "cc274223-6acc-4a2e-9bb4-09eebffb83cb".into(),
            aud: "authenticated".into(),
            role: "authenticated".into(),
            iat: 0,
            // Year 2286 — keeps the default `exp` validation happy without wall-clock flakiness.
            exp: 9_999_999_999,
            email: Some("player@example.com".into()),
            app_metadata: Some(AppMetadata {
                customer_guid: Some("cc274223-6acc-4a2e-9bb4-09eebffb83cb".into()),
                is_admin: Some(true),
            }),
        }
    }

    /// Regression for #12660: verifying a real HS256 token must NOT panic.
    /// Before the `rust_crypto` feature was enabled, no crypto provider was compiled
    /// in and `jsonwebtoken`'s verifier_factory panicked the tokio worker → 503.
    #[test]
    fn hs256_token_verifies_against_matching_secret() {
        let secret = "super-secret-gotrue-hs256-key";
        let token = sign(secret, &sample_claims());

        let user = validate_jwt(&token, &config(secret)).expect("valid token should verify");

        assert_eq!(
            user.user_id.to_string(),
            "cc274223-6acc-4a2e-9bb4-09eebffb83cb"
        );
        assert_eq!(user.role, "authenticated");
        assert_eq!(user.email.as_deref(), Some("player@example.com"));
        assert!(user.is_admin);
    }

    /// A token signed with a different secret must return an auth error, not panic.
    #[test]
    fn wrong_secret_returns_error_not_panic() {
        let token = sign("the-real-secret", &sample_claims());

        let result = validate_jwt(&token, &config("a-different-secret"));

        assert!(matches!(result, Err(JwtError::Invalid(_))));
    }
}
