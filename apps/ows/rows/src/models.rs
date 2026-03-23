use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Character — maps to the OWS Characters table and GetCharByCharName stored proc.
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Character {
    pub customer_guid: Uuid,
    pub character_id: i32,
    pub user_guid: Option<Uuid>,
    pub email: String,
    #[sqlx(rename = "charname")]
    #[serde(rename = "characterName")]
    pub char_name: String,
    #[serde(rename = "zoneName")]
    pub map_name: Option<String>,
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub rx: f64,
    pub ry: f64,
    pub rz: f64,
    // Core stats
    pub perception: f64,
    pub acrobatics: f64,
    pub climb: f64,
    pub stealth: f64,
    pub spirit: f64,
    pub magic: f64,
    pub team_number: i32,
    pub thirst: f64,
    pub hunger: f64,
    pub gold: f64,
    pub score: f64,
    #[serde(rename = "level")]
    pub character_level: i32,
    pub gender: i32,
    pub xp: f64,
    pub hit_die: i32,
    pub wounds: f64,
    pub size: f64,
    pub weight: f64,
    // Vitals
    pub max_health: f64,
    pub health: f64,
    pub health_regen_rate: f64,
    pub max_mana: f64,
    pub mana: f64,
    pub mana_regen_rate: f64,
    pub max_energy: f64,
    pub energy: f64,
    pub energy_regen_rate: f64,
    pub max_stamina: f64,
    pub stamina: f64,
    pub stamina_regen_rate: f64,
    // Abilities
    pub strength: f64,
    pub dexterity: f64,
    pub constitution: f64,
    pub intellect: f64,
    pub wisdom: f64,
    pub charisma: f64,
    pub agility: f64,
    // Combat
    pub base_attack: f64,
    pub base_attack_bonus: f64,
    pub attack_power: f64,
    pub attack_speed: f64,
    pub crit_chance: f64,
    pub crit_multiplier: f64,
    pub defense: f64,
    // Currencies
    pub silver: f64,
    pub copper: f64,
    pub free_currency: f64,
    pub premium_currency: f64,
    pub fame: f64,
    pub alignment: f64,
    // Admin flags
    pub is_admin: bool,
    pub is_moderator: bool,
    #[serde(rename = "className")]
    pub class_name: Option<String>,
    pub create_date: Option<NaiveDateTime>,
}

/// User session from GetUserSession stored proc.
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct UserSession {
    pub customer_guid: Uuid,
    pub user_guid: Option<Uuid>,
    #[serde(rename = "userSessionGUID")]
    pub user_session_guid: Uuid,
    pub login_date: Option<NaiveDateTime>,
    pub selected_character_name: Option<String>,
    pub first_name: String,
    pub last_name: String,
    pub email: String,
    pub create_date: Option<NaiveDateTime>,
    pub last_access: Option<NaiveDateTime>,
    pub role: String,
}

/// Login result
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginResult {
    pub authenticated: bool,
    pub user_session_guid: Option<Uuid>,
    pub error_message: String,
}

/// Zone instance info from GetZoneInstancesForWorldServer
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ZoneInstance {
    pub customer_guid: Uuid,
    pub map_instance_id: i32,
    pub world_server_id: i32,
    pub map_id: i32,
    pub port: i32,
    pub status: i32,
    pub number_of_reported_players: i32,
    pub last_update_from_server: Option<NaiveDateTime>,
    pub last_server_empty_date: Option<NaiveDateTime>,
    pub create_date: Option<NaiveDateTime>,
    pub soft_player_cap: i32,
    pub hard_player_cap: i32,
    pub map_name: String,
    pub map_mode: i32,
    pub minutes_to_shutdown_after_empty: i32,
}

/// JoinMapByCharName result
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct JoinMapResult {
    pub server_ip: String,
    pub world_server_ip: String,
    pub world_server_port: i32,
    pub port: i32,
    pub map_instance_id: i32,
    pub map_name_to_start: String,
    pub world_server_id: i32,
    pub map_instance_status: i32,
    pub need_to_startup_map: bool,
    pub enable_auto_loopback: bool,
    pub no_port_forwarding: bool,
    pub success: bool,
    pub error_message: String,
}

/// Global data key-value pair
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct GlobalData {
    pub global_data_key: String,
    pub global_data_value: Option<String>,
}

/// Custom character data
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CustomCharacterData {
    pub custom_field_name: String,
    pub field_value: Option<String>,
}

/// Character ability
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CharacterAbility {
    pub ability_name: String,
    pub ability_level: i32,
    pub custom_json: Option<String>,
}

/// Typed wrapper for custom data rows response
#[derive(Debug, Serialize)]
pub struct CustomDataRows {
    pub rows: Vec<CustomCharacterData>,
}

/// Ability bar
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AbilityBar {
    pub char_ability_bar_id: i32,
    pub ability_bar_name: String,
    pub max_number_of_slots: i32,
    pub number_of_unlocked_slots: i32,
    pub custom_json: Option<String>,
}

/// Ability bar with abilities
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AbilityBarAbility {
    pub char_ability_bar_id: i32,
    pub ability_bar_name: String,
    pub ability_name: String,
    pub ability_level: i32,
    pub in_slot_number: i32,
    pub custom_json: Option<String>,
}

/// Server instance info from GetZoneInstance / GetServerInstanceFromPort
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ServerInstanceInfo {
    pub map_name: String,
    pub zone_name: Option<String>,
    pub world_comp_contains_filter: Option<String>,
    pub world_comp_list_filter: Option<String>,
    pub map_instance_id: i32,
    pub status: i32,
    pub max_number_of_instances: i32,
    pub active_start_time: Option<NaiveDateTime>,
    pub server_status: i16,
    pub internal_server_ip: Option<String>,
}

/// Character online/offline status
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CharacterStatus {
    pub char_name: String,
    pub map_name: Option<String>,
    pub is_online: bool,
}

/// User info for management endpoints
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct UserInfo {
    pub user_guid: Uuid,
    pub first_name: String,
    pub last_name: String,
    pub email: String,
    pub role: String,
    pub create_date: Option<NaiveDateTime>,
}

/// Health check response
#[derive(Serialize)]
pub struct HealthResponse {
    pub status: &'static str,
    pub service: &'static str,
}
