//! Supabase GoTrue token verification for the arpg server, backed by the shared
//! jedi JWT cache. Lets a local/dev server authenticate real session JWTs without
//! holding `SUPABASE_JWT_SECRET` — it verifies against GoTrue's `/auth/v1/user`
//! and caches the result (LRU) so the network hop happens once per token.

use std::sync::Arc;

use jedi::jwt_cache::{JwtCache, init_jwt_cache};
use simgrid::auth::{TokenVerifier, VerifiedUser};

pub struct GotrueVerifier {
    cache: JwtCache,
}

#[async_trait::async_trait]
impl TokenVerifier for GotrueVerifier {
    async fn verify(&self, token: &str) -> Result<VerifiedUser, String> {
        if token.is_empty() {
            return Err("missing session token".into());
        }
        let info = self
            .cache
            .verify_and_cache(token)
            .await
            .map_err(|e| e.to_string())?;
        Ok(VerifiedUser {
            sub: info.user_id.clone(),
            kbve_username: info.kbve_username.clone(),
        })
    }
}

/// Build a GoTrue verifier from `SUPABASE_URL` + `SUPABASE_ANON_KEY` if both are
/// set. Returns `None` when unconfigured so the caller falls back to the local
/// HS256 secret (or dev-accept). Also spawns the cache's expiry cleanup task.
pub fn gotrue_verifier() -> Option<Arc<dyn TokenVerifier>> {
    let url = std::env::var("SUPABASE_URL")
        .ok()
        .filter(|s| !s.is_empty())?;
    let anon = std::env::var("SUPABASE_ANON_KEY")
        .ok()
        .filter(|s| !s.is_empty())?;
    let cache = init_jwt_cache(url, anon);
    tokio::spawn(cache.clone().run_cleanup_task());
    Some(Arc::new(GotrueVerifier { cache }))
}

/// Local accept-both verifier (HS256 + ES256/JWKS) for the asymmetric-signing
/// transition — one shared jedi path, no per-token network hop. HS256 keeps
/// verifying until GoTrue publishes ES256 in its JWKS.
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
/// the JWKS refresh. `None` when no JWKS URI is configured (caller then tries the
/// GoTrue-API verifier or the in-sim HS256 fallback).
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
    if secret.is_none() {
        tracing::warn!(
            "SUPABASE_JWT_SECRET unset — JWKS verifier cannot check the HS256 tokens GoTrue still issues; deferring to the GoTrue-API verifier"
        );
        return None;
    }
    let issuer = std::env::var("SUPABASE_JWT_ISSUER")
        .ok()
        .filter(|s| !s.trim().is_empty());
    let inner =
        jedi::jwks::JwtVerifier::new(jwks_uri, secret.as_deref().map(str::as_bytes), issuer, None);
    inner.start(std::time::Duration::from_secs(300)).await;
    Some(Arc::new(JwksVerifier { inner }))
}
