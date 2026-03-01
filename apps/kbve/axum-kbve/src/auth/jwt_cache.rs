// src/auth/jwt_cache.rs
// JWT cache using DashMap for concurrent access
// Verifies tokens against Supabase API and caches valid sessions

use dashmap::DashMap;
use std::sync::{Arc, OnceLock};
use std::time::{Duration, Instant};
use tokio::time;
use tracing::{debug, info, warn};

const MAX_CACHE_SIZE: usize = 10_000;
const CLEANUP_INTERVAL: Duration = Duration::from_secs(60);
#[allow(dead_code)]
const TOKEN_GRACE_PERIOD: i64 = 300; // 5 minutes grace before expiry

/// Cached token information
#[derive(Debug, Clone)]
pub struct TokenInfo {
    pub user_id: String,
    pub email: Option<String>,
    pub role: String,
    pub expires_at: i64,
    pub verified_at: Instant,
}

impl TokenInfo {
    pub fn is_expired(&self) -> bool {
        let now = chrono::Utc::now().timestamp();
        now >= self.expires_at
    }

    #[allow(dead_code)]
    pub fn is_near_expiry(&self) -> bool {
        let now = chrono::Utc::now().timestamp();
        (self.expires_at - now) <= TOKEN_GRACE_PERIOD
    }
}

/// JWT cache with Supabase verification
#[derive(Clone)]
pub struct JwtCache {
    tokens: Arc<DashMap<String, TokenInfo>>,
    supabase_url: String,
    supabase_anon_key: String,
    http_client: reqwest::Client,
}

impl JwtCache {
    pub fn new(supabase_url: String, supabase_anon_key: String) -> Self {
        info!("Initializing JWT cache with Supabase URL: {}", supabase_url);
        Self {
            tokens: Arc::new(DashMap::new()),
            supabase_url,
            supabase_anon_key,
            http_client: reqwest::Client::builder()
                .timeout(Duration::from_secs(5))
                .build()
                .expect("Failed to create HTTP client"),
        }
    }

    /// Get a token from cache if valid
    pub fn get(&self, token: &str) -> Option<TokenInfo> {
        if let Some(entry) = self.tokens.get(token) {
            let info = entry.value().clone();
            if !info.is_expired() {
                debug!(
                    user_id = %info.user_id,
                    expires_in = %(info.expires_at - chrono::Utc::now().timestamp()),
                    "JWT cache hit"
                );
                return Some(info);
            } else {
                debug!(user_id = %info.user_id, "JWT cache hit but token expired");
                drop(entry);
                self.tokens.remove(token);
            }
        }
        debug!("JWT cache miss");
        None
    }

    /// Verify token and cache the result
    pub async fn verify_and_cache(&self, token: &str) -> Result<TokenInfo, JwtCacheError> {
        // Fast path: check cache first
        if let Some(info) = self.get(token) {
            return Ok(info);
        }

        // Slow path: verify with Supabase API
        info!(
            cache_size = self.tokens.len(),
            "JWT cache miss, verifying with Supabase API"
        );

        let api_start = Instant::now();
        let token_info = self.verify_with_supabase(token).await?;
        let api_duration = api_start.elapsed();

        // Cache the verified token
        self.insert(token.to_string(), token_info.clone());

        info!(
            user_id = %token_info.user_id,
            supabase_api_ms = %api_duration.as_millis(),
            "JWT verified via Supabase API and cached"
        );

        Ok(token_info)
    }

    /// Verify token by calling Supabase /auth/v1/user endpoint
    async fn verify_with_supabase(&self, token: &str) -> Result<TokenInfo, JwtCacheError> {
        let url = format!("{}/auth/v1/user", self.supabase_url);

        let response = self
            .http_client
            .get(&url)
            .header("apikey", &self.supabase_anon_key)
            .bearer_auth(token)
            .send()
            .await
            .map_err(|e| {
                warn!(error = %e, "Failed to call Supabase API");
                JwtCacheError::SupabaseApiError(e.to_string())
            })?;

        let status = response.status();

        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            warn!(status = %status, body = %body, "Supabase API returned error");

            if body.contains("session_not_found") {
                return Err(JwtCacheError::SessionNotFound);
            }
            if body.contains("token is expired") || body.contains("jwt expired") {
                return Err(JwtCacheError::TokenExpired);
            }

            return Err(JwtCacheError::InvalidToken(format!(
                "Status: {}, Body: {}",
                status, body
            )));
        }

        let user_data: serde_json::Value = response
            .json()
            .await
            .map_err(|e| JwtCacheError::InvalidResponse(e.to_string()))?;

        // Extract user info
        let user_id = user_data["id"]
            .as_str()
            .ok_or_else(|| JwtCacheError::InvalidResponse("Missing user id".to_string()))?
            .to_string();

        let email = user_data["email"].as_str().map(|s| s.to_string());
        let role = user_data["role"]
            .as_str()
            .unwrap_or("authenticated")
            .to_string();

        // Parse JWT to get expiry (without signature validation since Supabase verified it)
        let token_data = jsonwebtoken::dangerous::insecure_decode::<serde_json::Value>(token)
            .map_err(|e| JwtCacheError::InvalidToken(e.to_string()))?;

        let expires_at = token_data.claims["exp"]
            .as_i64()
            .ok_or_else(|| JwtCacheError::InvalidToken("Missing exp claim".to_string()))?;

        info!(
            user_id = %user_id,
            email = ?email,
            role = %role,
            expires_in_seconds = %(expires_at - chrono::Utc::now().timestamp()),
            "JWT verified successfully"
        );

        Ok(TokenInfo {
            user_id,
            email,
            role,
            expires_at,
            verified_at: Instant::now(),
        })
    }

    /// Insert token into cache
    fn insert(&self, token: String, info: TokenInfo) {
        if self.tokens.len() >= MAX_CACHE_SIZE {
            warn!(
                current_size = self.tokens.len(),
                "JWT cache at max size, evicting oldest entries"
            );
            self.evict_oldest(MAX_CACHE_SIZE / 10);
        }
        self.tokens.insert(token, info);
    }

    /// Evict oldest N entries (LRU)
    fn evict_oldest(&self, count: usize) {
        use rayon::prelude::*;

        let mut entries: Vec<_> = self
            .tokens
            .par_iter()
            .map(|entry| (entry.key().clone(), entry.value().verified_at))
            .collect();

        entries.sort_by_key(|(_, verified_at)| *verified_at);

        let removed: usize = entries
            .into_par_iter()
            .take(count)
            .map(|(token, _)| {
                if self.tokens.remove(&token).is_some() {
                    1
                } else {
                    0
                }
            })
            .sum();

        info!(removed = removed, "Evicted oldest JWT cache entries");
    }

    /// Remove expired tokens
    fn cleanup_expired(&self) {
        use rayon::prelude::*;

        let now = chrono::Utc::now().timestamp();

        let expired_tokens: Vec<String> = self
            .tokens
            .par_iter()
            .filter_map(|entry| {
                if entry.value().expires_at <= now {
                    Some(entry.key().clone())
                } else {
                    None
                }
            })
            .collect();

        let removed = expired_tokens.len();
        for token in expired_tokens {
            self.tokens.remove(&token);
        }

        if removed > 0 {
            info!(removed = removed, "Cleaned up expired JWT cache entries");
        }
    }

    /// Get current cache size
    #[allow(dead_code)]
    pub fn size(&self) -> usize {
        self.tokens.len()
    }

    /// Run the cache cleanup task (spawn in tokio)
    pub async fn run_cleanup_task(self) {
        info!("Starting JWT cache cleanup task");
        let mut interval = time::interval(CLEANUP_INTERVAL);

        loop {
            interval.tick().await;
            self.cleanup_expired();

            if self.tokens.len() > MAX_CACHE_SIZE {
                self.evict_oldest(self.tokens.len() - MAX_CACHE_SIZE);
            }

            debug!(cache_size = self.tokens.len(), "JWT cache cleanup tick");
        }
    }
}

/// JWT cache errors
#[derive(Debug, thiserror::Error)]
pub enum JwtCacheError {
    #[error("Supabase API error: {0}")]
    SupabaseApiError(String),

    #[error("Invalid token: {0}")]
    InvalidToken(String),

    #[error("Invalid response from Supabase: {0}")]
    InvalidResponse(String),

    #[error("Session not found - user must re-authenticate")]
    SessionNotFound,

    #[error("Token expired")]
    TokenExpired,
}

// Global JWT cache singleton
static JWT_CACHE: OnceLock<JwtCache> = OnceLock::new();

/// Initialize the global JWT cache
pub fn init_jwt_cache(supabase_url: String, supabase_anon_key: String) -> JwtCache {
    JWT_CACHE
        .get_or_init(|| JwtCache::new(supabase_url, supabase_anon_key))
        .clone()
}

/// Get the global JWT cache
pub fn get_jwt_cache() -> Option<JwtCache> {
    JWT_CACHE.get().cloned()
}
