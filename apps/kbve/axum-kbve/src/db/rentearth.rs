// RentEarth character data for profile caching
//
// Fetches character data from the rentearth schema via Supabase RPC.
// Uses the same auth.users UUID as the profile system.

use serde::{Deserialize, Serialize};

/// Character summary from database (for character select display)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RentEarthCharacterSummary {
    pub id: String,
    pub slot: i32,
    pub first_name: String,
    pub display_name: String, // "first_name of Haus username"
    pub visual_type: i32,
    pub archetype_flags: i64,
    pub level: i32,
    pub experience: i64,
    pub gold: i64,
    pub current_zone: String,
    pub health_current: i32,
    pub health_max: i32,
    pub last_login_at: Option<String>,
    pub total_playtime_seconds: Option<i64>,
    pub created_at: Option<String>,
}

/// Position data
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RentEarthPosition {
    pub world_x: f32,
    pub world_y: f32,
    pub world_z: f32,
    pub rotation_yaw: f32,
}

/// Core stats (8 DND-inspired attributes)
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RentEarthCoreStats {
    pub strength: i32,
    pub agility: i32,
    pub constitution: i32,
    pub intelligence: i32,
    pub wisdom: i32,
    pub charisma: i32,
    pub luck: i32,
    pub faith: i32,
    pub unspent_skill_points: i32,
}

/// Derived stats (computed from core + equipment)
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RentEarthDerivedStats {
    pub health_current: i32,
    pub health_max: i32,
    pub mana_current: i32,
    pub mana_max: i32,
    pub stamina_current: i32,
    pub stamina_max: i32,
    pub attack_power: i32,
    pub spell_power: i32,
    pub defense: i32,
    pub magic_resist: i32,
    pub speed: f32,
    pub crit_chance: f32,
    pub crit_damage: f32,
    pub combat_rating: i32,
}

/// Appearance customization
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RentEarthAppearance {
    pub skin_color: i32,
    pub body_type: i32,
    pub body_height: i32,
    pub face_shape: i32,
    pub eye_color: i32,
    pub eye_shape: i32,
    pub eyebrow_style: i32,
    pub eyebrow_color: i32,
    pub nose_style: i32,
    pub mouth_style: i32,
    pub hair_style: i32,
    pub hair_color: i32,
    pub facial_hair_style: i32,
    pub facial_hair_color: i32,
    pub scar_style: i32,
    pub tattoo_style: i32,
    pub voice_type: i32,
}

/// Full character data (summary + details)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RentEarthCharacterFull {
    pub summary: RentEarthCharacterSummary,
    pub position: RentEarthPosition,
    pub core_stats: RentEarthCoreStats,
    pub derived_stats: RentEarthDerivedStats,
    pub appearance: RentEarthAppearance,
}

/// Complete RentEarth profile for a user
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RentEarthProfile {
    pub characters: Vec<RentEarthCharacterSummary>,
    pub active_character: Option<RentEarthCharacterFull>,
    pub total_playtime_seconds: Option<i64>,
    pub last_activity_at: Option<String>,
}

/// Raw character row from get_characters_for_profile RPC
#[derive(Debug, Deserialize)]
struct CharacterRow {
    id: String,
    slot: i16,
    first_name: String,
    visual_type: i32,
    archetype_flags: i64,
    level: i32,
    experience: i64,
    gold: i64,
    current_zone: String,
    health_current: i32,
    health_max: i32,
    last_login_at: Option<String>,
    total_playtime_seconds: Option<i64>,
    created_at: Option<String>,
}

/// Raw full character row from get_character_full RPC
#[derive(Debug, Deserialize)]
struct CharacterFullRow {
    // Summary fields
    id: String,
    slot: i16,
    first_name: String,
    visual_type: i32,
    archetype_flags: i64,
    level: i32,
    experience: i64,
    gold: i64,
    current_zone: String,
    health_current: i32,
    health_max: i32,
    last_login_at: Option<String>,
    total_playtime_seconds: Option<i64>,
    created_at: Option<String>,
    // Position
    world_x: f32,
    world_y: f32,
    world_z: f32,
    rotation_yaw: f32,
    // Core stats
    strength: i32,
    agility: i32,
    constitution: i32,
    intelligence: i32,
    wisdom: i32,
    charisma: i32,
    luck: i32,
    faith: i32,
    unspent_skill_points: i32,
    // Derived stats
    mana_current: i32,
    mana_max: i32,
    stamina_current: i32,
    stamina_max: i32,
    attack_power: i32,
    spell_power: i32,
    defense: i32,
    magic_resist: i32,
    speed: f32,
    crit_chance: f32,
    crit_damage: f32,
    combat_rating: i32,
    // Appearance
    skin_color: i16,
    body_type: i16,
    body_height: i16,
    face_shape: i16,
    eye_color: i16,
    eye_shape: i16,
    eyebrow_style: i16,
    eyebrow_color: i16,
    nose_style: i16,
    mouth_style: i16,
    hair_style: i16,
    hair_color: i16,
    facial_hair_style: i16,
    facial_hair_color: i16,
    scar_style: i16,
    tattoo_style: i16,
    voice_type: i16,
}

impl CharacterFullRow {
    fn into_full(self, username: &str) -> RentEarthCharacterFull {
        RentEarthCharacterFull {
            summary: RentEarthCharacterSummary {
                id: self.id,
                slot: self.slot as i32,
                first_name: self.first_name.clone(),
                display_name: format!("{} of Haus {}", self.first_name, username),
                visual_type: self.visual_type,
                archetype_flags: self.archetype_flags,
                level: self.level,
                experience: self.experience,
                gold: self.gold,
                current_zone: self.current_zone,
                health_current: self.health_current,
                health_max: self.health_max,
                last_login_at: self.last_login_at,
                total_playtime_seconds: self.total_playtime_seconds,
                created_at: self.created_at,
            },
            position: RentEarthPosition {
                world_x: self.world_x,
                world_y: self.world_y,
                world_z: self.world_z,
                rotation_yaw: self.rotation_yaw,
            },
            core_stats: RentEarthCoreStats {
                strength: self.strength,
                agility: self.agility,
                constitution: self.constitution,
                intelligence: self.intelligence,
                wisdom: self.wisdom,
                charisma: self.charisma,
                luck: self.luck,
                faith: self.faith,
                unspent_skill_points: self.unspent_skill_points,
            },
            derived_stats: RentEarthDerivedStats {
                health_current: self.health_current,
                health_max: self.health_max,
                mana_current: self.mana_current,
                mana_max: self.mana_max,
                stamina_current: self.stamina_current,
                stamina_max: self.stamina_max,
                attack_power: self.attack_power,
                spell_power: self.spell_power,
                defense: self.defense,
                magic_resist: self.magic_resist,
                speed: self.speed,
                crit_chance: self.crit_chance,
                crit_damage: self.crit_damage,
                combat_rating: self.combat_rating,
            },
            appearance: RentEarthAppearance {
                skin_color: self.skin_color as i32,
                body_type: self.body_type as i32,
                body_height: self.body_height as i32,
                face_shape: self.face_shape as i32,
                eye_color: self.eye_color as i32,
                eye_shape: self.eye_shape as i32,
                eyebrow_style: self.eyebrow_style as i32,
                eyebrow_color: self.eyebrow_color as i32,
                nose_style: self.nose_style as i32,
                mouth_style: self.mouth_style as i32,
                hair_style: self.hair_style as i32,
                hair_color: self.hair_color as i32,
                facial_hair_style: self.facial_hair_style as i32,
                facial_hair_color: self.facial_hair_color as i32,
                scar_style: self.scar_style as i32,
                tattoo_style: self.tattoo_style as i32,
                voice_type: self.voice_type as i32,
            },
        }
    }
}

use super::supabase::{SupabaseClient, SupabaseConfig};
use std::sync::OnceLock;

/// RentEarth service for fetching character data
pub struct RentEarthService {
    client: SupabaseClient,
}

impl RentEarthService {
    /// Create a new RentEarth service
    pub fn new(config: SupabaseConfig) -> Result<Self, String> {
        let client = SupabaseClient::new(config)?;
        Ok(Self { client })
    }

    /// Get all characters for a user (summaries only)
    pub async fn get_characters_by_user_id(
        &self,
        user_id: &str,
        username: &str,
    ) -> Result<Vec<RentEarthCharacterSummary>, String> {
        let url = self.client.config().rpc_url("get_characters_for_profile");
        let headers = self.client.rpc_headers("rentearth")?;

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
            // If RPC doesn't exist yet, return empty list gracefully
            if body.contains("function") && body.contains("does not exist") {
                tracing::debug!("RentEarth RPC not found, returning empty character list");
                return Ok(Vec::new());
            }
            return Err(format!("Database error: {} - {}", status, body));
        }

        let rows: Vec<CharacterRow> = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse characters: {}", e))?;

        // Convert rows to summaries with display names
        let characters = rows
            .into_iter()
            .map(|row| RentEarthCharacterSummary {
                id: row.id,
                slot: row.slot as i32,
                first_name: row.first_name.clone(),
                display_name: format!("{} of Haus {}", row.first_name, username),
                visual_type: row.visual_type,
                archetype_flags: row.archetype_flags,
                level: row.level,
                experience: row.experience,
                gold: row.gold,
                current_zone: row.current_zone,
                health_current: row.health_current,
                health_max: row.health_max,
                last_login_at: row.last_login_at,
                total_playtime_seconds: row.total_playtime_seconds,
                created_at: row.created_at,
            })
            .collect();

        Ok(characters)
    }

    /// Get full character data by character ID (validates ownership via user_id)
    pub async fn get_character_full(
        &self,
        user_id: &str,
        character_id: &str,
        username: &str,
    ) -> Result<Option<RentEarthCharacterFull>, String> {
        let url = self
            .client
            .config()
            .rpc_url("get_character_full_for_profile");
        let headers = self.client.rpc_headers("rentearth")?;

        let payload = serde_json::json!({
            "p_user_id": user_id,
            "p_character_id": character_id
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
            // If RPC doesn't exist yet, return None gracefully
            if body.contains("function") && body.contains("does not exist") {
                tracing::debug!("RentEarth full character RPC not found");
                return Ok(None);
            }
            return Err(format!("Database error: {} - {}", status, body));
        }

        let rows: Vec<CharacterFullRow> = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse character: {}", e))?;

        Ok(rows.into_iter().next().map(|row| row.into_full(username)))
    }

    /// Get RentEarth profile for user (all characters + most recent active)
    pub async fn get_profile(
        &self,
        user_id: &str,
        username: &str,
    ) -> Result<Option<RentEarthProfile>, String> {
        let characters = self.get_characters_by_user_id(user_id, username).await?;

        if characters.is_empty() {
            return Ok(None);
        }

        // Find most recently active character
        let most_recent = characters
            .iter()
            .max_by_key(|c| c.last_login_at.as_deref().unwrap_or(""));

        let active_character = if let Some(recent) = most_recent {
            self.get_character_full(user_id, &recent.id, username)
                .await?
        } else {
            None
        };

        // Calculate total playtime
        let total_playtime: i64 = characters
            .iter()
            .filter_map(|c| c.total_playtime_seconds)
            .sum();

        let last_activity = characters
            .iter()
            .filter_map(|c| c.last_login_at.as_deref())
            .max()
            .map(|s| s.to_string());

        Ok(Some(RentEarthProfile {
            characters,
            active_character,
            total_playtime_seconds: if total_playtime > 0 {
                Some(total_playtime)
            } else {
                None
            },
            last_activity_at: last_activity,
        }))
    }
}

// Global singleton
static RENTEARTH_SERVICE: OnceLock<Option<RentEarthService>> = OnceLock::new();

/// Initialize the global RentEarth service
pub fn init_rentearth_service() -> bool {
    RENTEARTH_SERVICE
        .get_or_init(|| match SupabaseConfig::from_env() {
            Ok(config) => {
                if config.service_role_key.is_none() {
                    tracing::warn!("RentEarthService disabled: no service role key");
                    return None;
                }
                match RentEarthService::new(config) {
                    Ok(service) => {
                        tracing::info!("RentEarthService initialized");
                        Some(service)
                    }
                    Err(e) => {
                        tracing::error!("Failed to create RentEarthService: {}", e);
                        None
                    }
                }
            }
            Err(e) => {
                tracing::error!("Failed to load Supabase config for RentEarth: {}", e);
                None
            }
        })
        .is_some()
}

/// Get the global RentEarth service
pub fn get_rentearth_service() -> Option<&'static RentEarthService> {
    RENTEARTH_SERVICE.get().and_then(|s| s.as_ref())
}
