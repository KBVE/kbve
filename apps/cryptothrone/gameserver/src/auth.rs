//! Local accept-both Supabase token verification (HS256 + ES256/JWKS) via the
//! shared jedi verifier, for the asymmetric-signing transition. Injected into
//! the sim as a `TokenVerifier`; HS256 keeps verifying until GoTrue publishes
//! ES256 in its JWKS. When no JWKS URI is configured the sim falls back to its
//! in-sim HS256 secret.

use std::sync::Arc;

use simgrid::auth::{TokenVerifier, VerifiedUser};

pub struct JwksVerifier {
    inner: jedi::jwks::JwtVerifier,
}

#[async_trait::async_trait]
impl TokenVerifier for JwksVerifier {
    async fn verify(&self, token: &str) -> Result<VerifiedUser, String> {
        if token.is_empty() {
            return Err("missing session token".into());
        }
        let claims: simgrid::auth::SupabaseClaims =
            self.inner.verify(token).map_err(|e| e.to_string())?;
        if claims.kbve_username.is_empty() {
            return Err("token missing kbve_username".into());
        }
        Ok(VerifiedUser {
            sub: claims.sub,
            kbve_username: claims.kbve_username,
        })
    }
}

/// Build the local JWKS verifier from `SUPABASE_JWT_SECRET` (HS256) + a JWKS URI
/// (`SUPABASE_JWKS_URI`, else derived from `SUPABASE_URL`), priming + scheduling
/// the refresh. `None` when no JWKS URI is configured.
pub async fn jwks_verifier() -> Option<Arc<dyn TokenVerifier>> {
    let jwks_uri = std::env::var("SUPABASE_JWKS_URI")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .or_else(|| {
            std::env::var("SUPABASE_URL").ok().and_then(|u| {
                let u = u.trim().trim_end_matches('/');
                (!u.is_empty()).then(|| format!("{u}/auth/v1/.well-known/jwks.json"))
            })
        })?;
    let secret = std::env::var("SUPABASE_JWT_SECRET")
        .ok()
        .filter(|s| !s.is_empty());
    let issuer = std::env::var("SUPABASE_JWT_ISSUER")
        .ok()
        .filter(|s| !s.trim().is_empty());
    let inner =
        jedi::jwks::JwtVerifier::new(jwks_uri, secret.as_deref().map(str::as_bytes), issuer, None);
    inner.start(std::time::Duration::from_secs(300)).await;
    Some(Arc::new(JwksVerifier { inner }))
}
