use crate::db::Pg;
use lru::LruCache;
use std::num::NonZeroUsize;
use std::sync::{Arc, Mutex};
use std::time::Instant;
use uuid::Uuid;

#[derive(Clone)]
pub struct CachedAuth {
    pub user_id: Uuid,
    pub username: String,
    pub role: String,
    pub exp: i64,
}

/// How bearer signatures are confirmed.
/// - `Local`: offline HS256 with `SUPABASE_JWT_SECRET` (prod, where jobboard
///   runs beside Supabase and the secret is injected — no per-request network).
/// - `Remote`: resolve against live Supabase GoTrue `/auth/v1/user` (dev, where
///   the secret isn't available locally).
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum AuthMode {
    Local,
    Remote,
}

pub struct AppState {
    pub db: Pg,
    pub started_at: Instant,
    pub http: reqwest::Client,
    pub supabase_url: String,
    pub kbve_api_url: String,
    pub anon_key: String,
    pub auth_mode: AuthMode,
    pub jwt_secret: Vec<u8>,
    /// Accept-both verifier (HS256 + ES256/JWKS) for the asymmetric-signing
    /// transition, used by Local auth mode. `None` → HS256-only.
    pub verifier: Option<jedi::jwks::JwtVerifier>,
    pub auth_cache: Mutex<LruCache<String, CachedAuth>>,
}

impl AppState {
    pub fn new(db: Pg) -> Arc<Self> {
        let supabase_url = env_url("SUPABASE_URL", "https://supabase.kbve.com");
        let kbve_api_url = env_url("KBVE_API_URL", "https://kbve.com");
        let anon_key = std::env::var("SUPABASE_ANON_KEY").unwrap_or_default();
        let jwt_secret = std::env::var("SUPABASE_JWT_SECRET")
            .unwrap_or_default()
            .into_bytes();
        let auth_mode = match std::env::var("AUTH_MODE").as_deref() {
            Ok("local") => AuthMode::Local,
            _ => AuthMode::Remote,
        };
        let verifier = std::env::var("SUPABASE_JWKS_URI")
            .ok()
            .filter(|s| !s.trim().is_empty())
            .or_else(|| {
                let u = supabase_url.trim().trim_end_matches('/');
                (!u.is_empty()).then(|| format!("{u}/auth/v1/.well-known/jwks.json"))
            })
            .map(|jwks_uri| {
                let issuer = std::env::var("SUPABASE_JWT_ISSUER")
                    .ok()
                    .filter(|s| !s.trim().is_empty());
                let secret = (!jwt_secret.is_empty()).then_some(jwt_secret.as_slice());
                let v = jedi::jwks::JwtVerifier::new(jwks_uri, secret, issuer, None);
                let bg = v.clone();
                tokio::spawn(async move {
                    bg.start(std::time::Duration::from_secs(300)).await;
                });
                v
            });
        Arc::new(Self {
            db,
            started_at: Instant::now(),
            http: reqwest::Client::new(),
            supabase_url,
            kbve_api_url,
            anon_key,
            auth_mode,
            jwt_secret,
            verifier,
            auth_cache: Mutex::new(LruCache::new(NonZeroUsize::new(2048).unwrap())),
        })
    }

    /// Dev mode = remote auth: jobboard validates against live Supabase but
    /// writes to a local DB whose auth.users is empty. Gates the dev-only
    /// user auto-provision and the SPA dev banner. Prod uses local HS256.
    pub fn dev(&self) -> bool {
        matches!(self.auth_mode, AuthMode::Remote)
    }
}

fn env_url(key: &str, default: &str) -> String {
    std::env::var(key)
        .unwrap_or_else(|_| default.to_string())
        .trim_end_matches('/')
        .to_string()
}
