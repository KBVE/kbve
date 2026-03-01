// Twitch API client for fetching user and stream information
//
// Uses Client Credentials OAuth flow with automatic token refresh.
// Fetches user profile data and live stream status.

use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;

const TWITCH_API_BASE: &str = "https://api.twitch.tv/helix";
const TWITCH_OAUTH_URL: &str = "https://id.twitch.tv/oauth2/token";
// Refresh token 1 hour before expiry to be safe
const TOKEN_REFRESH_BUFFER_SECS: u64 = 3600;

/// Twitch OAuth token response
#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    expires_in: u64,
    #[allow(dead_code)]
    token_type: String,
}

/// Internal token state with expiry tracking
struct TokenState {
    access_token: String,
    expires_at: Instant,
}

/// Twitch user data from API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TwitchUser {
    pub id: String,
    pub login: String,
    pub display_name: String,
    pub profile_image_url: String,
    pub description: String,
    pub created_at: String,
}

/// Twitch stream data from API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TwitchStream {
    pub id: String,
    pub user_id: String,
    pub user_login: String,
    pub user_name: String,
    pub game_name: String,
    pub title: String,
    pub viewer_count: u64,
    pub started_at: String,
    pub thumbnail_url: String,
}

/// Twitch API response wrapper for users
#[derive(Debug, Deserialize)]
struct UsersResponse {
    data: Vec<TwitchUser>,
}

/// Twitch API response wrapper for streams
#[derive(Debug, Deserialize)]
struct StreamsResponse {
    data: Vec<TwitchStream>,
}

/// Configuration for Twitch API client
#[derive(Clone)]
pub struct TwitchConfig {
    pub client_id: String,
    pub client_secret: String,
}

impl TwitchConfig {
    /// Load configuration from environment variables
    pub fn from_env() -> Result<Self, String> {
        let client_id =
            std::env::var("TWITCH_CLIENT_ID").map_err(|_| "TWITCH_CLIENT_ID not set")?;
        let client_secret =
            std::env::var("TWITCH_CLIENT_SECRET").map_err(|_| "TWITCH_CLIENT_SECRET not set")?;

        Ok(Self {
            client_id,
            client_secret,
        })
    }
}

/// Twitch API client with auto-refreshing OAuth
pub struct TwitchClient {
    client: Client,
    config: TwitchConfig,
    token: RwLock<Option<TokenState>>,
}

impl TwitchClient {
    /// Create a new Twitch client
    pub fn new(config: TwitchConfig) -> Result<Self, String> {
        let client = Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

        Ok(Self {
            client,
            config,
            token: RwLock::new(None),
        })
    }

    /// Fetch a new OAuth token using client credentials flow
    async fn fetch_token(&self) -> Result<TokenState, String> {
        let response = self
            .client
            .post(TWITCH_OAUTH_URL)
            .form(&[
                ("client_id", &self.config.client_id),
                ("client_secret", &self.config.client_secret),
                ("grant_type", &"client_credentials".to_string()),
            ])
            .send()
            .await
            .map_err(|e| format!("Token request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("Token request failed: {} - {}", status, body));
        }

        let token_response: TokenResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse token response: {}", e))?;

        tracing::debug!(
            "Twitch OAuth token obtained, expires in {} seconds",
            token_response.expires_in
        );

        Ok(TokenState {
            access_token: token_response.access_token,
            expires_at: Instant::now() + Duration::from_secs(token_response.expires_in),
        })
    }

    /// Get a valid access token, refreshing if necessary
    async fn get_token(&self) -> Result<String, String> {
        // Check if we have a valid token
        {
            let token_guard = self.token.read().await;
            if let Some(ref state) = *token_guard {
                let buffer = Duration::from_secs(TOKEN_REFRESH_BUFFER_SECS);
                if state.expires_at > Instant::now() + buffer {
                    return Ok(state.access_token.clone());
                }
            }
        }

        // Need to refresh token
        tracing::info!("Refreshing Twitch OAuth token");
        let new_state = self.fetch_token().await?;
        let token = new_state.access_token.clone();

        let mut token_guard = self.token.write().await;
        *token_guard = Some(new_state);

        Ok(token)
    }

    /// Get user by login name
    pub async fn get_user_by_login(&self, login: &str) -> Result<Option<TwitchUser>, String> {
        let token = self.get_token().await?;
        let url = format!("{}/users?login={}", TWITCH_API_BASE, login);

        let response = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {}", token))
            .header("Client-Id", &self.config.client_id)
            .send()
            .await
            .map_err(|e| format!("Twitch API request failed: {}", e))?;

        match response.status().as_u16() {
            200 => {
                let users: UsersResponse = response
                    .json()
                    .await
                    .map_err(|e| format!("Failed to parse Twitch response: {}", e))?;
                Ok(users.data.into_iter().next())
            }
            401 => {
                // Token might have been invalidated, clear it
                tracing::warn!("Twitch API returned 401, token may be invalid");
                let mut token_guard = self.token.write().await;
                *token_guard = None;
                Err("Twitch authentication failed".to_string())
            }
            429 => {
                tracing::warn!("Twitch API rate limited");
                Err("Rate limited by Twitch API".to_string())
            }
            status => {
                let body = response.text().await.unwrap_or_default();
                tracing::error!("Twitch API error {}: {}", status, body);
                Err(format!("Twitch API error: {}", status))
            }
        }
    }

    /// Get user by ID
    #[allow(dead_code)]
    pub async fn get_user_by_id(&self, user_id: &str) -> Result<Option<TwitchUser>, String> {
        let token = self.get_token().await?;
        let url = format!("{}/users?id={}", TWITCH_API_BASE, user_id);

        let response = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {}", token))
            .header("Client-Id", &self.config.client_id)
            .send()
            .await
            .map_err(|e| format!("Twitch API request failed: {}", e))?;

        match response.status().as_u16() {
            200 => {
                let users: UsersResponse = response
                    .json()
                    .await
                    .map_err(|e| format!("Failed to parse Twitch response: {}", e))?;
                Ok(users.data.into_iter().next())
            }
            401 => {
                tracing::warn!("Twitch API returned 401, token may be invalid");
                let mut token_guard = self.token.write().await;
                *token_guard = None;
                Err("Twitch authentication failed".to_string())
            }
            429 => {
                tracing::warn!("Twitch API rate limited");
                Err("Rate limited by Twitch API".to_string())
            }
            status => {
                let body = response.text().await.unwrap_or_default();
                tracing::error!("Twitch API error {}: {}", status, body);
                Err(format!("Twitch API error: {}", status))
            }
        }
    }

    /// Check if a user is currently live streaming
    #[allow(dead_code)]
    pub async fn get_stream_by_user_id(
        &self,
        user_id: &str,
    ) -> Result<Option<TwitchStream>, String> {
        let token = self.get_token().await?;
        let url = format!("{}/streams?user_id={}", TWITCH_API_BASE, user_id);

        let response = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {}", token))
            .header("Client-Id", &self.config.client_id)
            .send()
            .await
            .map_err(|e| format!("Twitch API request failed: {}", e))?;

        match response.status().as_u16() {
            200 => {
                let streams: StreamsResponse = response
                    .json()
                    .await
                    .map_err(|e| format!("Failed to parse Twitch response: {}", e))?;
                // If data is empty, user is not live
                Ok(streams.data.into_iter().next())
            }
            401 => {
                tracing::warn!("Twitch API returned 401, token may be invalid");
                let mut token_guard = self.token.write().await;
                *token_guard = None;
                Err("Twitch authentication failed".to_string())
            }
            429 => {
                tracing::warn!("Twitch API rate limited");
                Err("Rate limited by Twitch API".to_string())
            }
            status => {
                let body = response.text().await.unwrap_or_default();
                tracing::error!("Twitch API error {}: {}", status, body);
                Err(format!("Twitch API error: {}", status))
            }
        }
    }

    /// Check if a user is live by their login name
    pub async fn is_user_live(&self, login: &str) -> Result<bool, String> {
        let token = self.get_token().await?;
        let url = format!("{}/streams?user_login={}", TWITCH_API_BASE, login);

        let response = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {}", token))
            .header("Client-Id", &self.config.client_id)
            .send()
            .await
            .map_err(|e| format!("Twitch API request failed: {}", e))?;

        match response.status().as_u16() {
            200 => {
                let streams: StreamsResponse = response
                    .json()
                    .await
                    .map_err(|e| format!("Failed to parse Twitch response: {}", e))?;
                Ok(!streams.data.is_empty())
            }
            401 => {
                tracing::warn!("Twitch API returned 401, token may be invalid");
                let mut token_guard = self.token.write().await;
                *token_guard = None;
                Err("Twitch authentication failed".to_string())
            }
            429 => {
                tracing::warn!("Twitch API rate limited");
                Err("Rate limited by Twitch API".to_string())
            }
            status => {
                let body = response.text().await.unwrap_or_default();
                tracing::error!("Twitch API error {}: {}", status, body);
                Err(format!("Twitch API error: {}", status))
            }
        }
    }
}

// Global Twitch client singleton
static TWITCH_CLIENT: OnceLock<Option<TwitchClient>> = OnceLock::new();

/// Initialize the global Twitch client (async - fetches initial token)
pub async fn init_twitch_client() -> bool {
    // We need to handle async initialization differently
    // First check if already initialized
    if TWITCH_CLIENT.get().is_some() {
        return TWITCH_CLIENT.get().unwrap().is_some();
    }

    let result = match TwitchConfig::from_env() {
        Ok(config) => {
            match TwitchClient::new(config) {
                Ok(client) => {
                    // Try to fetch initial token to validate credentials
                    match client.get_token().await {
                        Ok(_) => {
                            tracing::info!("Twitch client initialized with valid token");
                            Some(client)
                        }
                        Err(e) => {
                            tracing::error!("Failed to fetch initial Twitch token: {}", e);
                            None
                        }
                    }
                }
                Err(e) => {
                    tracing::error!("Failed to create Twitch client: {}", e);
                    None
                }
            }
        }
        Err(e) => {
            tracing::info!("Twitch client not configured: {}", e);
            None
        }
    };

    let is_some = result.is_some();
    // Use get_or_init to handle race conditions
    TWITCH_CLIENT.get_or_init(|| result);
    is_some
}

/// Get the global Twitch client
pub fn get_twitch_client() -> Option<&'static TwitchClient> {
    TWITCH_CLIENT.get().and_then(|c| c.as_ref())
}
