//! Native PostgREST client — ports the struct originally living in
//! `packages/rust/kbve/src/entity/client/supabase.rs` into a standalone,
//! dependency-lean form so JNI and other embedded consumers can link it
//! without dragging diesel / axum / tower along for the ride.
//!
//! Feature-gated behind `native`. When the `wasm` feature stabilizes this
//! module will grow a transport trait so the API shape stays identical
//! across browser and desktop builds.

use reqwest::Client;
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE, HeaderMap, HeaderValue};
use std::time::Duration;

use crate::error::SupaError;

/// Default HTTP timeout. Tuned for in-cluster calls (PostgREST via Kong)
/// where 15s is comfortably above the p99 for a schema-routed RPC but
/// low enough to avoid pinning a tokio worker on a wedged connection.
/// Override with [`SupaClient::with_timeout`] for out-of-cluster callers.
pub const DEFAULT_TIMEOUT: Duration = Duration::from_secs(15);

/// PostgREST-compatible client for Supabase.
///
/// Construction is cheap (wraps an `Arc`-ed reqwest `Client`) and the
/// client is `Clone`, so you can hand a single instance to many tasks.
/// Use [`SupaClient::new`] when you already have the URL + key, or
/// [`SupaClient::from_env`] to read them from the process env.
#[derive(Debug, Clone)]
pub struct SupaClient {
    base_url: String,
    api_key: String,
    jwt: Option<String>,
    http: Client,
}

impl SupaClient {
    /// Build a new client with an explicit URL and key.
    ///
    /// `api_key` can be either the anon key (limited by RLS) or the
    /// service-role key (bypasses RLS). The client itself does not care.
    pub fn new(base_url: impl Into<String>, api_key: impl Into<String>) -> Self {
        Self::with_timeout(base_url, api_key, DEFAULT_TIMEOUT)
    }

    /// Build a client with a custom HTTP timeout.
    pub fn with_timeout(
        base_url: impl Into<String>,
        api_key: impl Into<String>,
        timeout: Duration,
    ) -> Self {
        let http = Client::builder()
            .timeout(timeout)
            .build()
            .unwrap_or_else(|_| Client::new());

        Self {
            base_url: base_url.into().trim_end_matches('/').to_string(),
            api_key: api_key.into(),
            jwt: None,
            http,
        }
    }

    /// Read `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` from the
    /// process env. Returns `None` if either is missing or empty.
    pub fn from_env() -> Option<Self> {
        let url = std::env::var("SUPABASE_URL")
            .ok()
            .filter(|s| !s.is_empty())?;
        let key = std::env::var("SUPABASE_SERVICE_ROLE_KEY")
            .ok()
            .filter(|s| !s.is_empty())?;
        Some(Self::new(url, key))
    }

    /// Override the effective auth JWT for this client. Useful when
    /// proxying a user session through the server — pass the user's
    /// anon JWT here and the service-role key stays at the `apikey`
    /// header only.
    pub fn with_jwt(mut self, jwt: impl Into<String>) -> Self {
        self.jwt = Some(jwt.into());
        self
    }

    fn default_headers(&self) -> HeaderMap {
        let mut headers = HeaderMap::new();
        if let Ok(v) = HeaderValue::from_str(&self.api_key) {
            headers.insert("apikey", v);
        }
        let auth_token = self.jwt.as_deref().unwrap_or(&self.api_key);
        if let Ok(v) = HeaderValue::from_str(&format!("Bearer {}", auth_token)) {
            headers.insert(AUTHORIZATION, v);
        }
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        headers
    }

    /// Call a Supabase RPC (database function) in the default schema.
    pub async fn rpc(
        &self,
        function: &str,
        params: serde_json::Value,
    ) -> Result<reqwest::Response, SupaError> {
        let url = format!("{}/rest/v1/rpc/{}", self.base_url, function);
        let resp = self
            .http
            .post(&url)
            .headers(self.default_headers())
            .json(&params)
            .send()
            .await?;
        Ok(resp)
    }

    /// Call a Supabase RPC in a specific PostgreSQL schema.
    ///
    /// Sets `Content-Profile` and `Accept-Profile` so PostgREST routes
    /// the call to the given schema (e.g. `"mc"` for the Minecraft auth
    /// functions). The schema must be listed in PostgREST's
    /// `db-schemas` config — for the kilobase stack that's the `pgrst.*`
    /// values already pointing at `public, mc, tracker, ...`.
    pub async fn rpc_schema(
        &self,
        function: &str,
        params: serde_json::Value,
        schema: &str,
    ) -> Result<reqwest::Response, SupaError> {
        let url = format!("{}/rest/v1/rpc/{}", self.base_url, function);
        let mut headers = self.default_headers();
        if let Ok(v) = HeaderValue::from_str(schema) {
            headers.insert("Content-Profile", v.clone());
            headers.insert("Accept-Profile", v);
        }
        let resp = self
            .http
            .post(&url)
            .headers(headers)
            .json(&params)
            .send()
            .await?;
        Ok(resp)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trims_trailing_slash() {
        let c = SupaClient::new("https://example.supabase.co/", "key");
        assert_eq!(c.base_url, "https://example.supabase.co");
    }

    #[test]
    fn default_headers_carry_apikey_and_auth() {
        let c = SupaClient::new("https://example.supabase.co", "secret-key");
        let h = c.default_headers();
        assert_eq!(h.get("apikey").unwrap(), "secret-key");
        assert_eq!(h.get(AUTHORIZATION).unwrap(), "Bearer secret-key");
    }

    #[test]
    fn with_jwt_overrides_auth_header_only() {
        let c = SupaClient::new("https://example.supabase.co", "service-role").with_jwt("user-jwt");
        let h = c.default_headers();
        // apikey still the service-role key
        assert_eq!(h.get("apikey").unwrap(), "service-role");
        // Authorization swapped to the user JWT
        assert_eq!(h.get(AUTHORIZATION).unwrap(), "Bearer user-jwt");
    }

    #[test]
    fn from_env_none_without_vars() {
        // Test runs in isolation but other tests may set these. Defensive:
        unsafe {
            std::env::remove_var("SUPABASE_URL");
            std::env::remove_var("SUPABASE_SERVICE_ROLE_KEY");
        }
        assert!(SupaClient::from_env().is_none());
    }
}
