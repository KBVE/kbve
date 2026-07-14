// Profile service - Username lookup and provider fetching

use super::supabase::{SupabaseClient, SupabaseConfig};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;
use utoipa::ToSchema;

// Static regex for username validation. Superset of the canonical DB rule
// `^[a-z0-9_-]{3,63}$` (uppercase tolerated so user-typed names still validate);
// the DB remains the strict authority on writes. Must accept anything the DB
// stores or `/@username` lookups 400 on valid accounts (hyphens, digit-leading,
// OAuth auto-generated names).
static USERNAME_REGEX: OnceLock<Regex> = OnceLock::new();

fn get_username_regex() -> &'static Regex {
    USERNAME_REGEX
        .get_or_init(|| Regex::new(r"^[a-zA-Z0-9_-]{3,63}$").expect("Invalid username regex"))
}

/// Username validation error
#[derive(Debug, Clone)]
pub enum UsernameError {
    TooShort,
    TooLong,
    InvalidCharacters,
    #[allow(dead_code)]
    MustStartWithLetter,
    Empty,
}

impl std::fmt::Display for UsernameError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            UsernameError::TooShort => write!(f, "Username must be at least 3 characters"),
            UsernameError::TooLong => write!(f, "Username must be at most 63 characters"),
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

    if trimmed.len() > 63 {
        return Err(UsernameError::TooLong);
    }

    // Full regex validation
    if !get_username_regex().is_match(trimmed) {
        return Err(UsernameError::InvalidCharacters);
    }

    Ok(trimmed.to_lowercase())
}

/// User provider information from get_user_all_providers RPC
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct UserProvider {
    pub provider: String,
    pub provider_id: String,
    pub linked_at: Option<String>,
    pub last_sign_in_at: Option<String>,
    #[schema(value_type = Option<Object>)]
    pub identity_data: Option<serde_json::Value>,
    pub email: Option<String>,
    pub username: Option<String>,
    pub avatar_url: Option<String>,
}

/// Aggregated user profile with all providers
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
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
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
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
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct GithubInfo {
    pub id: String,
    pub username: Option<String>,
    pub avatar_url: Option<String>,
}

/// Twitch-specific information extracted from provider data
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
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

    /// Extract Discord/GitHub/Twitch info from a provider list. Avatar URLs and
    /// display names may live in top-level fields or inside `identity_data`, so
    /// each provider tries multiple fields in priority order. Enrichment fields
    /// (guild membership, live status, role names) are left unset here.
    fn extract_provider_infos(
        providers: &[UserProvider],
    ) -> (Option<DiscordInfo>, Option<GithubInfo>, Option<TwitchInfo>) {
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

            // Twitch display name lives in identity_data; p.username is the site
            // username, not the Twitch handle — prefer identity_data fields.
            let username = p
                .identity_data
                .as_ref()
                .and_then(|d| {
                    d.get("nickname")
                        .or_else(|| d.get("name"))
                        .or_else(|| d.get("ref"))
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

        (discord, github, twitch)
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
        let (discord, github, twitch) = Self::extract_provider_infos(&providers);

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

        // Step 3: Extract Discord, GitHub, and Twitch info
        let (discord, github, twitch) = Self::extract_provider_infos(&providers);

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

        if text.is_empty() || text == "null" {
            return Err("Failed to set username - no response from database".to_string());
        }

        #[derive(serde::Deserialize)]
        struct UsernameRow {
            username: String,
        }

        let row: UsernameRow = serde_json::from_str(&text)
            .map_err(|e| format!("Failed to parse response: {} (response: {})", e, text))?;

        // Drop any cached lookup (incl. a negative entry from a pre-set
        // `/@username` probe) so the new username surfaces immediately instead
        // of after the 300s TTL.
        if let Some(cache) = crate::db::get_profile_cache() {
            cache.invalidate(&row.username);
        }

        tracing::info!("Username '{}' set for user {}", row.username, user_id);
        Ok(row.username)
    }

    /// Batch resolve `user_id → username` via direct PostgREST SELECT on
    /// `profile.username`. Single round-trip with `?user_id=in.(…)`.
    /// Missing rows (user with no username set) are absent from the map.
    pub async fn get_usernames_by_ids(
        &self,
        ids: &[String],
    ) -> Result<std::collections::HashMap<String, String>, String> {
        if ids.is_empty() {
            return Ok(std::collections::HashMap::new());
        }
        // Cap at 100 to keep the URL bounded and the planner happy.
        let mut deduped: Vec<&str> = ids.iter().map(|s| s.as_str()).collect();
        deduped.sort();
        deduped.dedup();
        if deduped.len() > 100 {
            deduped.truncate(100);
        }
        let in_filter = format!("in.({})", deduped.join(","));

        let url = format!("{}/username", self.client.config().rest_url());
        let headers = self.client.rpc_headers("profile")?;

        let response = self
            .client
            .client()
            .get(&url)
            .headers(headers)
            .query(&[
                ("select", "user_id,username"),
                ("user_id", in_filter.as_str()),
            ])
            .send()
            .await
            .map_err(|e| format!("profile.username network error: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("profile.username {} → {}", status, body));
        }

        #[derive(Deserialize)]
        struct Row {
            user_id: String,
            username: String,
        }
        let rows: Vec<Row> = response
            .json()
            .await
            .map_err(|e| format!("profile.username parse: {}", e))?;
        Ok(rows.into_iter().map(|r| (r.user_id, r.username)).collect())
    }

    /// Get username by user_id using RPC
    pub async fn get_username_by_id(&self, user_id: &str) -> Result<Option<String>, String> {
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
