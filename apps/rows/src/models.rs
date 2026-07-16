use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow, ToSchema)]
#[serde(rename_all = "PascalCase")]
pub struct Character {
    #[sqlx(rename = "customerguid")]
    #[serde(rename = "CustomerGUID")]
    pub customer_guid: Uuid,
    #[sqlx(rename = "characterid")]
    #[serde(rename = "CharacterID")]
    pub character_id: i32,
    #[sqlx(rename = "userguid")]
    #[serde(rename = "UserGUID")]
    pub user_guid: Option<Uuid>,
    pub email: String,
    #[sqlx(rename = "charname")]
    #[serde(rename = "CharacterName")]
    pub char_name: String,
    #[sqlx(rename = "mapname")]
    #[serde(rename = "ZoneName")]
    pub map_name: Option<String>,
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub rx: f64,
    pub ry: f64,
    pub rz: f64,
    pub perception: f64,
    pub acrobatics: f64,
    pub climb: f64,
    pub stealth: f64,
    pub spirit: f64,
    pub magic: f64,
    #[sqlx(rename = "teamnumber")]
    pub team_number: i32,
    pub thirst: f64,
    pub hunger: f64,
    pub gold: i32,
    pub score: i32,
    #[sqlx(rename = "characterlevel")]
    #[serde(rename = "Level")]
    pub character_level: i16,
    pub gender: i16,
    pub xp: i32,
    #[sqlx(rename = "hitdie")]
    pub hit_die: i16,
    pub wounds: f64,
    pub size: i16,
    pub weight: f64,
    #[sqlx(rename = "maxhealth")]
    pub max_health: f64,
    pub health: f64,
    #[sqlx(rename = "healthregenrate")]
    pub health_regen_rate: f64,
    #[sqlx(rename = "maxmana")]
    pub max_mana: f64,
    pub mana: f64,
    #[sqlx(rename = "manaregenrate")]
    pub mana_regen_rate: f64,
    #[sqlx(rename = "maxenergy")]
    pub max_energy: f64,
    pub energy: f64,
    #[sqlx(rename = "energyregenrate")]
    pub energy_regen_rate: f64,
    #[sqlx(rename = "maxstamina")]
    pub max_stamina: f64,
    pub stamina: f64,
    #[sqlx(rename = "staminaregenrate")]
    pub stamina_regen_rate: f64,
    pub strength: f64,
    pub dexterity: f64,
    pub constitution: f64,
    pub intellect: f64,
    pub wisdom: f64,
    pub charisma: f64,
    pub agility: f64,
    #[sqlx(rename = "baseattack")]
    pub base_attack: f64,
    #[sqlx(rename = "baseattackbonus")]
    pub base_attack_bonus: f64,
    #[sqlx(rename = "attackpower")]
    pub attack_power: f64,
    #[sqlx(rename = "attackspeed")]
    pub attack_speed: f64,
    #[sqlx(rename = "critchance")]
    pub crit_chance: f64,
    #[sqlx(rename = "critmultiplier")]
    pub crit_multiplier: f64,
    pub defense: f64,
    pub silver: i32,
    pub copper: i32,
    #[sqlx(rename = "freecurrency")]
    pub free_currency: i32,
    #[sqlx(rename = "premiumcurrency")]
    pub premium_currency: i32,
    pub fame: f64,
    pub alignment: f64,
    #[sqlx(rename = "isadmin")]
    pub is_admin: bool,
    #[sqlx(rename = "ismoderator")]
    pub is_moderator: bool,
    #[sqlx(rename = "classid")]
    #[serde(rename = "ClassName")]
    pub class_id: Option<i32>,
    #[sqlx(rename = "createdate")]
    pub create_date: Option<NaiveDateTime>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UserSession {
    #[sqlx(rename = "customerguid")]
    pub customer_guid: Uuid,
    #[sqlx(rename = "userguid")]
    pub user_guid: Option<Uuid>,
    #[sqlx(rename = "usersessionguid")]
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

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow, ToSchema)]
pub struct UserSessionWithCharacter {
    #[sqlx(rename = "customerguid")]
    #[serde(rename = "CustomerGUID")]
    pub customer_guid: Uuid,
    #[sqlx(rename = "userguid")]
    #[serde(rename = "UserGUID")]
    pub user_guid: Option<Uuid>,
    #[sqlx(rename = "usersessionguid")]
    #[serde(rename = "UserSessionGUID")]
    pub user_session_guid: Uuid,
    #[serde(rename = "SelectedCharacterName")]
    pub selected_character_name: Option<String>,
    #[serde(rename = "Email")]
    pub email: String,
    #[serde(rename = "FirstName")]
    pub first_name: String,
    #[serde(rename = "LastName")]
    pub last_name: String,
    #[serde(rename = "CreateDate")]
    pub create_date: Option<NaiveDateTime>,
    #[serde(rename = "LastAccess")]
    pub last_access: Option<NaiveDateTime>,
    #[serde(rename = "Role")]
    pub role: String,
    #[sqlx(rename = "characterid")]
    #[serde(rename = "CharacterID")]
    pub character_id: Option<i32>,
    #[sqlx(rename = "charname")]
    #[serde(rename = "CharName")]
    pub char_name: Option<String>,
    #[serde(rename = "X")]
    pub x: Option<f64>,
    #[serde(rename = "Y")]
    pub y: Option<f64>,
    #[serde(rename = "Z")]
    pub z: Option<f64>,
    #[serde(rename = "RX")]
    pub rx: Option<f64>,
    #[serde(rename = "RY")]
    pub ry: Option<f64>,
    #[serde(rename = "RZ")]
    pub rz: Option<f64>,
    #[sqlx(rename = "mapname")]
    #[serde(rename = "ZoneName")]
    pub zone_name: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct LoginResult {
    pub authenticated: bool,
    pub user_session_guid: Option<Uuid>,
    pub error_message: String,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow, ToSchema)]
#[serde(rename_all = "PascalCase")]
pub struct ZoneInstance {
    #[sqlx(rename = "customerguid")]
    #[serde(rename = "CustomerGUID")]
    pub customer_guid: Uuid,
    #[sqlx(rename = "mapinstanceid")]
    #[serde(rename = "MapInstanceID")]
    pub map_instance_id: i32,
    #[sqlx(rename = "worldserverid")]
    #[serde(rename = "WorldServerID")]
    pub world_server_id: i32,
    #[sqlx(rename = "mapid")]
    #[serde(rename = "MapID")]
    pub map_id: i32,
    pub port: i32,
    pub status: i32,
    #[sqlx(rename = "numberofreportedplayers")]
    pub number_of_reported_players: i32,
    #[sqlx(rename = "lastupdatefromserver")]
    pub last_update_from_server: Option<NaiveDateTime>,
    #[sqlx(rename = "lastserveremptydate")]
    pub last_server_empty_date: Option<NaiveDateTime>,
    // `default` so a `SELECT mi.*` against a DB that hasn't run the gameservername migration
    // yet deserializes the absent column to `None` instead of erroring `ColumnNotFound` — which
    // would otherwise break every ZoneInstance query (incl. the allocate/join routing hot path)
    // if the rows image ships before the dbmate deploy runs.
    #[sqlx(rename = "gameservername", default)]
    pub game_server_name: Option<String>,
    // Drain lifecycle (orthogonal to `status`). `default` so a `SELECT mi.*` against a DB that
    // hasn't run the drain migration yet deserializes the absent columns to `None` rather than
    // erroring `ColumnNotFound` (same posture as `gameservername`). `skip_serializing_if` keeps the
    // UE REST/OpenAPI contract unchanged for un-drained instances (all-None → fields omitted).
    #[sqlx(rename = "drainstate", default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub drain_state: Option<i16>,
    #[sqlx(rename = "drainurgency", default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub drain_urgency: Option<i16>,
    #[sqlx(rename = "draindropplayers", default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub drain_drop_players: Option<bool>,
    #[sqlx(rename = "drainreason", default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub drain_reason: Option<String>,
    #[sqlx(rename = "drainrequestid", default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub drain_request_id: Option<Uuid>,
    #[sqlx(rename = "draindeadline", default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub drain_deadline: Option<NaiveDateTime>,
    #[sqlx(rename = "createdate")]
    pub create_date: Option<NaiveDateTime>,
    pub soft_player_cap: i32,
    pub hard_player_cap: i32,
    pub map_name: String,
    pub map_mode: i32,
    pub minutes_to_shutdown_after_empty: i32,
}

/// Slim projection for the reaper's per-cycle candidate scan. `reap_decision` reads only these
/// `Copy` fields, so a narrowed `SELECT` into this struct (vs `SELECT mi.*` into `ZoneInstance`)
/// avoids the per-row `String` allocations (`map_name`, `game_server_name`) for up to 500 rows
/// every 60s. GameServer-name resolution for an actual reap target is a separate query
/// (`get_gameserver_names`), so the scan itself needs no text columns.
#[derive(Debug, sqlx::FromRow)]
pub struct ReapRow {
    #[sqlx(rename = "mapinstanceid")]
    pub map_instance_id: i32,
    #[sqlx(rename = "numberofreportedplayers")]
    pub number_of_reported_players: i32,
    #[sqlx(rename = "lastupdatefromserver")]
    pub last_update_from_server: Option<NaiveDateTime>,
    #[sqlx(rename = "lastserveremptydate")]
    pub last_server_empty_date: Option<NaiveDateTime>,
    #[sqlx(rename = "createdate")]
    pub create_date: Option<NaiveDateTime>,
    #[sqlx(rename = "minutestoshutdownafterempty")]
    pub minutes_to_shutdown_after_empty: i32,
    // Drain backstop inputs for `reap_decision`. `default` keeps deserialization safe if a row is
    // ever mapped before the migration; note the reaper's candidate `SELECT` lists these columns
    // explicitly, so the scan itself is migration-gated (see get_active_reap_candidates).
    #[sqlx(rename = "drainstate", default)]
    pub drain_state: Option<i16>,
    #[sqlx(rename = "draindeadline", default)]
    pub drain_deadline: Option<NaiveDateTime>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct JoinMapResult {
    #[serde(rename = "serverip")]
    pub server_ip: String,
    #[serde(rename = "worldserverip")]
    pub world_server_ip: String,
    #[serde(rename = "worldserverport")]
    pub world_server_port: i32,
    pub port: i32,
    #[serde(rename = "mapinstanceid")]
    pub map_instance_id: i32,
    #[serde(rename = "mapnametostart")]
    pub map_name_to_start: String,
    #[serde(rename = "worldserverid")]
    pub world_server_id: i32,
    #[serde(rename = "mapinstancestatus")]
    pub map_instance_status: i32,
    pub need_to_startup_map: bool,
    pub enable_auto_loopback: bool,
    pub no_port_forwarding: bool,
    pub success: bool,
    pub error_message: String,
}

/// `join_map_by_char_name`'s candidate row: a full `JoinMapResult` plus the drain columns and player
/// count that `join_candidate_key` ranks on. The reaper-style "fetch candidates, decide in Rust"
/// shape keeps the routing policy in a unit-tested pure function instead of in SQL `ORDER BY`.
#[derive(Debug, sqlx::FromRow)]
pub struct JoinCandidateRow {
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
    pub drain_state: Option<i16>,
    pub drain_urgency: Option<i16>,
    pub drain_drop_players: Option<bool>,
    pub player_count: i32,
}

impl JoinCandidateRow {
    pub fn into_result(self) -> JoinMapResult {
        JoinMapResult {
            server_ip: self.server_ip,
            world_server_ip: self.world_server_ip,
            world_server_port: self.world_server_port,
            port: self.port,
            map_instance_id: self.map_instance_id,
            map_name_to_start: self.map_name_to_start,
            world_server_id: self.world_server_id,
            map_instance_status: self.map_instance_status,
            need_to_startup_map: self.need_to_startup_map,
            enable_auto_loopback: self.enable_auto_loopback,
            no_port_forwarding: self.no_port_forwarding,
            success: self.success,
            error_message: self.error_message,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow, ToSchema)]
#[serde(rename_all = "PascalCase")]
pub struct GlobalData {
    pub global_data_key: String,
    pub global_data_value: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow, ToSchema)]
#[serde(rename_all = "PascalCase")]
pub struct CustomCharacterData {
    pub custom_field_name: String,
    pub field_value: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow, ToSchema)]
#[serde(rename_all = "PascalCase")]
pub struct CharacterAbility {
    pub ability_name: String,
    pub ability_level: i32,
    #[serde(rename = "CharHasAbilitiesCustomJSON")]
    pub custom_json: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct CustomDataRows {
    pub rows: Vec<CustomCharacterData>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow, ToSchema)]
#[serde(rename_all = "PascalCase")]
pub struct AbilityBar {
    #[serde(rename = "CharAbilityBarID")]
    pub char_ability_bar_id: i32,
    pub ability_bar_name: String,
    pub max_number_of_slots: i32,
    pub number_of_unlocked_slots: i32,
    #[serde(rename = "CharAbilityBarsCustomJSON")]
    pub custom_json: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow, ToSchema)]
#[serde(rename_all = "PascalCase")]
pub struct AbilityBarAbility {
    #[serde(rename = "CharAbilityBarID")]
    pub char_ability_bar_id: i32,
    pub ability_bar_name: String,
    pub ability_name: String,
    pub ability_level: i32,
    pub in_slot_number: i32,
    #[serde(rename = "CharAbilityBarAbilitiesCustomJSON")]
    pub custom_json: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow, ToSchema)]
#[serde(rename_all = "PascalCase")]
pub struct ServerInstanceInfo {
    pub map_name: String,
    pub zone_name: Option<String>,
    pub world_comp_contains_filter: Option<String>,
    pub world_comp_list_filter: Option<String>,
    #[serde(rename = "MapInstanceID")]
    pub map_instance_id: i32,
    pub status: i32,
    pub max_number_of_instances: i32,
    pub active_start_time: Option<NaiveDateTime>,
    pub server_status: i16,
    #[serde(rename = "InternalServerIP")]
    pub internal_server_ip: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow, ToSchema)]
#[serde(rename_all = "PascalCase")]
pub struct CharacterStatus {
    pub char_name: String,
    pub map_name: Option<String>,
    pub is_online: bool,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow, ToSchema)]
pub struct PlayerGroupMembership {
    #[serde(rename = "PlayerGroupID")]
    pub player_group_id: i32,
    #[serde(skip_serializing)]
    pub customer_guid: Uuid,
    #[serde(rename = "PlayerGroupName")]
    pub player_group_name: Option<String>,
    #[serde(rename = "PlayerGroupTypeID")]
    pub player_group_type_id: i32,
    #[serde(rename = "ReadyState")]
    pub ready_state: i32,
    #[serde(rename = "DateAdded")]
    pub create_date: Option<NaiveDateTime>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UserInfo {
    pub user_guid: Uuid,
    pub first_name: String,
    pub last_name: String,
    pub email: String,
    pub role: String,
    pub create_date: Option<NaiveDateTime>,
}

#[derive(Serialize, ToSchema)]
pub struct HealthResponse {
    pub status: &'static str,
    pub service: &'static str,
    pub version: &'static str,
    pub uptime_seconds: u64,
    pub active_sessions: usize,
    pub active_instances: usize,
    /// The authoritative served UE build version (`deploy_state.target_version` where
    /// `rolled=true`, falling back to the in-memory ReportBuild value when the table is dark).
    /// **This is the launcher's download target.** Explicitly `null` (not omitted) when there is
    /// no authoritative target — the launcher must surface a maintenance/hold state and NOT
    /// auto-download an arbitrary build.
    pub unreal_version: Option<String>,
    /// A merged-but-not-yet-rolled version (`deploy_state.rolled=false`). Informational.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pending_version: Option<String>,
    /// `false` = the last rollout soak failed (`deploy_state.health='unhealthy'`). Advisory only —
    /// never gates `/ready` (a bad game build must not deregister the ROWS API pod).
    pub deploy_healthy: bool,
    /// The version whose soak failed, when `deploy_healthy=false`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub failing_version: Option<String>,
}

#[derive(sqlx::FromRow)]
pub struct ZoneInstanceInfo {
    pub map_instance_id: i32,
    pub world_server_id: i32,
    pub port: i32,
    pub status: i32,
    pub map_name: String,
    pub zone_name: String,
}

#[derive(sqlx::FromRow)]
pub struct ZoneAssignment {
    pub zone_instance_id: i32,
    pub map_name: String,
    pub zone_name: String,
    pub port: i32,
    /// `0` = handcrafted map (no PCG); non-zero passes through to `ServerTravel("...?seed=<value>")`.
    #[sqlx(default)]
    pub seed: i64,
    /// Optional biome override (e.g. "Arctic"); when absent PCG derives biome from seed.
    #[sqlx(default)]
    pub biome: Option<String>,
}
