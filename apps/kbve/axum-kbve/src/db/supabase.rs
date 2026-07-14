// Supabase client configuration and utilities

use reqwest::{Client, header::HeaderMap, header::HeaderValue};
use std::time::Duration;

/// Build a `HeaderValue`, mapping the (rare) invalid-byte case to an error
/// instead of panicking — a secret with a stray `\n`/`\r` must not crash the
/// request thread.
fn header_value(s: &str) -> Result<HeaderValue, String> {
    HeaderValue::from_str(s).map_err(|_| "invalid header value".to_string())
}

/// Supabase configuration loaded from environment
#[derive(Clone)]
pub struct SupabaseConfig {
    pub url: String,
    #[allow(dead_code)]
    pub anon_key: String,
    pub service_role_key: Option<String>,
    #[allow(dead_code)]
    pub jwt_secret: Option<String>,
}

impl SupabaseConfig {
    /// Load configuration from environment variables
    pub fn from_env() -> Result<Self, String> {
        let url = std::env::var("SUPABASE_URL").unwrap_or_else(|_| {
            tracing::warn!("SUPABASE_URL not set, using localhost");
            "http://localhost:54321".to_string()
        });

        let anon_key = std::env::var("SUPABASE_ANON_KEY")
            .map_err(|_| "SUPABASE_ANON_KEY environment variable is required")?;

        let service_role_key = std::env::var("SUPABASE_SERVICE_ROLE_KEY").ok();
        if service_role_key.is_none() {
            tracing::warn!("SUPABASE_SERVICE_ROLE_KEY not set, admin features disabled");
        }

        let jwt_secret = std::env::var("SUPABASE_JWT_SECRET").ok();

        Ok(Self {
            url,
            anon_key,
            service_role_key,
            jwt_secret,
        })
    }

    /// Get the REST API base URL
    #[allow(dead_code)]
    pub fn rest_url(&self) -> String {
        format!("{}/rest/v1", self.url)
    }

    /// Get the RPC endpoint URL
    pub fn rpc_url(&self, function_name: &str) -> String {
        format!("{}/rest/v1/rpc/{}", self.url, function_name)
    }

    /// Get the auth API base URL
    #[allow(dead_code)]
    pub fn auth_url(&self) -> String {
        format!("{}/auth/v1", self.url)
    }
}

/// Supabase HTTP client wrapper
#[derive(Clone)]
pub struct SupabaseClient {
    client: Client,
    config: SupabaseConfig,
}

impl SupabaseClient {
    /// Create a new Supabase client
    pub fn new(config: SupabaseConfig) -> Result<Self, String> {
        let client = Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

        Ok(Self { client, config })
    }

    /// Get the underlying reqwest client
    pub fn client(&self) -> &Client {
        &self.client
    }

    /// Get the configuration
    pub fn config(&self) -> &SupabaseConfig {
        &self.config
    }

    /// Build headers for read operations (using anon key)
    #[allow(dead_code)]
    pub fn read_headers(&self) -> Result<HeaderMap, String> {
        let mut headers = HeaderMap::new();
        headers.insert("apikey", header_value(&self.config.anon_key)?);
        headers.insert(
            "Authorization",
            header_value(&format!("Bearer {}", self.config.anon_key))?,
        );
        Ok(headers)
    }

    /// Build headers for read operations with a specific schema
    #[allow(dead_code)]
    pub fn read_headers_with_schema(&self, schema: &str) -> Result<HeaderMap, String> {
        let mut headers = self.read_headers()?;
        headers.insert("Accept-Profile", header_value(schema)?);
        Ok(headers)
    }

    /// Build headers for write operations (using service role key)
    pub fn write_headers(&self) -> Result<HeaderMap, String> {
        let service_key = self
            .config
            .service_role_key
            .as_ref()
            .ok_or("Service role key not configured")?;

        let mut headers = HeaderMap::new();
        headers.insert("apikey", header_value(service_key)?);
        headers.insert(
            "Authorization",
            header_value(&format!("Bearer {}", service_key))?,
        );
        headers.insert("Content-Type", HeaderValue::from_static("application/json"));
        Ok(headers)
    }

    /// Build headers for write operations with a specific schema
    pub fn write_headers_with_schema(&self, schema: &str) -> Result<HeaderMap, String> {
        let mut headers = self.write_headers()?;
        headers.insert("Content-Profile", header_value(schema)?);
        headers.insert("Accept-Profile", header_value(schema)?);
        Ok(headers)
    }

    /// Build headers for RPC calls (using service role key)
    pub fn rpc_headers(&self, schema: &str) -> Result<HeaderMap, String> {
        self.write_headers_with_schema(schema)
    }

    /// Build headers for RPC calls using a user's JWT token
    /// This allows auth.uid() to work in the RPC function
    #[allow(dead_code)]
    pub fn rpc_headers_with_user_token(
        &self,
        schema: &str,
        user_token: &str,
    ) -> Result<HeaderMap, String> {
        let mut headers = HeaderMap::new();
        headers.insert("apikey", header_value(&self.config.anon_key)?);
        headers.insert(
            "Authorization",
            header_value(&format!("Bearer {user_token}"))?,
        );
        headers.insert("Content-Type", HeaderValue::from_static("application/json"));
        headers.insert("Content-Profile", header_value(schema)?);
        headers.insert("Accept-Profile", header_value(schema)?);
        Ok(headers)
    }

    /// Get the Edge Functions base URL
    pub fn functions_url(&self, function_name: &str) -> String {
        format!("{}/functions/v1/{}", self.config.url, function_name)
    }

    /// Fetch a secret from the Supabase vault using the vault-reader Edge Function
    ///
    /// Returns the decrypted secret value on success, or an error message on failure.
    /// This uses the service role key for authentication (both apikey and Authorization headers).
    pub async fn get_vault_secret(&self, secret_id: &str) -> Result<String, String> {
        let service_key = self
            .config
            .service_role_key
            .as_ref()
            .ok_or("Service role key not configured - cannot access vault")?;

        let url = self.functions_url("vault-reader");

        let payload = serde_json::json!({
            "command": "get",
            "secret_id": secret_id
        });

        let response = self
            .client
            .post(&url)
            .header("apikey", service_key)
            .header("Authorization", format!("Bearer {}", service_key))
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("Vault request failed: {}", e))?;

        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            return Err(format!("Vault returned status {}: {}", status, body));
        }

        let data: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse vault response: {}", e))?;

        // Check for error in response
        if let Some(error) = data.get("error") {
            return Err(format!("Vault error: {}", error));
        }

        // Extract decrypted_secret
        data.get("decrypted_secret")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .ok_or_else(|| "decrypted_secret not found in vault response".to_string())
    }
}
