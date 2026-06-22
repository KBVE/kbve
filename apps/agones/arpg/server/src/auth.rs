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
            sub: info.user_id,
            kbve_username: info.kbve_username,
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
