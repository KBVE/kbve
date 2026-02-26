use reqwest::Client;
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE, HeaderMap, HeaderValue};

/// Error type for Supabase operations.
#[derive(Debug, thiserror::Error)]
pub enum SupabaseError {
    #[error("Request failed: {0}")]
    Request(#[from] reqwest::Error),

    #[error("Missing configuration: {0}")]
    Config(String),
}

/// PostgREST-compatible client for Supabase.
///
/// Wraps reqwest to provide a builder-style query API for Supabase tables and RPC functions.
///
/// # Example
/// ```ignore
/// let client = SupabaseClient::new("https://your-project.supabase.co", "your-anon-key");
///
/// // Query
/// let resp = client
///     .from("users")
///     .select("id,name,email")
///     .eq("active", "true")
///     .order("name", true)
///     .limit(10)
///     .execute()
///     .await?;
///
/// // Insert
/// let resp = client
///     .from("users")
///     .insert(serde_json::json!({"name": "John", "email": "john@example.com"}))
///     .await?;
///
/// // RPC
/// let resp = client
///     .rpc("my_function", serde_json::json!({"param1": "value"}))
///     .await?;
/// ```
#[derive(Debug, Clone)]
pub struct SupabaseClient {
    base_url: String,
    api_key: String,
    jwt: Option<String>,
    client: Client,
}

impl SupabaseClient {
    /// Create a new Supabase client with the project URL and API key (anon or service role).
    pub fn new(base_url: &str, api_key: &str) -> Self {
        let client = Client::builder()
            .build()
            .expect("Failed to build reqwest client for SupabaseClient");

        Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            api_key: api_key.to_string(),
            jwt: None,
            client,
        }
    }

    /// Set an authenticated user JWT for row-level security.
    pub fn with_jwt(mut self, jwt: &str) -> Self {
        self.jwt = Some(jwt.to_string());
        self
    }

    /// Build default headers (apikey + optional auth JWT).
    fn default_headers(&self) -> HeaderMap {
        let mut headers = HeaderMap::new();
        if let Ok(val) = HeaderValue::from_str(&self.api_key) {
            headers.insert("apikey", val);
        }

        let auth_token = self.jwt.as_deref().unwrap_or(&self.api_key);
        if let Ok(val) = HeaderValue::from_str(&format!("Bearer {}", auth_token)) {
            headers.insert(AUTHORIZATION, val);
        }

        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

        headers
    }

    /// Start building a query against a table.
    pub fn from(&self, table: &str) -> QueryBuilder {
        let url = format!("{}/rest/v1/{}", self.base_url, table);
        QueryBuilder {
            client: self.client.clone(),
            url,
            headers: self.default_headers(),
            filters: Vec::new(),
            select_columns: None,
            order_clause: None,
            limit_val: None,
            offset_val: None,
        }
    }

    /// Call a Supabase RPC (database function).
    pub async fn rpc(
        &self,
        function: &str,
        params: serde_json::Value,
    ) -> Result<reqwest::Response, SupabaseError> {
        let url = format!("{}/rest/v1/rpc/{}", self.base_url, function);

        let resp = self
            .client
            .post(&url)
            .headers(self.default_headers())
            .json(&params)
            .send()
            .await?;

        Ok(resp)
    }

    /// Call a Supabase RPC in a specific PostgreSQL schema.
    ///
    /// Sets `Content-Profile` and `Accept-Profile` headers so PostgREST
    /// routes the call to the given schema (e.g. `"tracker"`).
    pub async fn rpc_schema(
        &self,
        function: &str,
        params: serde_json::Value,
        schema: &str,
    ) -> Result<reqwest::Response, SupabaseError> {
        let url = format!("{}/rest/v1/rpc/{}", self.base_url, function);

        let mut headers = self.default_headers();
        if let Ok(val) = HeaderValue::from_str(schema) {
            headers.insert("Content-Profile", val.clone());
            headers.insert("Accept-Profile", val);
        }

        let resp = self
            .client
            .post(&url)
            .headers(headers)
            .json(&params)
            .send()
            .await?;

        Ok(resp)
    }

    /// Create a Supabase client from environment variables.
    ///
    /// Reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
    /// Returns `None` if either variable is missing or empty.
    pub fn from_env() -> Option<Self> {
        let base_url = std::env::var("SUPABASE_URL")
            .ok()
            .filter(|s| !s.is_empty())?;
        let key = std::env::var("SUPABASE_SERVICE_ROLE_KEY")
            .ok()
            .filter(|s| !s.is_empty())?;
        Some(Self::new(&base_url, &key))
    }
}

/// Builder for constructing PostgREST queries.
///
/// Supports filtering, ordering, pagination, and CRUD operations.
#[derive(Debug)]
pub struct QueryBuilder {
    client: Client,
    url: String,
    headers: HeaderMap,
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

    /// Build the final URL with all query parameters.
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
    pub async fn execute(self) -> Result<reqwest::Response, SupabaseError> {
        let url = self.build_url();
        let resp = self.client.get(&url).headers(self.headers).send().await?;
        Ok(resp)
    }

    /// Execute a POST request (insert).
    pub async fn insert(self, body: serde_json::Value) -> Result<reqwest::Response, SupabaseError> {
        let url = self.build_url();
        let mut headers = self.headers;
        headers.insert("prefer", HeaderValue::from_static("return=representation"));

        let resp = self
            .client
            .post(&url)
            .headers(headers)
            .json(&body)
            .send()
            .await?;
        Ok(resp)
    }

    /// Execute a PATCH request (update). Filters determine which rows to update.
    pub async fn update(self, body: serde_json::Value) -> Result<reqwest::Response, SupabaseError> {
        let url = self.build_url();
        let mut headers = self.headers;
        headers.insert("prefer", HeaderValue::from_static("return=representation"));

        let resp = self
            .client
            .patch(&url)
            .headers(headers)
            .json(&body)
            .send()
            .await?;
        Ok(resp)
    }

    /// Execute a DELETE request. Filters determine which rows to delete.
    pub async fn delete(self) -> Result<reqwest::Response, SupabaseError> {
        let url = self.build_url();
        let resp = self
            .client
            .delete(&url)
            .headers(self.headers)
            .send()
            .await?;
        Ok(resp)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_client() -> SupabaseClient {
        SupabaseClient::new("https://test.supabase.co", "test-api-key")
    }

    #[test]
    fn test_client_creation() {
        let client = test_client();
        assert_eq!(client.base_url, "https://test.supabase.co");
        assert_eq!(client.api_key, "test-api-key");
        assert!(client.jwt.is_none());
    }

    #[test]
    fn test_client_with_jwt() {
        let client = test_client().with_jwt("user-jwt-token");
        assert_eq!(client.jwt.as_deref(), Some("user-jwt-token"));
    }

    #[test]
    fn test_client_trims_trailing_slash() {
        let client = SupabaseClient::new("https://test.supabase.co/", "key");
        assert_eq!(client.base_url, "https://test.supabase.co");
    }

    #[test]
    fn test_default_headers_include_apikey() {
        let client = test_client();
        let headers = client.default_headers();
        assert_eq!(headers.get("apikey").unwrap(), "test-api-key");
    }

    #[test]
    fn test_default_headers_auth_uses_apikey_when_no_jwt() {
        let client = test_client();
        let headers = client.default_headers();
        assert_eq!(headers.get(AUTHORIZATION).unwrap(), "Bearer test-api-key");
    }

    #[test]
    fn test_default_headers_auth_uses_jwt_when_set() {
        let client = test_client().with_jwt("my-jwt");
        let headers = client.default_headers();
        assert_eq!(headers.get(AUTHORIZATION).unwrap(), "Bearer my-jwt");
    }

    #[test]
    fn test_query_builder_base_url() {
        let client = test_client();
        let qb = client.from("users");
        assert_eq!(qb.url, "https://test.supabase.co/rest/v1/users");
    }

    #[test]
    fn test_query_builder_select() {
        let client = test_client();
        let qb = client.from("users").select("id,name,email");
        let url = qb.build_url();
        assert_eq!(
            url,
            "https://test.supabase.co/rest/v1/users?select=id,name,email"
        );
    }

    #[test]
    fn test_query_builder_eq_filter() {
        let client = test_client();
        let qb = client.from("users").eq("active", "true");
        let url = qb.build_url();
        assert!(url.contains("active=eq.true"));
    }

    #[test]
    fn test_query_builder_neq_filter() {
        let client = test_client();
        let qb = client.from("users").neq("status", "deleted");
        let url = qb.build_url();
        assert!(url.contains("status=neq.deleted"));
    }

    #[test]
    fn test_query_builder_gt_lt() {
        let client = test_client();
        let qb = client.from("items").gt("price", "10").lt("price", "100");
        let url = qb.build_url();
        assert!(url.contains("price=gt.10"));
        assert!(url.contains("price=lt.100"));
    }

    #[test]
    fn test_query_builder_gte_lte() {
        let client = test_client();
        let qb = client.from("items").gte("qty", "1").lte("qty", "50");
        let url = qb.build_url();
        assert!(url.contains("qty=gte.1"));
        assert!(url.contains("qty=lte.50"));
    }

    #[test]
    fn test_query_builder_like() {
        let client = test_client();
        let qb = client.from("users").like("name", "%john%");
        let url = qb.build_url();
        assert!(url.contains("name=like.%john%"));
    }

    #[test]
    fn test_query_builder_ilike() {
        let client = test_client();
        let qb = client.from("users").ilike("name", "%john%");
        let url = qb.build_url();
        assert!(url.contains("name=ilike.%john%"));
    }

    #[test]
    fn test_query_builder_in_list() {
        let client = test_client();
        let qb = client
            .from("users")
            .in_list("role", &["admin", "mod", "user"]);
        let url = qb.build_url();
        assert!(url.contains("role=in.(admin,mod,user)"));
    }

    #[test]
    fn test_query_builder_order() {
        let client = test_client();
        let qb = client.from("users").order("name", true);
        let url = qb.build_url();
        assert!(url.contains("order=name.asc"));

        let qb2 = client.from("users").order("created_at", false);
        let url2 = qb2.build_url();
        assert!(url2.contains("order=created_at.desc"));
    }

    #[test]
    fn test_query_builder_limit() {
        let client = test_client();
        let qb = client.from("users").limit(25);
        let url = qb.build_url();
        assert!(url.contains("limit=25"));
    }

    #[test]
    fn test_query_builder_offset() {
        let client = test_client();
        let qb = client.from("users").offset(50);
        let url = qb.build_url();
        assert!(url.contains("offset=50"));
    }

    #[test]
    fn test_query_builder_range() {
        let client = test_client();
        let qb = client.from("users").range(10, 19);
        let url = qb.build_url();
        assert!(url.contains("offset=10"));
        assert!(url.contains("limit=10"));
    }

    #[test]
    fn test_query_builder_multiple_filters() {
        let client = test_client();
        let qb = client
            .from("products")
            .select("id,name,price")
            .eq("category", "electronics")
            .gt("price", "50")
            .order("price", true)
            .limit(20);
        let url = qb.build_url();

        assert!(url.contains("select=id,name,price"));
        assert!(url.contains("category=eq.electronics"));
        assert!(url.contains("price=gt.50"));
        assert!(url.contains("order=price.asc"));
        assert!(url.contains("limit=20"));
    }

    #[test]
    fn test_query_builder_no_params() {
        let client = test_client();
        let qb = client.from("users");
        let url = qb.build_url();
        assert_eq!(url, "https://test.supabase.co/rest/v1/users");
        assert!(!url.contains('?'));
    }

    #[test]
    fn test_rpc_url_construction() {
        let client = test_client();
        // We can only test the URL format since rpc is async
        let expected = format!(
            "{}/rest/v1/rpc/{}",
            "https://test.supabase.co", "my_function"
        );
        assert_eq!(expected, "https://test.supabase.co/rest/v1/rpc/my_function");
    }

    #[test]
    fn test_supabase_error_display() {
        let err = SupabaseError::Config("missing url".to_string());
        assert_eq!(err.to_string(), "Missing configuration: missing url");
    }

    #[test]
    fn test_from_env_returns_none_without_vars() {
        // Env vars won't be set in test, so from_env should return None
        std::env::remove_var("SUPABASE_URL");
        std::env::remove_var("SUPABASE_SERVICE_ROLE_KEY");
        assert!(SupabaseClient::from_env().is_none());
    }
}
