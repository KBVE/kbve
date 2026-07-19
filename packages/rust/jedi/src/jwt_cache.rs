//! Shared Supabase JWT verification + LRU cache.
//!
//! Verifies a session JWT against GoTrue's `/auth/v1/user` (no local
//! `SUPABASE_JWT_SECRET` needed) and caches the result keyed by the raw token, so
//! the network hop happens once per token until it expires. Lifted out of
//! axum-kbve so any service (the axum gateway, the arpg game server) shares one
//! implementation. Staff permissions are pulled from a PostgREST RPC.

use dashmap::DashMap;
use dashmap::mapref::entry::Entry;
use std::sync::{Arc, OnceLock};
use std::time::{Duration, Instant};
use tokio::sync::Notify;
use tokio::time;
use tracing::{debug, info, warn};

const MAX_CACHE_SIZE: usize = 10_000;
const CLEANUP_INTERVAL: Duration = Duration::from_secs(60);
const TOKEN_GRACE_PERIOD: i64 = 300;

/// Staff permission bitflags — mirrors kbve.staff.StaffPermission proto enum.
#[allow(dead_code)]
pub mod staff_perm {
    pub const STAFF: i32 = 0x0000_0001;
    pub const MODERATOR: i32 = 0x0000_0002;
    pub const ADMIN: i32 = 0x0000_0004;
    pub const DASHBOARD_VIEW: i32 = 0x0000_0100;
    pub const DASHBOARD_MANAGE: i32 = 0x0000_0200;
    pub const USER_VIEW: i32 = 0x0000_0400;
    pub const USER_MANAGE: i32 = 0x0000_0800;
    pub const CONTENT_MODERATE: i32 = 0x0000_1000;
    pub const CONTENT_DELETE: i32 = 0x0000_2000;
    pub const STAFF_GRANT: i32 = 0x0001_0000;
    pub const STAFF_REVOKE: i32 = 0x0002_0000;
    pub const SYSTEM_CONFIG: i32 = 0x0004_0000;
    pub const AUDIT_VIEW: i32 = 0x0008_0000;
    pub const SUPERADMIN: i32 = 0x4000_0000;
}

/// Cached, verified token claims.
#[derive(Debug, Clone)]
pub struct TokenInfo {
    pub user_id: String,
    pub kbve_username: String,
    pub email: Option<String>,
    pub role: String,
    pub staff_permissions: i32,
    pub expires_at: i64,
    pub verified_at: Instant,
}

impl TokenInfo {
    pub fn is_expired(&self) -> bool {
        chrono::Utc::now().timestamp() >= self.expires_at
    }

    pub fn is_near_expiry(&self) -> bool {
        (self.expires_at - chrono::Utc::now().timestamp()) <= TOKEN_GRACE_PERIOD
    }

    /// Any staff permission set.
    pub fn is_staff(&self) -> bool {
        self.staff_permissions > 0
    }

    /// Holds a specific permission flag (or is superadmin).
    pub fn has_permission(&self, flag: i32) -> bool {
        if self.staff_permissions & staff_perm::SUPERADMIN != 0 {
            return true;
        }
        self.staff_permissions & flag != 0
    }
}

/// JWT verification cache backed by GoTrue + a token-keyed DashMap.
#[derive(Clone)]
pub struct JwtCache {
    /// Verified tokens keyed by the raw JWT. Stored behind `Arc` so a cache hit
    /// clones a refcount, not the whole `TokenInfo` (several owned `String`s).
    tokens: Arc<DashMap<String, Arc<TokenInfo>>>,
    /// Tokens currently being verified against GoTrue. Lets concurrent cold
    /// requests for the same token wait on one round-trip (single-flight)
    /// instead of each stampeding Supabase.
    inflight: Arc<DashMap<String, Arc<Notify>>>,
    supabase_url: String,
    supabase_anon_key: String,
    http_client: reqwest::Client,
}

impl JwtCache {
    pub fn new(supabase_url: String, supabase_anon_key: String) -> Self {
        info!(url = %supabase_url, "initializing JWT cache");
        Self {
            tokens: Arc::new(DashMap::new()),
            inflight: Arc::new(DashMap::new()),
            supabase_url,
            supabase_anon_key,
            http_client: reqwest::Client::builder()
                .timeout(Duration::from_secs(5))
                .build()
                .expect("failed to create HTTP client"),
        }
    }

    /// Return a cached, non-expired token if present.
    pub fn get(&self, token: &str) -> Option<Arc<TokenInfo>> {
        if let Some(entry) = self.tokens.get(token) {
            let info = entry.value().clone();
            if !info.is_expired() {
                return Some(info);
            }
            drop(entry);
            self.tokens.remove(token);
        }
        None
    }

    /// Cache hit returns immediately; a miss verifies with GoTrue then caches.
    /// Concurrent misses for the same token are coalesced into one round-trip.
    pub async fn verify_and_cache(&self, token: &str) -> Result<Arc<TokenInfo>, JwtCacheError> {
        if let Some(info) = self.get(token) {
            return Ok(info);
        }

        // Single-flight: the first caller for a cold token becomes the leader and
        // does the GoTrue round-trip; concurrent callers wait for it, then read
        // the cache. A missed wake-up (or a leader error) just re-loops — the
        // waiter re-checks the cache and may become the next leader itself.
        let notify = loop {
            if let Some(info) = self.get(token) {
                return Ok(info);
            }
            match self.inflight.entry(token.to_string()) {
                Entry::Vacant(e) => {
                    let n = Arc::new(Notify::new());
                    e.insert(n.clone());
                    break n;
                }
                Entry::Occupied(e) => {
                    let n = e.get().clone();
                    drop(e);
                    // Bounded so a missed notification can never hang the caller;
                    // the upstream http_client timeout is 5s.
                    let _ = time::timeout(Duration::from_secs(6), n.notified()).await;
                }
            }
        };

        let api_start = Instant::now();
        let result = self.verify_with_supabase(token).await.map(Arc::new);
        if let Ok(ref token_info) = result {
            self.insert(token.to_string(), token_info.clone());
            info!(
                user_id = %token_info.user_id,
                username = %token_info.kbve_username,
                supabase_api_ms = %api_start.elapsed().as_millis(),
                "JWT verified via Supabase API and cached"
            );
        }
        self.inflight.remove(token);
        notify.notify_waiters();
        result
    }

    async fn verify_with_supabase(&self, token: &str) -> Result<TokenInfo, JwtCacheError> {
        // Decode `exp` locally first — an already-expired token is rejected
        // without touching the network.
        let claims = decode_jwt_claims(token).unwrap_or_default();
        let expires_at = claims["exp"]
            .as_i64()
            .ok_or_else(|| JwtCacheError::InvalidToken("missing exp claim".into()))?;
        if chrono::Utc::now().timestamp() >= expires_at {
            return Err(JwtCacheError::TokenExpired);
        }

        // User verification and staff-permission lookup are independent GoTrue /
        // PostgREST calls — run them concurrently, then discard the perms result
        // if user verification failed.
        let (user_res, staff_permissions) =
            tokio::join!(self.fetch_user(token), self.fetch_staff_permissions(token));
        let user_data = user_res?;

        let user_id = user_data["id"]
            .as_str()
            .ok_or_else(|| JwtCacheError::InvalidResponse("missing user id".into()))?
            .to_string();
        let email = user_data["email"].as_str().map(|s| s.to_string());
        let role = user_data["role"]
            .as_str()
            .unwrap_or("authenticated")
            .to_string();

        // The canonical KBVE username rides the GoTrue user_metadata (set by the
        // custom access-token hook); fall back to the JWT claim, then the user id.
        let kbve_username = user_data["user_metadata"]["kbve_username"]
            .as_str()
            .or_else(|| claims["kbve_username"].as_str())
            .map(|s| s.to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| user_id.clone());

        Ok(TokenInfo {
            user_id,
            kbve_username,
            email,
            role,
            staff_permissions,
            expires_at,
            verified_at: Instant::now(),
        })
    }

    /// GoTrue `/auth/v1/user` verification; returns the parsed user object.
    async fn fetch_user(&self, token: &str) -> Result<serde_json::Value, JwtCacheError> {
        let url = format!("{}/auth/v1/user", self.supabase_url);
        let response = self
            .http_client
            .get(&url)
            .header("apikey", &self.supabase_anon_key)
            .bearer_auth(token)
            .send()
            .await
            .map_err(|e| {
                warn!(error = %e, "failed to call Supabase API");
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
                "Status: {status}, Body: {body}"
            )));
        }

        response
            .json()
            .await
            .map_err(|e| JwtCacheError::InvalidResponse(e.to_string()))
    }

    /// Staff permission bitmask via PostgREST RPC; 0 on any error.
    async fn fetch_staff_permissions(&self, token: &str) -> i32 {
        let url = format!("{}/rest/v1/rpc/staff_permissions", self.supabase_url);
        let response = self
            .http_client
            .post(&url)
            .header("apikey", &self.supabase_anon_key)
            .header("Content-Type", "application/json")
            .bearer_auth(token)
            .body("{}")
            .send()
            .await;
        match response {
            Ok(resp) if resp.status().is_success() => resp
                .text()
                .await
                .ok()
                .and_then(|b| b.trim().parse::<i32>().ok())
                .unwrap_or(0),
            _ => 0,
        }
    }

    fn insert(&self, token: String, info: Arc<TokenInfo>) {
        if self.tokens.len() >= MAX_CACHE_SIZE {
            self.evict_oldest(MAX_CACHE_SIZE / 10);
        }
        self.tokens.insert(token, info);
    }

    /// Evict the oldest N entries (LRU by verification time).
    fn evict_oldest(&self, count: usize) {
        let mut entries: Vec<_> = self
            .tokens
            .iter()
            .map(|e| (e.key().clone(), e.value().verified_at))
            .collect();
        entries.sort_by_key(|(_, verified_at)| *verified_at);
        let mut removed = 0;
        for (token, _) in entries.into_iter().take(count) {
            if self.tokens.remove(&token).is_some() {
                removed += 1;
            }
        }
        info!(removed, "evicted oldest JWT cache entries");
    }

    fn cleanup_expired(&self) {
        let now = chrono::Utc::now().timestamp();
        let expired: Vec<String> = self
            .tokens
            .iter()
            .filter(|e| e.value().expires_at <= now)
            .map(|e| e.key().clone())
            .collect();
        let removed = expired.len();
        for token in expired {
            self.tokens.remove(&token);
        }
        if removed > 0 {
            info!(removed, "cleaned up expired JWT cache entries");
        }
    }

    pub fn size(&self) -> usize {
        self.tokens.len()
    }

    /// Periodic cleanup; spawn in tokio.
    pub async fn run_cleanup_task(self) {
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

/// Decode a JWT's claims payload WITHOUT verifying the signature — only safe
/// after GoTrue has authenticated the token; used to read `exp` / `kbve_username`.
fn decode_jwt_claims(token: &str) -> Option<serde_json::Value> {
    let payload = token.split('.').nth(1)?;
    let bytes = base64_url_decode(payload)?;
    serde_json::from_slice(&bytes).ok()
}

/// Minimal base64url (no padding) decoder for JWT segments.
fn base64_url_decode(input: &str) -> Option<Vec<u8>> {
    const fn val(c: u8) -> Option<u8> {
        match c {
            b'A'..=b'Z' => Some(c - b'A'),
            b'a'..=b'z' => Some(c - b'a' + 26),
            b'0'..=b'9' => Some(c - b'0' + 52),
            b'-' => Some(62),
            b'_' => Some(63),
            _ => None,
        }
    }
    let mut out = Vec::with_capacity(input.len() * 3 / 4);
    let mut buf = 0u32;
    let mut bits = 0u32;
    for &c in input.as_bytes() {
        let v = val(c)? as u32;
        buf = (buf << 6) | v;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8);
        }
    }
    Some(out)
}

/// JWT cache errors.
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

static JWT_CACHE: OnceLock<JwtCache> = OnceLock::new();

/// Initialize the global JWT cache (idempotent).
pub fn init_jwt_cache(supabase_url: String, supabase_anon_key: String) -> JwtCache {
    JWT_CACHE
        .get_or_init(|| JwtCache::new(supabase_url, supabase_anon_key))
        .clone()
}

/// Get the global JWT cache if initialized.
pub fn get_jwt_cache() -> Option<JwtCache> {
    JWT_CACHE.get().cloned()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn token_with_perms(perms: i32) -> TokenInfo {
        TokenInfo {
            user_id: "00000000-0000-0000-0000-000000000001".into(),
            kbve_username: "tester".into(),
            email: Some("mock@kbve.com".into()),
            role: "authenticated".into(),
            staff_permissions: perms,
            expires_at: chrono::Utc::now().timestamp() + 3600,
            verified_at: Instant::now(),
        }
    }

    #[test]
    fn non_staff_denied_dashboard() {
        let info = token_with_perms(0);
        assert!(!info.has_permission(staff_perm::DASHBOARD_VIEW));
        assert!(!info.is_staff());
    }

    #[test]
    fn permission_is_flag_scoped() {
        let info = token_with_perms(staff_perm::DASHBOARD_VIEW);
        assert!(info.has_permission(staff_perm::DASHBOARD_VIEW));
        assert!(!info.has_permission(staff_perm::DASHBOARD_MANAGE));
        assert!(info.is_staff());
    }

    #[test]
    fn superadmin_implies_all() {
        let info = token_with_perms(staff_perm::SUPERADMIN);
        assert!(info.has_permission(staff_perm::USER_MANAGE));
        assert!(info.has_permission(staff_perm::SYSTEM_CONFIG));
    }

    #[test]
    fn expiry_uses_clock() {
        let mut info = token_with_perms(0);
        info.expires_at = chrono::Utc::now().timestamp() - 1;
        assert!(info.is_expired());
        info.expires_at = chrono::Utc::now().timestamp() + 60;
        assert!(!info.is_expired());
    }

    #[test]
    fn base64url_decodes_jwt_segment() {
        // {"exp":123,"kbve_username":"al"} base64url, no padding
        let claims = decode_jwt_claims("h.eyJleHAiOjEyMywia2J2ZV91c2VybmFtZSI6ImFsIn0.s").unwrap();
        assert_eq!(claims["exp"].as_i64(), Some(123));
        assert_eq!(claims["kbve_username"].as_str(), Some("al"));
    }

    // exp=123 (1970) is long past, so verify_with_supabase must reject it via the
    // local pre-check before any network call. The unroutable upstream means this
    // test would error with SupabaseApiError (or stall) if the pre-check regressed.
    #[tokio::test]
    async fn expired_token_short_circuits_without_network() {
        let cache = JwtCache::new("http://127.0.0.1:9/unused".into(), "anon".into());
        let token = "h.eyJleHAiOjEyMywia2J2ZV91c2VybmFtZSI6ImFsIn0.s";
        let err = cache.verify_and_cache(token).await.unwrap_err();
        assert!(matches!(err, JwtCacheError::TokenExpired));
        assert_eq!(cache.size(), 0);
    }
}
