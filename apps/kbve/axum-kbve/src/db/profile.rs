// Profile service - Username lookup and provider fetching

use super::supabase::{SupabaseClient, SupabaseConfig};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

// Static regex for username validation
// Rules: 3-24 characters, alphanumeric + underscore, must start with letter
static USERNAME_REGEX: OnceLock<Regex> = OnceLock::new();

fn get_username_regex() -> &'static Regex {
    USERNAME_REGEX.get_or_init(|| {
        Regex::new(r"^[a-zA-Z][a-zA-Z0-9_]{2,23}$").expect("Invalid username regex")
    })
}

/// Username validation error
#[derive(Debug, Clone)]
pub enum UsernameError {
    TooShort,
    TooLong,
    InvalidCharacters,
    MustStartWithLetter,
    Empty,
}

impl std::fmt::Display for UsernameError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            UsernameError::TooShort => write!(f, "Username must be at least 3 characters"),
            UsernameError::TooLong => write!(f, "Username must be at most 24 characters"),
            UsernameError::InvalidCharacters => write!(
                f,
                "Username can only contain letters, numbers, and underscores"
            ),
            UsernameError::MustStartWithLetter => write!(f, "Username must start with a letter"),
            UsernameError::Empty => write!(f, "Username cannot be empty"),
        }
    }
}

/// Validate a username before making any database calls
/// Returns the sanitized (lowercased) username if valid
pub fn validate_username(username: &str) -> Result<String, UsernameError> {
    let trimmed = username.trim();

    if trimmed.is_empty() {
        return Err(UsernameError::Empty);
    }

    if trimmed.len() < 3 {
        return Err(UsernameError::TooShort);
    }

    if trimmed.len() > 24 {
        return Err(UsernameError::TooLong);
    }

    // Check first character is a letter
    if !trimmed
        .chars()
        .next()
        .map(|c| c.is_ascii_alphabetic())
        .unwrap_or(false)
    {
        return Err(UsernameError::MustStartWithLetter);
    }

    // Full regex validation
    if !get_username_regex().is_match(trimmed) {
        return Err(UsernameError::InvalidCharacters);
    }

    Ok(trimmed.to_lowercase())
}

/// User provider information from get_user_all_providers RPC
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserProvider {
    pub provider: String,
    pub provider_id: String,
    pub linked_at: Option<String>,
    pub last_sign_in_at: Option<String>,
    pub identity_data: Option<serde_json::Value>,
    pub email: Option<String>,
    pub username: Option<String>,
    pub avatar_url: Option<String>,
}

/// Aggregated user profile with all providers
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserProfile {
    pub user_id: String,
    pub username: String,
    pub providers: Vec<UserProvider>,
    pub discord: Option<DiscordInfo>,
    pub github: Option<GithubInfo>,
    pub twitch: Option<TwitchInfo>,
    pub rentearth: Option<super::rentearth::RentEarthProfile>,
}

/// Discord-specific information extracted from provider data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscordInfo {
    pub id: String,
    pub username: Option<String>,
    pub avatar_url: Option<String>,
    /// Whether the user is a member of the KBVE Discord guild
    pub is_guild_member: Option<bool>,
    /// User's nickname in the KBVE guild (if set)
    pub guild_nickname: Option<String>,
    /// When the user joined the KBVE guild (ISO8601 timestamp)
    pub joined_at: Option<String>,
    /// Role IDs the user has in the KBVE guild
    pub role_ids: Vec<String>,
    /// Role names resolved from role IDs (cached on server startup)
    pub role_names: Vec<String>,
    /// Whether the user is boosting the server
    pub is_boosting: Option<bool>,
}

/// GitHub-specific information extracted from provider data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubInfo {
    pub id: String,
    pub username: Option<String>,
    pub avatar_url: Option<String>,
}

/// Twitch-specific information extracted from provider data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TwitchInfo {
    pub id: String,
    pub username: Option<String>,
    pub avatar_url: Option<String>,
    /// Whether the user is currently live streaming
    pub is_live: Option<bool>,
}

/// Profile service for user lookups
pub struct ProfileService {
    client: SupabaseClient,
}

impl ProfileService {
    /// Create a new profile service
    pub fn new(config: SupabaseConfig) -> Result<Self, String> {
        let client = SupabaseClient::new(config)?;
        Ok(Self { client })
    }

    /// Get user ID by username using get_id_by_username RPC
    pub async fn get_id_by_username(&self, username: &str) -> Result<Option<String>, String> {
        let url = self.client.config().rpc_url("get_id_by_username");
        let headers = self.client.rpc_headers("profile")?;

        let payload = serde_json::json!({
            "p_username": username.to_lowercase()
        });

        let response = self
            .client
            .client()
            .post(&url)
            .headers(headers)
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("Network error: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("Database error: {} - {}", status, body));
        }

        let text = response
            .text()
            .await
            .map_err(|e| format!("Failed to read response: {}", e))?;

        // RPC returns the UUID directly as a JSON string, or null
        if text.is_empty() || text == "null" {
            return Ok(None);
        }

        // Parse as JSON string (UUID is returned as quoted string)
        let uuid: String = serde_json::from_str(&text)
            .map_err(|e| format!("Failed to parse UUID: {} (response: {})", e, text))?;

        Ok(Some(uuid))
    }

    /// Get all providers for a user using get_user_all_providers RPC
    pub async fn get_user_providers(&self, user_id: &str) -> Result<Vec<UserProvider>, String> {
        let url = self.client.config().rpc_url("get_user_all_providers");
        let headers = self.client.rpc_headers("tracker")?;

        let payload = serde_json::json!({
            "p_user_id": user_id
        });

        let response = self
            .client
            .client()
            .post(&url)
            .headers(headers)
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("Network error: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("Database error: {} - {}", status, body));
        }

        let providers: Vec<UserProvider> = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse providers: {}", e))?;

        Ok(providers)
    }

    /// Get complete user profile by username
    /// Validates username format before making any database calls
    pub async fn get_profile_by_username(
        &self,
        username: &str,
    ) -> Result<Option<UserProfile>, String> {
        // Step 0: Validate username format (prevents unnecessary DB calls)
        let validated_username =
            validate_username(username).map_err(|e| format!("Invalid username: {}", e))?;

        // Step 1: Get user ID from username
        let user_id = match self.get_id_by_username(&validated_username).await? {
            Some(id) => id,
            None => return Ok(None),
        };

        // Step 2: Get all providers for the user
        let providers = self.get_user_providers(&user_id).await?;

        // Step 3: Extract Discord, GitHub, and Twitch info
        // Avatar URLs may be in top-level avatar_url or inside identity_data
        let discord = providers.iter().find(|p| p.provider == "discord").map(|p| {
            let avatar_url = p.avatar_url.clone().or_else(|| {
                p.identity_data
                    .as_ref()
                    .and_then(|d| d.get("avatar_url"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
            });

            // Debug log the identity_data structure to see what fields are available
            tracing::debug!(
                "Discord provider - provider_id: {}, username: {:?}, identity_data: {:?}",
                p.provider_id,
                p.username,
                p.identity_data
            );

            // Try multiple fields for Discord username
            let username = p.username.clone().or_else(|| {
                p.identity_data.as_ref().and_then(|d| {
                    // Try various Discord username fields in priority order
                    d.get("full_name")
                        .or_else(|| d.get("name"))
                        .or_else(|| d.get("global_name"))
                        .or_else(|| d.get("custom_claims").and_then(|c| c.get("global_name")))
                        .or_else(|| d.get("preferred_username"))
                        .or_else(|| d.get("user_name"))
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                })
            });

            DiscordInfo {
                id: p.provider_id.clone(),
                username,
                avatar_url,
                is_guild_member: None, // Will be set by Discord enrichment
                guild_nickname: None,
                joined_at: None,
                role_ids: Vec::new(),
                role_names: Vec::new(), // Will be set by Discord enrichment
                is_boosting: None,
            }
        });

        let github = providers.iter().find(|p| p.provider == "github").map(|p| {
            // For GitHub, prefer identity_data.avatar_url as it's more reliable
            // The top-level avatar_url might be from a different provider
            let avatar_url = p
                .identity_data
                .as_ref()
                .and_then(|d| d.get("avatar_url"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .or_else(|| p.avatar_url.clone());

            tracing::debug!(
                "GitHub provider - top-level avatar_url: {:?}, identity_data avatar_url: {:?}",
                p.avatar_url,
                p.identity_data.as_ref().and_then(|d| d.get("avatar_url"))
            );

            GithubInfo {
                id: p.provider_id.clone(),
                username: p.username.clone().or_else(|| {
                    p.identity_data
                        .as_ref()
                        .and_then(|d| d.get("user_name").or_else(|| d.get("preferred_username")))
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                }),
                avatar_url,
            }
        });

        let twitch = providers.iter().find(|p| p.provider == "twitch").map(|p| {
            let avatar_url = p.avatar_url.clone().or_else(|| {
                p.identity_data
                    .as_ref()
                    .and_then(|d| d.get("avatar_url").or_else(|| d.get("picture")))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
            });

            // Debug log the identity_data structure
            tracing::debug!(
                "Twitch provider - provider_id: {}, username: {:?}, identity_data: {:?}",
                p.provider_id,
                p.username,
                p.identity_data
            );

            // For Twitch, prefer identity_data fields over p.username
            // because p.username comes from profiles table (site username),
            // not the actual Twitch display name
            let username = p
                .identity_data
                .as_ref()
                .and_then(|d| {
                    d.get("nickname")
                        .or_else(|| d.get("name"))
                        .or_else(|| d.get("slug"))
                        .or_else(|| d.get("preferred_username"))
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                })
                .or_else(|| p.username.clone());

            TwitchInfo {
                id: p.provider_id.clone(),
                username,
                avatar_url,
                is_live: None, // Will be set by Twitch enrichment
            }
        });

        Ok(Some(UserProfile {
            user_id,
            username: username.to_string(),
            providers,
            discord,
            github,
            twitch,
            rentearth: None, // Populated by transport layer via RentEarthService
        }))
    }

    /// Get complete user profile by user_id (UUID)
    /// Used for authenticated /me endpoints where we have the user_id from JWT
    pub async fn get_profile_by_user_id(
        &self,
        user_id: &str,
    ) -> Result<Option<UserProfile>, String> {
        // Step 1: Get username from user_id using RPC
        let username = match self.get_username_by_id(user_id).await? {
            Some(name) => name,
            None => return Ok(None),
        };

        // Step 2: Reuse the existing get_profile_by_username logic
        // (providers are already fetched by user_id internally)
        let providers = self.get_user_providers(user_id).await?;

        // Step 3: Extract Discord, GitHub, and Twitch info (same logic as get_profile_by_username)
        let discord = providers.iter().find(|p| p.provider == "discord").map(|p| {
            let avatar_url = p.avatar_url.clone().or_else(|| {
                p.identity_data
                    .as_ref()
                    .and_then(|d| d.get("avatar_url"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
            });

            let username = p.username.clone().or_else(|| {
                p.identity_data.as_ref().and_then(|d| {
                    d.get("full_name")
                        .or_else(|| d.get("name"))
                        .or_else(|| d.get("global_name"))
                        .or_else(|| d.get("custom_claims").and_then(|c| c.get("global_name")))
                        .or_else(|| d.get("preferred_username"))
                        .or_else(|| d.get("user_name"))
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                })
            });

            DiscordInfo {
                id: p.provider_id.clone(),
                username,
                avatar_url,
                is_guild_member: None,
                guild_nickname: None,
                joined_at: None,
                role_ids: Vec::new(),
                role_names: Vec::new(),
                is_boosting: None,
            }
        });

        let github = providers.iter().find(|p| p.provider == "github").map(|p| {
            let avatar_url = p
                .identity_data
                .as_ref()
                .and_then(|d| d.get("avatar_url"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .or_else(|| p.avatar_url.clone());

            GithubInfo {
                id: p.provider_id.clone(),
                username: p.username.clone().or_else(|| {
                    p.identity_data
                        .as_ref()
                        .and_then(|d| d.get("user_name").or_else(|| d.get("preferred_username")))
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                }),
                avatar_url,
            }
        });

        let twitch = providers.iter().find(|p| p.provider == "twitch").map(|p| {
            let avatar_url = p.avatar_url.clone().or_else(|| {
                p.identity_data
                    .as_ref()
                    .and_then(|d| d.get("avatar_url").or_else(|| d.get("picture")))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
            });

            let username = p
                .identity_data
                .as_ref()
                .and_then(|d| {
                    d.get("nickname")
                        .or_else(|| d.get("name"))
                        .or_else(|| d.get("slug"))
                        .or_else(|| d.get("preferred_username"))
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                })
                .or_else(|| p.username.clone());

            TwitchInfo {
                id: p.provider_id.clone(),
                username,
                avatar_url,
                is_live: None,
            }
        });

        Ok(Some(UserProfile {
            user_id: user_id.to_string(),
            username,
            providers,
            discord,
            github,
            twitch,
            rentearth: None,
        }))
    }

    /// Set username for authenticated user using service_add_username RPC
    /// This validates the username at the Axum level before calling the RPC
    /// The RPC also validates and normalizes at the database level (belt and suspenders)
    ///
    /// Security: Axum has already verified the JWT and extracted user_id.
    /// We pass user_id as a parameter and use service role key (like rentearth pattern).
    /// The SQL function validates that the user doesn't already have a username.
    ///
    /// Returns Ok(canonical_username) on success, or Err with descriptive message on failure
    pub async fn set_username(&self, user_id: &str, username: &str) -> Result<String, String> {
        // Step 1: Validate username format at Axum level (belt)
        let validated =
            validate_username(username).map_err(|e| format!("Invalid username: {}", e))?;

        // Step 2: Call service_add_username RPC with service role key (suspenders - also validates/normalizes)
        // Using service key + user_id parameter (same pattern as rentearth)
        let url = self.client.config().rpc_url("service_add_username");
        let headers = self.client.rpc_headers("profile")?;

        let payload = serde_json::json!({
            "p_user_id": user_id,
            "p_username": validated
        });

        let response = self
            .client
            .client()
            .post(&url)
            .headers(headers)
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("Network error: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();

            // Parse Supabase error response for better error messages
            if let Ok(error_json) = serde_json::from_str::<serde_json::Value>(&body) {
                if let Some(message) = error_json.get("message").and_then(|m| m.as_str()) {
                    // Check for known error patterns from the RPC
                    if message.contains("already") || message.contains("taken") {
                        return Err("Username already taken".to_string());
                    }
                    if message.contains("has a username") {
                        return Err("You already have a username set".to_string());
                    }
                    return Err(message.to_string());
                }
            }

            return Err(format!("Database error: {} - {}", status, body));
        }

        let text = response
            .text()
            .await
            .map_err(|e| format!("Failed to read response: {}", e))?;

        // RPC returns the canonical username as a JSON string
        if text.is_empty() || text == "null" {
            return Err("Failed to set username - no response from database".to_string());
        }

        let canonical: String = serde_json::from_str(&text)
            .map_err(|e| format!("Failed to parse response: {} (response: {})", e, text))?;

        tracing::info!("Username '{}' set for user {}", canonical, user_id);
        Ok(canonical)
    }

    /// Get username by user_id using RPC
    async fn get_username_by_id(&self, user_id: &str) -> Result<Option<String>, String> {
        let url = self.client.config().rpc_url("get_username_by_id");
        let headers = self.client.rpc_headers("profile")?;

        let payload = serde_json::json!({
            "p_user_id": user_id
        });

        let response = self
            .client
            .client()
            .post(&url)
            .headers(headers)
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("Network error: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("Database error: {} - {}", status, body));
        }

        let text = response
            .text()
            .await
            .map_err(|e| format!("Failed to read response: {}", e))?;

        if text.is_empty() || text == "null" {
            return Ok(None);
        }

        let username: String = serde_json::from_str(&text)
            .map_err(|e| format!("Failed to parse username: {} (response: {})", e, text))?;

        Ok(Some(username))
    }
}

// Global singleton for ProfileService
static PROFILE_SERVICE: OnceLock<Option<ProfileService>> = OnceLock::new();

/// Initialize the global profile service
pub fn init_profile_service() -> bool {
    PROFILE_SERVICE
        .get_or_init(|| match SupabaseConfig::from_env() {
            Ok(config) => {
                if config.service_role_key.is_none() {
                    tracing::warn!("ProfileService disabled: no service role key");
                    return None;
                }
                match ProfileService::new(config) {
                    Ok(service) => {
                        tracing::info!("ProfileService initialized");
                        Some(service)
                    }
                    Err(e) => {
                        tracing::error!("Failed to create ProfileService: {}", e);
                        None
                    }
                }
            }
            Err(e) => {
                tracing::error!("Failed to load Supabase config: {}", e);
                None
            }
        })
        .is_some()
}

/// Get the global profile service
pub fn get_profile_service() -> Option<&'static ProfileService> {
    PROFILE_SERVICE.get().and_then(|s| s.as_ref())
}
