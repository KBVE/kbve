// Discord API client for fetching guild member information
//
// Uses bot token authentication to fetch user details from Discord API.
// Token is fetched from Supabase vault first, with ENV fallback.
// Results are cached in the profile cache actor.

use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;
use tokio::sync::OnceCell;

use super::supabase::{SupabaseClient, SupabaseConfig};

const DISCORD_API_BASE: &str = "https://discord.com/api/v10";

/// Discord bot token vault secret ID
const DISCORD_BOT_TOKEN_VAULT_ID: &str = "39781c47-be8f-4a10-ae3a-714da299ca07";

/// Discord guild member data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscordGuildMember {
    /// User's nickname in the guild (if set)
    pub nick: Option<String>,
    /// User's avatar hash override for this guild
    pub avatar: Option<String>,
    /// Array of role IDs
    pub roles: Vec<String>,
    /// When the user joined the guild (ISO8601 timestamp)
    pub joined_at: Option<String>,
    /// When the user started boosting (if applicable)
    pub premium_since: Option<String>,
    /// Whether the user is deafened in voice channels
    pub deaf: Option<bool>,
    /// Whether the user is muted in voice channels
    pub mute: Option<bool>,
    /// Guild member flags
    pub flags: Option<u64>,
    /// Whether the user has passed membership screening
    pub pending: Option<bool>,
    /// The underlying user object
    pub user: Option<DiscordUser>,
}

/// Discord user object
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscordUser {
    pub id: String,
    pub username: String,
    pub discriminator: String,
    pub global_name: Option<String>,
    pub avatar: Option<String>,
    pub bot: Option<bool>,
    pub banner: Option<String>,
    pub accent_color: Option<u32>,
}

/// Discord guild role object
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscordRole {
    pub id: String,
    pub name: String,
    pub color: u32,
    pub position: i32,
    pub permissions: String,
    pub managed: Option<bool>,
    pub mentionable: Option<bool>,
    pub hoist: Option<bool>,
}

/// Default KBVE Discord guild ID (used if DISCORD_GUILD_ID env var is not set)
const DEFAULT_GUILD_ID: &str = "342732838598082562";

/// Configuration for Discord API client
#[derive(Clone)]
pub struct DiscordConfig {
    pub bot_token: String,
    pub guild_id: String,
}

impl DiscordConfig {
    /// Load configuration from environment variables only (sync fallback)
    pub fn from_env() -> Result<Self, String> {
        let bot_token =
            std::env::var("DISCORD_BOT_TOKEN").map_err(|_| "DISCORD_BOT_TOKEN not set")?;
        let guild_id = std::env::var("DISCORD_GUILD_ID").unwrap_or_else(|_| {
            tracing::info!(
                "DISCORD_GUILD_ID not set, using default: {}",
                DEFAULT_GUILD_ID
            );
            DEFAULT_GUILD_ID.to_string()
        });

        Ok(Self {
            bot_token,
            guild_id,
        })
    }

    /// Load configuration with vault-first strategy
    ///
    /// 1. Try to fetch bot token from Supabase vault
    /// 2. If vault fails, fall back to environment variables
    /// 3. If both fail, return None (don't crash the app)
    ///
    /// Guild ID is loaded from environment variables with a fallback to the default KBVE guild.
    pub async fn from_vault_or_env() -> Option<Self> {
        let guild_id = std::env::var("DISCORD_GUILD_ID").unwrap_or_else(|_| {
            tracing::info!(
                "DISCORD_GUILD_ID not set, using default: {}",
                DEFAULT_GUILD_ID
            );
            DEFAULT_GUILD_ID.to_string()
        });

        // Try vault first
        tracing::info!("Attempting to retrieve Discord bot token from Supabase vault...");

        let bot_token = match Self::fetch_token_from_vault().await {
            Ok(token) => {
                let preview = if token.len() >= 8 {
                    &token[..8]
                } else {
                    &token[..token.len() / 2]
                };
                tracing::info!(
                    "Successfully retrieved Discord bot token from vault (token: {}...)",
                    preview
                );
                token
            }
            Err(vault_err) => {
                tracing::error!("Vault fetch failed: {}", vault_err);
                tracing::warn!("Falling back to environment variables for Discord bot token...");

                // Fallback to ENV
                match std::env::var("DISCORD_BOT_TOKEN") {
                    Ok(token) => {
                        let preview = if token.len() >= 8 {
                            &token[..8]
                        } else {
                            &token[..token.len() / 2]
                        };
                        tracing::warn!(
                            "Using Discord bot token from environment variables (token: {}...)",
                            preview
                        );
                        token
                    }
                    Err(_) => {
                        tracing::error!(
                            "Failed to retrieve Discord bot token from both vault and environment variables"
                        );
                        tracing::error!("Discord features will be unavailable");
                        return None;
                    }
                }
            }
        };

        Some(Self {
            bot_token,
            guild_id,
        })
    }

    /// Fetch bot token from Supabase vault
    async fn fetch_token_from_vault() -> Result<String, String> {
        // Create Supabase client
        let supabase_config =
            SupabaseConfig::from_env().map_err(|e| format!("Supabase config error: {}", e))?;

        let supabase_client = SupabaseClient::new(supabase_config)
            .map_err(|e| format!("Supabase client error: {}", e))?;

        // Fetch from vault
        supabase_client
            .get_vault_secret(DISCORD_BOT_TOKEN_VAULT_ID)
            .await
    }
}

/// Cached guild roles (role_id -> role_name)
/// Loaded once at startup and used to map role IDs to names
static GUILD_ROLES_CACHE: OnceCell<std::collections::HashMap<String, String>> =
    OnceCell::const_new();

/// Discord API client
pub struct DiscordClient {
    client: Client,
    config: DiscordConfig,
}

impl DiscordClient {
    /// Create a new Discord client
    pub fn new(config: DiscordConfig) -> Result<Self, String> {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

        Ok(Self { client, config })
    }

    /// Get guild member by user ID
    /// GET /guilds/{guild.id}/members/{user.id}
    pub async fn get_guild_member(
        &self,
        user_id: &str,
    ) -> Result<Option<DiscordGuildMember>, String> {
        let url = format!(
            "{}/guilds/{}/members/{}",
            DISCORD_API_BASE, self.config.guild_id, user_id
        );

        let response = self
            .client
            .get(&url)
            .header("Authorization", format!("Bot {}", self.config.bot_token))
            .header("User-Agent", "KBVE-Bot/1.0")
            .send()
            .await
            .map_err(|e| format!("Discord API request failed: {}", e))?;

        match response.status().as_u16() {
            200 => {
                let member: DiscordGuildMember = response
                    .json()
                    .await
                    .map_err(|e| format!("Failed to parse Discord response: {}", e))?;
                Ok(Some(member))
            }
            404 => {
                // User not in guild
                Ok(None)
            }
            429 => {
                // Rate limited
                tracing::warn!("Discord API rate limited");
                Err("Rate limited by Discord API".to_string())
            }
            status => {
                let body = response.text().await.unwrap_or_default();
                tracing::error!("Discord API error {}: {}", status, body);
                Err(format!("Discord API error: {}", status))
            }
        }
    }

    /// Get user by ID (doesn't require guild membership)
    /// GET /users/{user.id}
    pub async fn get_user(&self, user_id: &str) -> Result<Option<DiscordUser>, String> {
        let url = format!("{}/users/{}", DISCORD_API_BASE, user_id);

        let response = self
            .client
            .get(&url)
            .header("Authorization", format!("Bot {}", self.config.bot_token))
            .header("User-Agent", "KBVE-Bot/1.0")
            .send()
            .await
            .map_err(|e| format!("Discord API request failed: {}", e))?;

        match response.status().as_u16() {
            200 => {
                let user: DiscordUser = response
                    .json()
                    .await
                    .map_err(|e| format!("Failed to parse Discord response: {}", e))?;
                Ok(Some(user))
            }
            404 => Ok(None),
            429 => {
                tracing::warn!("Discord API rate limited");
                Err("Rate limited by Discord API".to_string())
            }
            status => {
                let body = response.text().await.unwrap_or_default();
                tracing::error!("Discord API error {}: {}", status, body);
                Err(format!("Discord API error: {}", status))
            }
        }
    }

    /// Build avatar URL for a user
    pub fn avatar_url(user_id: &str, avatar_hash: &str) -> String {
        let ext = if avatar_hash.starts_with("a_") {
            "gif"
        } else {
            "png"
        };
        format!(
            "https://cdn.discordapp.com/avatars/{}/{}.{}?size=256",
            user_id, avatar_hash, ext
        )
    }

    /// Build guild-specific avatar URL
    pub fn guild_avatar_url(guild_id: &str, user_id: &str, avatar_hash: &str) -> String {
        let ext = if avatar_hash.starts_with("a_") {
            "gif"
        } else {
            "png"
        };
        format!(
            "https://cdn.discordapp.com/guilds/{}/users/{}/avatars/{}.{}?size=256",
            guild_id, user_id, avatar_hash, ext
        )
    }

    /// Get the configured guild ID
    pub fn guild_id(&self) -> &str {
        &self.config.guild_id
    }

    /// Fetch all roles for the guild
    /// GET /guilds/{guild.id}/roles
    pub async fn get_guild_roles(&self) -> Result<Vec<DiscordRole>, String> {
        let url = format!("{}/guilds/{}/roles", DISCORD_API_BASE, self.config.guild_id);

        let response = self
            .client
            .get(&url)
            .header("Authorization", format!("Bot {}", self.config.bot_token))
            .header("User-Agent", "KBVE-Bot/1.0")
            .send()
            .await
            .map_err(|e| format!("Discord API request failed: {}", e))?;

        match response.status().as_u16() {
            200 => {
                let roles: Vec<DiscordRole> = response
                    .json()
                    .await
                    .map_err(|e| format!("Failed to parse Discord roles: {}", e))?;
                Ok(roles)
            }
            429 => {
                tracing::warn!("Discord API rate limited");
                Err("Rate limited by Discord API".to_string())
            }
            status => {
                let body = response.text().await.unwrap_or_default();
                tracing::error!("Discord API error {}: {}", status, body);
                Err(format!("Discord API error: {}", status))
            }
        }
    }
}

// Global Discord client singleton (async-compatible)
static DISCORD_CLIENT: OnceCell<Option<DiscordClient>> = OnceCell::const_new();

/// Initialize the global Discord client with vault-first token retrieval
///
/// This function:
/// 1. Tries to fetch the bot token from Supabase vault first
/// 2. Falls back to environment variables if vault fails
/// 3. Caches guild roles for role name lookups
/// 4. Returns false but doesn't crash if both fail
pub async fn init_discord_client() -> bool {
    let client_available = DISCORD_CLIENT
        .get_or_init(|| async {
            match DiscordConfig::from_vault_or_env().await {
                Some(config) => match DiscordClient::new(config) {
                    Ok(client) => {
                        tracing::info!("Discord client initialized successfully");
                        Some(client)
                    }
                    Err(e) => {
                        tracing::error!("Failed to create Discord client: {}", e);
                        None
                    }
                },
                None => {
                    tracing::warn!("Discord client not configured - features unavailable");
                    None
                }
            }
        })
        .await
        .is_some();

    // Cache guild roles if client is available
    if client_available {
        if let Some(client) = get_discord_client() {
            GUILD_ROLES_CACHE
                .get_or_init(|| async {
                    match client.get_guild_roles().await {
                        Ok(roles) => {
                            let role_map: std::collections::HashMap<String, String> =
                                roles.into_iter().map(|r| (r.id, r.name)).collect();
                            tracing::info!("Cached {} Discord guild roles", role_map.len());
                            role_map
                        }
                        Err(e) => {
                            tracing::error!("Failed to fetch guild roles: {}", e);
                            std::collections::HashMap::new()
                        }
                    }
                })
                .await;
        }
    }

    client_available
}

/// Initialize Discord client synchronously (ENV only, for backward compatibility)
///
/// Use `init_discord_client()` instead when possible for vault support.
#[allow(dead_code)]
pub fn init_discord_client_sync() -> bool {
    // For sync contexts, use a static OnceLock with ENV-only config
    static DISCORD_CLIENT_SYNC: OnceLock<Option<DiscordClient>> = OnceLock::new();

    DISCORD_CLIENT_SYNC
        .get_or_init(|| match DiscordConfig::from_env() {
            Ok(config) => match DiscordClient::new(config) {
                Ok(client) => {
                    tracing::info!("Discord client initialized (sync/ENV-only)");
                    Some(client)
                }
                Err(e) => {
                    tracing::error!("Failed to create Discord client: {}", e);
                    None
                }
            },
            Err(e) => {
                tracing::warn!("Discord client not configured: {}", e);
                None
            }
        })
        .is_some()
}

/// Get the global Discord client
pub fn get_discord_client() -> Option<&'static DiscordClient> {
    DISCORD_CLIENT.get().and_then(|c| c.as_ref())
}

/// Get role names from role IDs using the cached role map
/// Returns a Vec of role names in the same order as the input IDs
/// Unknown role IDs are skipped
pub fn get_role_names(role_ids: &[String]) -> Vec<String> {
    let cache = match GUILD_ROLES_CACHE.get() {
        Some(cache) => cache,
        None => return Vec::new(),
    };

    role_ids
        .iter()
        .filter_map(|id| cache.get(id).cloned())
        // Filter out @everyone role (it's always included but not useful to display)
        .filter(|name| name != "@everyone")
        .collect()
}

/// Get the cached role map (for debugging/inspection)
pub fn get_cached_roles() -> Option<&'static std::collections::HashMap<String, String>> {
    GUILD_ROLES_CACHE.get()
}
