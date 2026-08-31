use std::num::NonZeroUsize;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use jsonwebtoken::{
    Algorithm, DecodingKey, EncodingKey, Header, TokenData, Validation, decode, encode,
};
use lru::LruCache;
use reqwest::Client;
use serde::{Deserialize, Serialize};

pub const SB_ACCESS_TOKEN_COOKIE: &str = "sb-access-token";
pub const GATE_SESSION_COOKIE: &str = "kbve_gate";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub exp: i64,
    #[serde(default)]
    pub iss: String,
    #[serde(default)]
    pub role: String,
    pub email: Option<String>,
    #[serde(default)]
    pub kbve_username: Option<String>,
}

#[derive(Debug)]
pub enum AuthError {
    MissingToken,
    InvalidToken(String),
    TokenExpired,
    NotStaff,
    Upstream(String),
}

impl std::fmt::Display for AuthError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AuthError::MissingToken => write!(f, "missing authentication token"),
            AuthError::InvalidToken(m) => write!(f, "invalid token: {m}"),
            AuthError::TokenExpired => write!(f, "token expired"),
            AuthError::NotStaff => write!(f, "not staff"),
            AuthError::Upstream(m) => write!(f, "authz backend: {m}"),
        }
    }
}

impl std::error::Error for AuthError {}

/// Validate a Supabase HS256 JWT. Issuer pinned when `SUPABASE_JWT_ISSUER` set.
pub fn validate_token(token: &str, secret: &str) -> Result<TokenData<Claims>, AuthError> {
    let key = DecodingKey::from_secret(secret.as_bytes());
    let mut validation = Validation::new(Algorithm::HS256);
    validation.validate_exp = true;
    validation.validate_aud = false;

    if let Ok(issuer) = std::env::var("SUPABASE_JWT_ISSUER") {
        if !issuer.trim().is_empty() {
            validation.set_issuer(&[issuer]);
        }
    }

    decode::<Claims>(token, &key, &validation).map_err(|e| match e.kind() {
        jsonwebtoken::errors::ErrorKind::ExpiredSignature => AuthError::TokenExpired,
        _ => AuthError::InvalidToken(e.to_string()),
    })
}

/// Pull a token from `Authorization: Bearer`, then the `sb-access-token` /
/// `kbve_gate` cookies, then a `?access_token=` query param.
pub fn extract_token(
    auth_header: Option<&str>,
    cookie_header: Option<&str>,
    query: Option<&str>,
) -> Option<String> {
    if let Some(h) = auth_header {
        if let Some(t) = h
            .strip_prefix("Bearer ")
            .or_else(|| h.strip_prefix("bearer "))
        {
            let t = t.trim();
            if !t.is_empty() {
                return Some(t.to_string());
            }
        }
    }

    if let Some(c) = cookie_header {
        for name in [SB_ACCESS_TOKEN_COOKIE, GATE_SESSION_COOKIE] {
            if let Some(v) = cookie_value(c, name) {
                let v = v.trim();
                if !v.is_empty() {
                    return Some(v.to_string());
                }
            }
        }
    }

    if let Some(q) = query {
        if let Some(v) = query_param(q, "access_token") {
            if !v.is_empty() {
                return Some(v);
            }
        }
    }

    None
}

/// Read the `access_token` query param — the token delivered by the post-login
/// bounce, which the gate converts into a session cookie.
pub fn access_token_in_query(query: &str) -> Option<String> {
    query_param(query, "access_token").filter(|v| !v.is_empty())
}

fn cookie_value<'a>(cookie_header: &'a str, name: &str) -> Option<&'a str> {
    for pair in cookie_header.split(';') {
        let pair = pair.trim();
        if let Some((k, v)) = pair.split_once('=') {
            if k == name {
                return Some(v);
            }
        }
    }
    None
}

fn query_param(query: &str, key: &str) -> Option<String> {
    for pair in query.split('&') {
        if let Some((k, v)) = pair.split_once('=') {
            if k == key {
                return Some(v.to_string());
            }
        }
    }
    None
}

/// Authorization policy applied after the JWT validates.
#[derive(Debug, Clone)]
pub enum Authz {
    /// Any valid Supabase JWT passes.
    JwtOnly,
    /// `staff.is_staff(sub)` must return true (via Supabase RPC).
    IsStaff,
}

impl Authz {
    pub fn from_env(raw: &str) -> Self {
        match raw.trim().to_ascii_lowercase().as_str() {
            "jwt" | "jwt-only" | "jwt_only" => Authz::JwtOnly,
            _ => Authz::IsStaff,
        }
    }
}

#[derive(Serialize)]
struct ServiceClaims {
    role: &'static str,
    iss: &'static str,
    iat: u64,
    exp: u64,
}

/// Calls `is_staff(p_user_id)` on Supabase and caches the boolean per `sub`.
///
/// The PostgREST `Authorization` bearer is a `service_role` JWT minted at
/// runtime from the cluster JWT secret — the stored `supabase-jwt.service-key`
/// is stale-signed and rejected, so we sign our own short-lived token instead.
pub struct StaffGate {
    client: Client,
    rpc_url: String,
    jwt_secret: String,
    apikey: Option<String>,
    schema: String,
    ttl_secs: u64,
    cache: Mutex<LruCache<String, (bool, u64)>>,
    service_token: Mutex<Option<(String, u64)>>,
}

const STAFF_CACHE_CAP: usize = 4096;

impl StaffGate {
    pub fn new(
        supabase_url: &str,
        jwt_secret: String,
        apikey: Option<String>,
        schema: String,
        rpc: &str,
        ttl_secs: u64,
    ) -> Self {
        let base = supabase_url.trim_end_matches('/');
        let rpc = rpc.trim_matches('/');
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(8))
            .build()
            .unwrap_or_else(|_| Client::new());
        Self {
            client,
            rpc_url: format!("{base}/rest/v1/rpc/{rpc}"),
            jwt_secret,
            apikey,
            schema,
            ttl_secs,
            cache: Mutex::new(LruCache::new(
                NonZeroUsize::new(STAFF_CACHE_CAP).expect("cache cap nonzero"),
            )),
            service_token: Mutex::new(None),
        }
    }

    fn now() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0)
    }

    /// Mint (and cache, re-minting before expiry) a `service_role` bearer.
    fn service_bearer(&self) -> Result<String, AuthError> {
        let now = Self::now();
        if let Ok(guard) = self.service_token.lock() {
            if let Some((tok, exp)) = guard.as_ref() {
                if now + 30 < *exp {
                    return Ok(tok.clone());
                }
            }
        }

        let exp = now + 600;
        let claims = ServiceClaims {
            role: "service_role",
            iss: "supabase",
            iat: now,
            exp,
        };
        let token = encode(
            &Header::new(Algorithm::HS256),
            &claims,
            &EncodingKey::from_secret(self.jwt_secret.as_bytes()),
        )
        .map_err(|e| AuthError::Upstream(format!("mint service token: {e}")))?;

        if let Ok(mut guard) = self.service_token.lock() {
            *guard = Some((token.clone(), exp));
        }
        Ok(token)
    }

    pub async fn is_staff(&self, user_id: &str) -> Result<bool, AuthError> {
        if let Ok(mut cache) = self.cache.lock() {
            if let Some(&(val, exp)) = cache.get(user_id) {
                if Self::now() < exp {
                    return Ok(val);
                }
            }
        }

        let val = match self.query_is_staff(user_id).await {
            Ok(v) => v,
            Err((true, _)) => {
                tokio::time::sleep(Duration::from_millis(150)).await;
                self.query_is_staff(user_id).await.map_err(|(_, e)| e)?
            }
            Err((false, e)) => return Err(e),
        };

        if let Ok(mut cache) = self.cache.lock() {
            cache.put(user_id.to_string(), (val, Self::now() + self.ttl_secs));
        }
        Ok(val)
    }

    /// One `is_staff` RPC attempt. The error flags whether it is transient
    /// (network blip / 5xx) and worth a retry.
    async fn query_is_staff(&self, user_id: &str) -> Result<bool, (bool, AuthError)> {
        let bearer = self.service_bearer().map_err(|e| (false, e))?;
        let apikey = self.apikey.as_deref().unwrap_or(bearer.as_str());

        let resp = self
            .client
            .post(&self.rpc_url)
            .header("apikey", apikey)
            .header("Authorization", format!("Bearer {bearer}"))
            .header("Accept-Profile", &self.schema)
            .header("Content-Profile", &self.schema)
            .json(&serde_json::json!({ "p_user_id": user_id }))
            .send()
            .await
            .map_err(|e| (true, AuthError::Upstream(format!("is_staff network: {e}"))))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let transient = status.is_server_error();
            let body = resp.text().await.unwrap_or_default();
            return Err((
                transient,
                AuthError::Upstream(format!("is_staff {status} → {body}")),
            ));
        }

        let text = resp
            .text()
            .await
            .map_err(|e| (true, AuthError::Upstream(format!("is_staff read: {e}"))))?;
        Ok(text.trim().eq_ignore_ascii_case("true"))
    }
}
