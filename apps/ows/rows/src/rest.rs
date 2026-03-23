use crate::error::SuccessResponse;
use crate::middleware::{extract_customer_guid, require_customer_guid};
use crate::repo::*;
use crate::state::AppState;
use axum::{
    Json, Router,
    extract::{Path, State},
    http::HeaderMap,
    middleware,
    routing::{get, post},
};
use serde::Deserialize;
use serde_json::json;
use std::sync::Arc;
use uuid::Uuid;

pub fn router(state: Arc<AppState>) -> Router {
    let public = public_api_routes(state.clone());
    let instance = instance_mgmt_routes(state.clone());
    let character = character_persistence_routes(state.clone());
    let global = global_data_routes(state.clone());
    let abilities = abilities_routes(state.clone());
    let zones = zones_routes(state.clone());

    Router::new()
        .route("/health", get(health))
        .merge(public)
        .merge(instance)
        .merge(character)
        .merge(global)
        .merge(abilities)
        .merge(zones)
}

async fn health() -> Json<serde_json::Value> {
    Json(json!({ "status": "healthy", "service": "rows" }))
}

// ─── Public API ──────────────────────────────────────────────

fn public_api_routes(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/api/Users/LoginAndCreateSession", post(login))
        .route("/api/Users/RegisterUser", post(register_user))
        .route("/api/Users/Logout", post(logout))
        .route("/api/Users/GetUserSession", get(get_user_session))
        .route("/api/Users/GetAllCharacters", post(get_all_characters))
        .route("/api/Users/CreateCharacter", post(create_character))
        .route("/api/Users/RemoveCharacter", post(remove_character))
        .route(
            "/api/Users/GetServerToConnectTo",
            post(get_server_to_connect_to),
        )
        .route("/api/Characters/ByName", post(get_char_by_name_public))
        .route("/api/System/Status", get(system_status))
        .layer(middleware::from_fn(require_customer_guid))
        .with_state(state)
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct LoginDto {
    email: String,
    password: String,
}

async fn login(
    State(state): State<Arc<AppState>>,
    Json(body): Json<LoginDto>,
) -> Json<serde_json::Value> {
    let repo = UsersRepo(&state.db);
    match repo.login(&body.email, &body.password).await {
        Ok(result) => Json(serde_json::to_value(result).unwrap()),
        Err(e) => Json(json!({
            "authenticated": false,
            "userSessionGuid": null,
            "errorMessage": e.to_string()
        })),
    }
}

async fn get_user_session(
    State(state): State<Arc<AppState>>,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> Json<serde_json::Value> {
    let guid = params
        .get("userSessionGUID")
        .and_then(|s| Uuid::parse_str(s).ok());

    let Some(session_guid) = guid else {
        return Json(json!({"success": false, "errorMessage": "Missing userSessionGUID"}));
    };

    let repo = UsersRepo(&state.db);
    match repo.get_session(session_guid).await {
        Ok(Some(session)) => Json(serde_json::to_value(session).unwrap()),
        Ok(None) => Json(json!({"success": false, "errorMessage": "Session not found"})),
        Err(e) => Json(json!({"success": false, "errorMessage": e.to_string()})),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct GetAllCharsDto {
    #[serde(rename = "UserSessionGUID")]
    user_session_guid: Uuid,
}

async fn get_all_characters(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<GetAllCharsDto>,
) -> Json<serde_json::Value> {
    let customer_guid = extract_customer_guid(&headers);
    let repo = UsersRepo(&state.db);

    let session = repo.get_session(body.user_session_guid).await;
    let user_guid = match session {
        Ok(Some(s)) => match s.user_guid {
            Some(ug) => ug,
            None => return Json(json!([])),
        },
        _ => return Json(json!([])),
    };

    match repo.get_all_characters(customer_guid, user_guid).await {
        Ok(chars) => Json(serde_json::to_value(chars).unwrap()),
        Err(_) => Json(json!([])),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct GetServerDto {
    #[serde(rename = "UserSessionGUID")]
    _user_session_guid: Uuid,
    character_name: String,
    zone_name: String,
}

async fn get_server_to_connect_to(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<GetServerDto>,
) -> Json<serde_json::Value> {
    let customer_guid = extract_customer_guid(&headers);
    let repo = InstanceRepo(&state.db);

    match repo
        .join_map_by_char_name(customer_guid, &body.character_name, &body.zone_name)
        .await
    {
        Ok(result) => {
            // If we need to start a map and have MQ, publish spin-up
            if result.need_to_startup_map {
                if let Some(ref mq) = state.mq {
                    let msg = crate::mq::SpinUpMessage {
                        customer_guid: customer_guid.to_string(),
                        world_server_id: result.world_server_id,
                        zone_instance_id: result.map_instance_id,
                        map_name: result.map_name_to_start.clone(),
                        port: result.port,
                    };
                    if let Err(e) = mq.publish_spin_up(result.world_server_id, &msg).await {
                        tracing::error!(error = %e, "Failed to publish spin-up message");
                    }
                }
            }
            Json(serde_json::to_value(result).unwrap())
        }
        Err(e) => Json(json!({"success": false, "errorMessage": e.to_string()})),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct GetByNameDto {
    #[serde(rename = "UserSessionGUID")]
    _user_session_guid: String,
    character_name: String,
}

async fn get_char_by_name_public(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<GetByNameDto>,
) -> Json<serde_json::Value> {
    let customer_guid = extract_customer_guid(&headers);
    let repo = CharsRepo(&state.db);

    match repo.get_by_name(customer_guid, &body.character_name).await {
        Ok(Some(ch)) => Json(serde_json::to_value(ch).unwrap()),
        Ok(None) => Json(json!({"success": false, "errorMessage": "Character not found"})),
        Err(e) => Json(json!({"success": false, "errorMessage": e.to_string()})),
    }
}

async fn system_status() -> Json<bool> {
    Json(true)
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct RegisterUserDto {
    email: String,
    password: String,
    first_name: String,
    last_name: String,
}

async fn register_user(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<RegisterUserDto>,
) -> Json<SuccessResponse> {
    let customer_guid = extract_customer_guid(&headers);
    let repo = UsersRepo(&state.db);

    use argon2::{
        Argon2, PasswordHasher, password_hash::SaltString, password_hash::rand_core::OsRng,
    };
    let salt = SaltString::generate(&mut OsRng);
    let password_hash = match Argon2::default().hash_password(body.password.as_bytes(), &salt) {
        Ok(h) => h.to_string(),
        Err(e) => return Json(SuccessResponse::err(format!("Hash error: {e}"))),
    };

    match repo
        .register(
            customer_guid,
            &body.email,
            &password_hash,
            &body.first_name,
            &body.last_name,
        )
        .await
    {
        Ok(_) => Json(SuccessResponse::ok()),
        Err(e) => Json(SuccessResponse::err(e.to_string())),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct LogoutDto {
    #[serde(rename = "UserSessionGUID")]
    user_session_guid: Uuid,
}

async fn logout(
    State(state): State<Arc<AppState>>,
    Json(body): Json<LogoutDto>,
) -> Json<SuccessResponse> {
    let repo = UsersRepo(&state.db);
    match repo.logout(body.user_session_guid).await {
        Ok(()) => Json(SuccessResponse::ok()),
        Err(e) => Json(SuccessResponse::err(e.to_string())),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct CreateCharDto {
    #[serde(rename = "UserSessionGUID")]
    user_session_guid: Uuid,
    character_name: String,
    class_name: String,
}

async fn create_character(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<CreateCharDto>,
) -> Json<SuccessResponse> {
    let customer_guid = extract_customer_guid(&headers);
    let users = UsersRepo(&state.db);
    let chars = CharsRepo(&state.db);

    let user_guid = match users.get_session(body.user_session_guid).await {
        Ok(Some(s)) => match s.user_guid {
            Some(ug) => ug,
            None => return Json(SuccessResponse::err("Invalid session")),
        },
        _ => return Json(SuccessResponse::err("Session not found")),
    };

    match chars
        .create_character(
            customer_guid,
            user_guid,
            &body.character_name,
            &body.class_name,
        )
        .await
    {
        Ok(()) => Json(SuccessResponse::ok()),
        Err(e) => Json(SuccessResponse::err(e.to_string())),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct RemoveCharDto {
    #[serde(rename = "UserSessionGUID")]
    _user_session_guid: Uuid,
    character_name: String,
}

async fn remove_character(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<RemoveCharDto>,
) -> Json<SuccessResponse> {
    let customer_guid = extract_customer_guid(&headers);
    let repo = CharsRepo(&state.db);

    match repo
        .remove_character(customer_guid, &body.character_name)
        .await
    {
        Ok(()) => Json(SuccessResponse::ok()),
        Err(e) => Json(SuccessResponse::err(e.to_string())),
    }
}

// ─── Instance Management ─────────────────────────────────────

fn instance_mgmt_routes(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/api/Instance/SetZoneInstanceStatus", post(set_zone_status))
        .route(
            "/api/Instance/GetZoneInstancesForWorldServer",
            post(get_zone_instances),
        )
        .route("/api/Instance/RegisterLauncher", post(register_launcher))
        .route(
            "/api/Instance/StartInstanceLauncher",
            get(start_instance_launcher),
        )
        .layer(middleware::from_fn(require_customer_guid))
        .with_state(state)
}

#[derive(Deserialize)]
struct SetZoneStatusWrapper {
    request: SetZoneStatusPayload,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct SetZoneStatusPayload {
    #[serde(rename = "ZoneInstanceID")]
    zone_instance_id: i32,
    instance_status: i32,
}

async fn set_zone_status(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<SetZoneStatusWrapper>,
) -> Json<SuccessResponse> {
    let customer_guid = extract_customer_guid(&headers);
    let repo = InstanceRepo(&state.db);

    match repo
        .set_zone_status(
            customer_guid,
            body.request.zone_instance_id,
            body.request.instance_status,
        )
        .await
    {
        Ok(()) => Json(SuccessResponse::ok()),
        Err(e) => Json(SuccessResponse::err(e.to_string())),
    }
}

#[derive(Deserialize)]
struct GetZoneInstancesWrapper {
    request: GetZoneInstancesPayload,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct GetZoneInstancesPayload {
    #[serde(rename = "WorldServerID")]
    world_server_id: i32,
}

async fn get_zone_instances(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<GetZoneInstancesWrapper>,
) -> Json<serde_json::Value> {
    let customer_guid = extract_customer_guid(&headers);
    let repo = InstanceRepo(&state.db);

    match repo
        .get_zone_instances(customer_guid, body.request.world_server_id)
        .await
    {
        Ok(zones) => Json(serde_json::to_value(zones).unwrap()),
        Err(e) => Json(json!({"success": false, "errorMessage": e.to_string()})),
    }
}

async fn register_launcher() -> Json<SuccessResponse> {
    // TODO: persist launcher registration
    Json(SuccessResponse::ok())
}

async fn start_instance_launcher() -> String {
    // TODO: return world server ID
    "-1".to_string()
}

// ─── Character Persistence ───────────────────────────────────

fn character_persistence_routes(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/api/Characters/GetByName", post(get_char_by_name))
        .route("/api/Characters/GetCustomData", post(get_custom_data))
        .route(
            "/api/Characters/AddOrUpdateCustomData",
            post(add_or_update_custom_data),
        )
        .route(
            "/api/Characters/UpdateCharacterStats",
            post(update_character_stats),
        )
        .route(
            "/api/Characters/UpdateAllPlayerPositions",
            post(update_all_positions),
        )
        .route("/api/Characters/PlayerLogout", post(player_logout))
        .layer(middleware::from_fn(require_customer_guid))
        .with_state(state)
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct CharNameDto {
    character_name: String,
}

async fn get_char_by_name(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<CharNameDto>,
) -> Json<serde_json::Value> {
    let customer_guid = extract_customer_guid(&headers);
    let repo = CharsRepo(&state.db);

    match repo.get_by_name(customer_guid, &body.character_name).await {
        Ok(Some(ch)) => Json(serde_json::to_value(ch).unwrap()),
        Ok(None) => Json(json!({"success": false, "errorMessage": "Character not found"})),
        Err(e) => Json(json!({"success": false, "errorMessage": e.to_string()})),
    }
}

async fn get_custom_data(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<CharNameDto>,
) -> Json<serde_json::Value> {
    let customer_guid = extract_customer_guid(&headers);
    let repo = CharsRepo(&state.db);

    match repo
        .get_custom_data(customer_guid, &body.character_name)
        .await
    {
        Ok(data) => Json(json!({ "rows": data })),
        Err(e) => Json(json!({"success": false, "errorMessage": e.to_string()})),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct UpdatePositionsDto {
    serialized_player_location_data: String,
    #[allow(dead_code)]
    map_name: String,
}

async fn update_all_positions(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<UpdatePositionsDto>,
) -> Json<SuccessResponse> {
    let customer_guid = extract_customer_guid(&headers);
    let repo = CharsRepo(&state.db);

    // Parse pipe-separated format: CharName:X:Y:Z:RX:RY:RZ|CharName2:...
    for entry in body.serialized_player_location_data.split('|') {
        let parts: Vec<&str> = entry.split(':').collect();
        if parts.len() < 7 {
            continue;
        }
        let char_name = parts[0];
        let Ok(x) = parts[1].parse::<f64>() else {
            continue;
        };
        let Ok(y) = parts[2].parse::<f64>() else {
            continue;
        };
        let Ok(z) = parts[3].parse::<f64>() else {
            continue;
        };
        let Ok(rx) = parts[4].parse::<f64>() else {
            continue;
        };
        let Ok(ry) = parts[5].parse::<f64>() else {
            continue;
        };
        let Ok(rz) = parts[6].parse::<f64>() else {
            continue;
        };

        if let Err(e) = repo
            .update_position(customer_guid, char_name, x, y, z, rx, ry, rz)
            .await
        {
            tracing::warn!("Failed to update position for {char_name}: {e}");
        }
    }

    Json(SuccessResponse::ok())
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct AddCustomDataDto {
    character_name: String,
    custom_character_data_key: String,
    custom_character_data_value: String,
}

async fn add_or_update_custom_data(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<AddCustomDataDto>,
) -> Json<SuccessResponse> {
    let customer_guid = extract_customer_guid(&headers);
    let repo = CharsRepo(&state.db);

    match repo
        .add_or_update_custom_data(
            customer_guid,
            &body.character_name,
            &body.custom_character_data_key,
            &body.custom_character_data_value,
        )
        .await
    {
        Ok(()) => Json(SuccessResponse::ok()),
        Err(e) => Json(SuccessResponse::err(e.to_string())),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct UpdateStatsDto {
    character_name: String,
    // C# sends individual stat fields — we accept as JSON
    #[serde(flatten)]
    stats: serde_json::Value,
}

async fn update_character_stats(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<UpdateStatsDto>,
) -> Json<SuccessResponse> {
    let customer_guid = extract_customer_guid(&headers);
    let repo = CharsRepo(&state.db);

    let stats_json = serde_json::to_string(&body.stats).unwrap_or_default();
    match repo
        .update_stats(customer_guid, &body.character_name, &stats_json)
        .await
    {
        Ok(()) => Json(SuccessResponse::ok()),
        Err(e) => Json(SuccessResponse::err(e.to_string())),
    }
}

async fn player_logout(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<CharNameDto>,
) -> Json<SuccessResponse> {
    let customer_guid = extract_customer_guid(&headers);
    let repo = CharsRepo(&state.db);
    match repo
        .player_logout(customer_guid, &body.character_name)
        .await
    {
        Ok(()) => Json(SuccessResponse::ok()),
        Err(e) => {
            tracing::error!(error = %e, "PlayerLogout failed");
            Json(SuccessResponse::err(e.to_string()))
        }
    }
}

// ─── Abilities ───────────────────────────────────────────────

fn abilities_routes(state: Arc<AppState>) -> Router {
    Router::new()
        .route(
            "/api/Abilities/GetCharacterAbilities",
            post(get_character_abilities),
        )
        .route("/api/Abilities/AddAbilityToCharacter", post(add_ability))
        .route(
            "/api/Abilities/RemoveAbilityFromCharacter",
            post(remove_ability),
        )
        .route("/api/Abilities/GetAbilities", get(get_abilities_list))
        .layer(middleware::from_fn(require_customer_guid))
        .with_state(state)
}

async fn get_character_abilities(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<CharNameDto>,
) -> Json<serde_json::Value> {
    let customer_guid = extract_customer_guid(&headers);
    let repo = AbilitiesRepo(&state.db);

    match repo
        .get_character_abilities(customer_guid, &body.character_name)
        .await
    {
        Ok(abilities) => Json(serde_json::to_value(abilities).unwrap()),
        Err(e) => Json(json!({"success": false, "errorMessage": e.to_string()})),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct AddAbilityDto {
    character_name: String,
    ability_name: String,
    ability_level: i32,
}

async fn add_ability(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<AddAbilityDto>,
) -> Json<SuccessResponse> {
    let customer_guid = extract_customer_guid(&headers);
    let repo = AbilitiesRepo(&state.db);

    match repo
        .add_ability(
            customer_guid,
            &body.character_name,
            &body.ability_name,
            body.ability_level,
        )
        .await
    {
        Ok(()) => Json(SuccessResponse::ok()),
        Err(e) => Json(SuccessResponse::err(e.to_string())),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct RemoveAbilityDto {
    character_name: String,
    ability_name: String,
}

async fn remove_ability(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<RemoveAbilityDto>,
) -> Json<SuccessResponse> {
    let customer_guid = extract_customer_guid(&headers);
    let repo = AbilitiesRepo(&state.db);

    match repo
        .remove_ability(customer_guid, &body.character_name, &body.ability_name)
        .await
    {
        Ok(()) => Json(SuccessResponse::ok()),
        Err(e) => Json(SuccessResponse::err(e.to_string())),
    }
}

async fn get_abilities_list() -> Json<serde_json::Value> {
    // TODO: return all abilities for the customer
    Json(json!([]))
}

// ─── Zones ───────────────────────────────────────────────────

fn zones_routes(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/api/Zones/AddZone", post(add_zone))
        .layer(middleware::from_fn(require_customer_guid))
        .with_state(state)
}

#[derive(Deserialize)]
struct AddZoneWrapper {
    #[serde(rename = "addOrUpdateZone")]
    add_or_update_zone: AddZonePayload,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct AddZonePayload {
    map_name: String,
    zone_name: String,
    soft_player_cap: i32,
    hard_player_cap: i32,
    map_mode: i32,
}

async fn add_zone(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<AddZoneWrapper>,
) -> Json<SuccessResponse> {
    let customer_guid = extract_customer_guid(&headers);
    let repo = ZonesRepo(&state.db);
    let z = &body.add_or_update_zone;

    match repo
        .add_zone(
            customer_guid,
            &z.map_name,
            &z.zone_name,
            z.soft_player_cap,
            z.hard_player_cap,
            z.map_mode,
        )
        .await
    {
        Ok(()) => Json(SuccessResponse::ok()),
        Err(e) => Json(SuccessResponse::err(e.to_string())),
    }
}

// ─── Global Data ─────────────────────────────────────────────

fn global_data_routes(state: Arc<AppState>) -> Router {
    Router::new()
        .route(
            "/api/GlobalData/AddOrUpdateGlobalDataItem",
            post(set_global_data),
        )
        .route(
            "/api/GlobalData/GetGlobalDataItem/{globalDataKey}",
            get(get_global_data),
        )
        .layer(middleware::from_fn(require_customer_guid))
        .with_state(state)
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct SetGlobalDataDto {
    global_data_key: String,
    global_data_value: String,
}

async fn set_global_data(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<SetGlobalDataDto>,
) -> Json<SuccessResponse> {
    let customer_guid = extract_customer_guid(&headers);
    let repo = GlobalDataRepo(&state.db);

    match repo
        .set(
            customer_guid,
            &body.global_data_key,
            &body.global_data_value,
        )
        .await
    {
        Ok(()) => Json(SuccessResponse::ok()),
        Err(e) => Json(SuccessResponse::err(e.to_string())),
    }
}

async fn get_global_data(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(key): Path<String>,
) -> Json<serde_json::Value> {
    let customer_guid = extract_customer_guid(&headers);
    let repo = GlobalDataRepo(&state.db);

    match repo.get(customer_guid, &key).await {
        Ok(Some(data)) => Json(serde_json::to_value(data).unwrap()),
        Ok(None) => Json(json!(null)),
        Err(e) => Json(json!({"success": false, "errorMessage": e.to_string()})),
    }
}
