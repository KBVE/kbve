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
#[cfg_attr(feature = "bevy", derive(bevy::prelude::Resource))]
pub struct SupaClient {
    base_url: String,
    api_key: String,
    jwt: Option<String>,
    http: Client,
    timeout: Duration,
}

impl SupaClient {
    /// Build a new client with an explicit URL and key.
    ///
    /// `api_key` can be either the anon key (limited by RLS) or the
    /// service-role key (bypasses RLS). The client itself does not care.
    ///
    /// # Arguments
    ///
    /// * `base_url` — Supabase base URL (e.g. `https://xyz.supabase.co`).
    ///   Trailing slashes are stripped.
    /// * `api_key` — anon or service-role key.
    pub fn new(base_url: impl Into<String>, api_key: impl Into<String>) -> Self {
        Self::with_timeout(base_url, api_key, DEFAULT_TIMEOUT)
    }

    /// Build a client with a custom HTTP timeout.
    ///
    /// # Arguments
    ///
    /// * `base_url` — Supabase base URL.
    /// * `api_key` — anon or service-role key.
    /// * `timeout` — per-request HTTP timeout (override
    ///   [`DEFAULT_TIMEOUT`] for out-of-cluster callers).
    pub fn with_timeout(
        base_url: impl Into<String>,
        api_key: impl Into<String>,
        timeout: Duration,
    ) -> Self {
        // Client-level timeout only exists on the native builder; wasm gets
        // the same bound per-request in `post_json` via AbortController.
        #[allow(unused_mut)]
        let mut builder = Client::builder();
        #[cfg(not(target_arch = "wasm32"))]
        {
            builder = builder.timeout(timeout);
        }
        let http = builder.build().unwrap_or_else(|_| Client::new());

        Self {
            base_url: base_url.into().trim_end_matches('/').to_string(),
            api_key: api_key.into(),
            jwt: None,
            http,
            timeout,
        }
    }

    /// Read `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` from the
    /// process env.
    ///
    /// # Returns
    ///
    /// `Some(client)` when both vars are set and non-empty, `None`
    /// otherwise.
    pub fn from_env() -> Option<Self> {
        let url = std::env::var("SUPABASE_URL")
            .ok()
            .filter(|s| !s.is_empty())?;
        let key = std::env::var("SUPABASE_SERVICE_ROLE_KEY")
            .ok()
            .filter(|s| !s.is_empty())?;
        Some(Self::new(url, key))
    }

    /// Override the effective auth JWT for this client.
    ///
    /// Useful when proxying a user session through the server — pass
    /// the user's anon JWT here and the service-role key stays at the
    /// `apikey` header only. Returns `self` for chaining.
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

    /// Single funnel for every outgoing request so the timeout cannot be
    /// forgotten on a new endpoint. The request-level timeout is what
    /// bounds wasm fetches (AbortController); on native it matches the
    /// client-level value, so it is a no-op there.
    async fn post_json(
        &self,
        url: &str,
        headers: HeaderMap,
        params: &serde_json::Value,
    ) -> Result<reqwest::Response, SupaError> {
        let resp = self
            .http
            .post(url)
            .headers(headers)
            .json(params)
            .timeout(self.timeout)
            .send()
            .await?;
        Ok(resp)
    }

    /// Call a Supabase RPC (database function) in the default schema.
    ///
    /// # Arguments
    ///
    /// * `function` — RPC name as registered in PostgREST (matches
    ///   the SQL function name).
    /// * `params` — JSON object of named parameters.
    ///
    /// # Errors
    ///
    /// Returns [`SupaError::Transport`] on connection / DNS / TLS
    /// failures. The HTTP response itself is not status-checked here —
    /// callers decide how to handle 4xx / 5xx, typically via
    /// [`reqwest::Response::error_for_status`].
    pub async fn rpc(
        &self,
        function: &str,
        params: serde_json::Value,
    ) -> Result<reqwest::Response, SupaError> {
        let url = format!("{}/rest/v1/rpc/{}", self.base_url, function);
        self.post_json(&url, self.default_headers(), &params).await
    }

    /// Call a Supabase RPC in a specific PostgreSQL schema.
    ///
    /// Sets `Content-Profile` and `Accept-Profile` so PostgREST routes
    /// the call to the given schema (e.g. `"mc"` for the Minecraft
    /// auth functions). The schema must be listed in PostgREST's
    /// `db-schemas` config — for the kilobase stack that's the
    /// `pgrst.*` values already pointing at `public, mc, tracker, …`.
    ///
    /// # Arguments
    ///
    /// * `function` — RPC name in the target schema.
    /// * `params` — JSON object of named parameters.
    /// * `schema` — PostgreSQL schema name (e.g. `"mc"`).
    ///
    /// # Errors
    ///
    /// Same as [`SupaClient::rpc`] — transport-layer failures.
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
        self.post_json(&url, headers, &params).await
    }

    /// Start building a table query.
    ///
    /// RPC covers most of what this stack asks PostgREST for; this is the
    /// direct-table path for the cases that have no function behind them.
    ///
    /// # Arguments
    ///
    /// * `table` — table name as exposed by PostgREST.
    pub fn from(&self, table: &str) -> QueryBuilder {
        QueryBuilder {
            http: self.http.clone(),
            url: format!("{}/rest/v1/{}", self.base_url, table),
            headers: self.default_headers(),
            timeout: self.timeout,
            filters: Vec::new(),
            select_columns: None,
            order_clause: None,
            limit_val: None,
            offset_val: None,
        }
    }
}

/// Builder for a PostgREST table query: filters, ordering, pagination, CRUD.
///
/// Built by [`SupaClient::from`], which seeds it with the client's headers and
/// timeout so a query cannot end up unauthenticated or unbounded.
#[derive(Debug)]
pub struct QueryBuilder {
    http: Client,
    url: String,
    headers: HeaderMap,
    timeout: Duration,
    filters: Vec<String>,
    select_columns: Option<String>,
    order_clause: Option<String>,
    limit_val: Option<u32>,
    offset_val: Option<u32>,
}

impl QueryBuilder {
    /// Select specific columns (comma-separated).
    pub fn select(mut self, columns: &str) -> Self {
        self.select_columns = Some(columns.to_string());
        self
    }

    /// Filter: column equals value.
    pub fn eq(mut self, column: &str, value: &str) -> Self {
        self.filters.push(format!("{}=eq.{}", column, value));
        self
    }

    /// Filter: column not equals value.
    pub fn neq(mut self, column: &str, value: &str) -> Self {
        self.filters.push(format!("{}=neq.{}", column, value));
        self
    }

    /// Filter: column greater than value.
    pub fn gt(mut self, column: &str, value: &str) -> Self {
        self.filters.push(format!("{}=gt.{}", column, value));
        self
    }

    /// Filter: column less than value.
    pub fn lt(mut self, column: &str, value: &str) -> Self {
        self.filters.push(format!("{}=lt.{}", column, value));
        self
    }

    /// Filter: column greater than or equal to value.
    pub fn gte(mut self, column: &str, value: &str) -> Self {
        self.filters.push(format!("{}=gte.{}", column, value));
        self
    }

    /// Filter: column less than or equal to value.
    pub fn lte(mut self, column: &str, value: &str) -> Self {
        self.filters.push(format!("{}=lte.{}", column, value));
        self
    }

    /// Filter: column matches pattern (case-sensitive).
    pub fn like(mut self, column: &str, pattern: &str) -> Self {
        self.filters.push(format!("{}=like.{}", column, pattern));
        self
    }

    /// Filter: column matches pattern (case-insensitive).
    pub fn ilike(mut self, column: &str, pattern: &str) -> Self {
        self.filters.push(format!("{}=ilike.{}", column, pattern));
        self
    }

    /// Filter: column value is in the provided list.
    pub fn in_list(mut self, column: &str, values: &[&str]) -> Self {
        let list = format!("({})", values.join(","));
        self.filters.push(format!("{}=in.{}", column, list));
        self
    }

    /// Order results by column.
    pub fn order(mut self, column: &str, ascending: bool) -> Self {
        let dir = if ascending { "asc" } else { "desc" };
        self.order_clause = Some(format!("{}.{}", column, dir));
        self
    }

    /// Limit the number of rows returned.
    pub fn limit(mut self, count: u32) -> Self {
        self.limit_val = Some(count);
        self
    }

    /// Offset (skip) a number of rows.
    pub fn offset(mut self, count: u32) -> Self {
        self.offset_val = Some(count);
        self
    }

    /// Convenience: set both offset and limit for range-based pagination.
    pub fn range(self, from: u32, to: u32) -> Self {
        self.offset(from).limit(to - from + 1)
    }

    fn build_url(&self) -> String {
        let mut params: Vec<String> = Vec::new();

        if let Some(ref cols) = self.select_columns {
            params.push(format!("select={}", cols));
        }

        for filter in &self.filters {
            params.push(filter.clone());
        }

        if let Some(ref order) = self.order_clause {
            params.push(format!("order={}", order));
        }

        if let Some(limit) = self.limit_val {
            params.push(format!("limit={}", limit));
        }

        if let Some(offset) = self.offset_val {
            params.push(format!("offset={}", offset));
        }

        if params.is_empty() {
            self.url.clone()
        } else {
            format!("{}?{}", self.url, params.join("&"))
        }
    }

    /// Execute a GET request (select/read).
    pub async fn execute(self) -> Result<reqwest::Response, SupaError> {
        let url = self.build_url();
        let resp = self
            .http
            .get(&url)
            .headers(self.headers)
            .timeout(self.timeout)
            .send()
            .await?;
        Ok(resp)
    }

    /// Execute a POST request (insert).
    pub async fn insert(self, body: serde_json::Value) -> Result<reqwest::Response, SupaError> {
        let url = self.build_url();
        let mut headers = self.headers;
        headers.insert("prefer", HeaderValue::from_static("return=representation"));

        let resp = self
            .http
            .post(&url)
            .headers(headers)
            .json(&body)
            .timeout(self.timeout)
            .send()
            .await?;
        Ok(resp)
    }

    /// Execute a PATCH request (update). Filters determine which rows to update.
    pub async fn update(self, body: serde_json::Value) -> Result<reqwest::Response, SupaError> {
        let url = self.build_url();
        let mut headers = self.headers;
        headers.insert("prefer", HeaderValue::from_static("return=representation"));

        let resp = self
            .http
            .patch(&url)
            .headers(headers)
            .json(&body)
            .timeout(self.timeout)
            .send()
            .await?;
        Ok(resp)
    }

    /// Execute a DELETE request. Filters determine which rows to delete.
    pub async fn delete(self) -> Result<reqwest::Response, SupaError> {
        let url = self.build_url();
        let resp = self
            .http
            .delete(&url)
            .headers(self.headers)
            .timeout(self.timeout)
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
    fn with_timeout_stores_duration_for_per_request_use() {
        let c =
            SupaClient::with_timeout("https://example.supabase.co", "key", Duration::from_secs(5));
        assert_eq!(c.timeout, Duration::from_secs(5));
        let d = SupaClient::new("https://example.supabase.co", "key");
        assert_eq!(d.timeout, DEFAULT_TIMEOUT);
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

    fn test_client() -> SupaClient {
        SupaClient::new("https://test.supabase.co", "test-api-key")
    }

    #[test]
    fn query_builder_base_url() {
        let qb = test_client().from("users");
        assert_eq!(qb.url, "https://test.supabase.co/rest/v1/users");
        assert_eq!(qb.build_url(), "https://test.supabase.co/rest/v1/users");
        assert!(!qb.build_url().contains('?'));
    }

    #[test]
    fn query_builder_inherits_client_headers_and_timeout() {
        let qb =
            SupaClient::with_timeout("https://test.supabase.co", "key", Duration::from_secs(5))
                .with_jwt("user-jwt")
                .from("users");
        assert_eq!(qb.timeout, Duration::from_secs(5));
        assert_eq!(qb.headers.get("apikey").unwrap(), "key");
        assert_eq!(qb.headers.get(AUTHORIZATION).unwrap(), "Bearer user-jwt");
    }

    #[test]
    fn query_builder_select() {
        let url = test_client()
            .from("users")
            .select("id,name,email")
            .build_url();
        assert_eq!(
            url,
            "https://test.supabase.co/rest/v1/users?select=id,name,email"
        );
    }

    #[test]
    fn query_builder_comparison_filters() {
        let url = test_client()
            .from("items")
            .eq("active", "true")
            .neq("status", "deleted")
            .gt("price", "10")
            .lt("price", "100")
            .gte("qty", "1")
            .lte("qty", "50")
            .build_url();
        assert!(url.contains("active=eq.true"));
        assert!(url.contains("status=neq.deleted"));
        assert!(url.contains("price=gt.10"));
        assert!(url.contains("price=lt.100"));
        assert!(url.contains("qty=gte.1"));
        assert!(url.contains("qty=lte.50"));
    }

    #[test]
    fn query_builder_pattern_and_list_filters() {
        let url = test_client()
            .from("users")
            .like("name", "%john%")
            .ilike("nick", "%JOHN%")
            .in_list("role", &["admin", "mod", "user"])
            .build_url();
        assert!(url.contains("name=like.%john%"));
        assert!(url.contains("nick=ilike.%JOHN%"));
        assert!(url.contains("role=in.(admin,mod,user)"));
    }

    #[test]
    fn query_builder_order_both_directions() {
        assert!(
            test_client()
                .from("users")
                .order("name", true)
                .build_url()
                .contains("order=name.asc")
        );
        assert!(
            test_client()
                .from("users")
                .order("created_at", false)
                .build_url()
                .contains("order=created_at.desc")
        );
    }

    #[test]
    fn query_builder_limit_offset_and_range() {
        let url = test_client().from("users").limit(25).offset(50).build_url();
        assert!(url.contains("limit=25"));
        assert!(url.contains("offset=50"));

        // range is inclusive on both ends, so 10..=19 is ten rows.
        let ranged = test_client().from("users").range(10, 19).build_url();
        assert!(ranged.contains("offset=10"));
        assert!(ranged.contains("limit=10"));
    }

    #[test]
    fn query_builder_combines_every_clause() {
        let url = test_client()
            .from("products")
            .select("id,name,price")
            .eq("category", "electronics")
            .gt("price", "50")
            .order("price", true)
            .limit(20)
            .build_url();
        assert!(url.contains("select=id,name,price"));
        assert!(url.contains("category=eq.electronics"));
        assert!(url.contains("price=gt.50"));
        assert!(url.contains("order=price.asc"));
        assert!(url.contains("limit=20"));
    }
}
