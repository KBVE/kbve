use reqwest::Client;
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE, HeaderMap, HeaderValue};
use serde::{Deserialize, Serialize};

/// Error type for vault operations.
#[derive(Debug, thiserror::Error)]
pub enum VaultError {
    #[error("Request failed: {0}")]
    Request(#[from] reqwest::Error),

    #[error("Vault returned error: {0}")]
    Vault(String),

    #[error("Missing configuration: {0}")]
    Config(String),

    #[error("Failed to parse response: {0}")]
    Parse(String),
}

/// Request payload for the vault-reader Edge Function (get command).
#[derive(Debug, Serialize)]
struct VaultGetRequest<'a> {
    command: &'static str,
    secret_id: &'a str,
}

/// Response from the vault-reader Edge Function.
#[derive(Debug, Deserialize)]
pub struct VaultSecretResponse {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub decrypted_secret: String,
    pub created_at: String,
    pub updated_at: String,
}

/// Error response from the vault-reader Edge Function.
#[derive(Debug, Deserialize)]
struct VaultErrorResponse {
    error: String,
}

/// Client for reading secrets from Supabase Vault via the vault-reader Edge Function.
///
/// # Example
/// ```ignore
/// let vault = VaultClient::new("https://your-project.supabase.co", "your-service-role-key");
/// let token = vault.get_secret("39781c47-be8f-4a10-ae3a-714da299ca07").await?;
/// ```
#[derive(Debug, Clone)]
pub struct VaultClient {
    base_url: String,
    service_role_key: String,
    client: Client,
}

impl VaultClient {
    /// Create a new vault client.
    ///
    /// `base_url` is the Supabase project URL (e.g. `https://your-project.supabase.co`).
    /// `service_role_key` is the service role key with elevated privileges for vault access.
    pub fn new(base_url: &str, service_role_key: &str) -> Self {
        let client = Client::builder()
            .build()
            .expect("Failed to build reqwest client for VaultClient");

        Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            service_role_key: service_role_key.to_string(),
            client,
        }
    }

    /// Create a vault client from environment variables.
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

    /// Build headers for the Edge Function call.
    fn headers(&self) -> HeaderMap {
        let mut headers = HeaderMap::new();
        if let Ok(val) = HeaderValue::from_str(&self.service_role_key) {
            headers.insert("apikey", val);
        }
        if let Ok(val) = HeaderValue::from_str(&format!("Bearer {}", self.service_role_key)) {
            headers.insert(AUTHORIZATION, val);
        }
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        headers
    }

    /// Retrieve a decrypted secret from Supabase Vault by its UUID.
    pub async fn get_secret(&self, secret_id: &str) -> Result<String, VaultError> {
        let url = format!("{}/functions/v1/vault-reader", self.base_url);

        let body = VaultGetRequest {
            command: "get",
            secret_id,
        };

        let resp = self
            .client
            .post(&url)
            .headers(self.headers())
            .json(&body)
            .send()
            .await?;

        let status = resp.status();
        let text = resp.text().await?;

        if !status.is_success() {
            return Err(VaultError::Vault(format!("HTTP {}: {}", status, text)));
        }

        // Try parsing as error response first
        if let Ok(err) = serde_json::from_str::<VaultErrorResponse>(&text) {
            return Err(VaultError::Vault(err.error));
        }

        // Parse as success response
        let secret: VaultSecretResponse = serde_json::from_str(&text)
            .map_err(|e| VaultError::Parse(format!("{}: {}", e, text)))?;

        Ok(secret.decrypted_secret)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vault_client_creation() {
        let client = VaultClient::new("https://test.supabase.co", "service-role-key");
        assert_eq!(client.base_url, "https://test.supabase.co");
        assert_eq!(client.service_role_key, "service-role-key");
    }

    #[test]
    fn test_vault_client_trims_trailing_slash() {
        let client = VaultClient::new("https://test.supabase.co/", "key");
        assert_eq!(client.base_url, "https://test.supabase.co");
    }

    #[test]
    fn test_headers_include_apikey_and_auth() {
        let client = VaultClient::new("https://test.supabase.co", "my-key");
        let headers = client.headers();
        assert_eq!(headers.get("apikey").unwrap(), "my-key");
        assert_eq!(headers.get(AUTHORIZATION).unwrap(), "Bearer my-key");
        assert_eq!(headers.get(CONTENT_TYPE).unwrap(), "application/json");
    }

    #[test]
    fn test_vault_get_request_serialization() {
        let req = VaultGetRequest {
            command: "get",
            secret_id: "39781c47-be8f-4a10-ae3a-714da299ca07",
        };
        let json = serde_json::to_value(&req).unwrap();
        assert_eq!(json["command"], "get");
        assert_eq!(json["secret_id"], "39781c47-be8f-4a10-ae3a-714da299ca07");
    }

    #[test]
    fn test_vault_secret_response_deserialization() {
        let json = r#"{
            "id": "39781c47-be8f-4a10-ae3a-714da299ca07",
            "name": "service/discord-bot-token",
            "description": "Discord bot token",
            "decrypted_secret": "MTIzNDU2Nzg5MDEyMzQ1Njc4OQ.example.token",
            "created_at": "2025-01-01T00:00:00Z",
            "updated_at": "2025-01-01T00:00:00Z"
        }"#;
        let resp: VaultSecretResponse = serde_json::from_str(json).unwrap();
        assert_eq!(
            resp.decrypted_secret,
            "MTIzNDU2Nzg5MDEyMzQ1Njc4OQ.example.token"
        );
        assert_eq!(resp.name, "service/discord-bot-token");
    }

    #[test]
    fn test_vault_error_response_deserialization() {
        let json = r#"{"error": "secret not found"}"#;
        let resp: VaultErrorResponse = serde_json::from_str(json).unwrap();
        assert_eq!(resp.error, "secret not found");
    }

    #[test]
    fn test_vault_error_display() {
        let err = VaultError::Config("missing url".to_string());
        assert_eq!(err.to_string(), "Missing configuration: missing url");

        let err = VaultError::Vault("not found".to_string());
        assert_eq!(err.to_string(), "Vault returned error: not found");
    }
}
