use crate::error::{ApiResult, RowsError, SuccessResponse};
use crate::middleware::{extract_customer_guid, require_customer_guid};
use crate::models::{CustomDataRows, HealthResponse};
use crate::service::OWSService;
use crate::state::AppState;
use axum::{
    Json, Router,
    extract::{Path, State},
    http::HeaderMap,
    middleware,
    response::IntoResponse,
    routing::{get, post},
};
use serde::Deserialize;
use std::sync::Arc;
use uuid::Uuid;

/// Shared handler state — holds both AppState (for middleware) and OWSService (for logic).
#[derive(Clone)]
pub struct HandlerState {
    pub app: Arc<AppState>,
    pub svc: Arc<OWSService>,
}

pub fn router(app: Arc<AppState>, svc: Arc<OWSService>) -> Router {
    let hs = HandlerState { app, svc };
    let public = public_api_routes(hs.clone());
    let instance = instance_mgmt_routes(hs.clone());
    let character = character_persistence_routes(hs.clone());
    let global = global_data_routes(hs.clone());
    let abilities = abilities_routes(hs.clone());
    let zones = zones_routes(hs.clone());
    let management = management_routes(hs.clone());

    Router::new()
        .route("/", get(root))
        .route("/health", get(health))
        .route("/ready", get(readiness).with_state(hs.clone()))
        .merge(public)
        .merge(instance)
        .merge(character)
        .merge(global)
        .merge(abilities)
        .merge(zones)
        .merge(management)
}

async fn root() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "service": "rows",
        "status": "ok"
    }))
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "healthy",
        service: "rows",
    })
}

/// Deep readiness check — probes DB pool. Returns 503 if database is unavailable.
async fn readiness(State(hs): State<HandlerState>) -> axum::response::Response {
    let db_ok = sqlx::query("SELECT 1").execute(&hs.app.db).await.is_ok();
    let mq_ok = hs.app.mq.is_some();
    let agones_ok = hs.app.agones.is_some();

    let all_ok = db_ok; // MQ and Agones are optional
    let status = if all_ok { "ready" } else { "degraded" };
    let http_status = if all_ok {
        axum::http::StatusCode::OK
    } else {
        axum::http::StatusCode::SERVICE_UNAVAILABLE
    };

    let body = serde_json::json!({
        "status": status,
        "service": "rows",
        "database": db_ok,
        "rabbitmq": mq_ok,
        "agones": agones_ok,
        "sessions_cached": hs.app.sessions.len(),
        "zones_tracked": hs.app.zone_servers.len(),
        "spinup_locks": hs.app.zone_spinup_locks.len(),
    });

    (http_status, Json(body)).into_response()
}

// ─── Public API ──────────────────────────────────────────────

fn public_api_routes(hs: HandlerState) -> Router {
    Router::new()
        .route("/api/Users/LoginAndCreateSession", post(login))
        .route(
            "/api/Users/ExternalLoginAndCreateSession",
            post(external_login),
        )
        .route("/api/Users/RegisterUser", post(register_user))
        .route("/api/Users/Logout", post(logout))
        .route("/api/Users/GetUserSession", get(get_user_session))
        .route("/api/Users/GetAllCharacters", post(get_all_characters))
        .route("/api/Users/CreateCharacter", post(create_character))
        .route(
            "/api/Users/CreateCharacterUsingDefaultCharacterValues",
            post(create_char_defaults),
        )
        .route(
            "/api/Users/SetSelectedCharacterAndGetUserSession",
            post(set_selected_char),
        )
        .route("/api/Users/RemoveCharacter", post(remove_character))
        .route(
            "/api/Users/GetServerToConnectTo",
            post(get_server_to_connect_to),
        )
        .route(
            "/api/Users/UserSessionSetSelectedCharacter",
            post(user_session_set_selected_char),
        )
        .route(
            "/api/Users/GetPlayerGroupsCharacterIsIn",
            post(get_player_groups),
        )
        .route("/api/Characters/ByName", post(get_char_by_name_public))
        .route(
            "/api/Characters/GetDefaultCustomData",
            post(get_default_custom_data),
        )
        .route("/api/System/Status", get(system_status))
        .layer(middleware::from_fn(require_customer_guid))
        .with_state(hs)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LoginDto {
    email: String,
    password: String,
}

async fn login(
    State(hs): State<HandlerState>,
    Json(body): Json<LoginDto>,
) -> ApiResult<crate::models::LoginResult> {
    let result = hs.svc.login(&body.email, &body.password).await?;
    Ok(Json(result))
}

/// External login stub — future Supabase OAuth integration.
///
/// TODO(supabase): Implement external auth flow:
///   1. Accept provider_token (Discord, GitHub, Google) from Supabase Auth
///   2. Verify token against Supabase JWT / provider API
///   3. Find-or-create OWS user from Supabase user.id
///   4. Create session and return UserSessionGUID
///
/// This enables direct Supabase Auth → OWS session bridging,
/// removing the need for separate OWS account creation.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExternalLoginDto {
    provider: String,
    provider_token: String,
}

async fn external_login(Json(body): Json<ExternalLoginDto>) -> Json<crate::models::LoginResult> {
    tracing::info!(provider = %body.provider, "ExternalLogin called (not yet implemented)");
    Json(crate::models::LoginResult {
        authenticated: false,
        user_session_guid: None,
        error_message: format!(
            "External login via '{}' not yet implemented. Future: Supabase OAuth integration.",
            body.provider
        ),
    })
}

async fn get_user_session(
    State(hs): State<HandlerState>,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> ApiResult<crate::models::UserSession> {
    let session_guid = params
        .get("userSessionGUID")
        .and_then(|s| Uuid::parse_str(s).ok())
        .ok_or_else(|| RowsError::BadRequest("Missing userSessionGUID".into()))?;

    let session = hs.svc.get_session(session_guid).await?;
    Ok(Json(session))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GetAllCharsDto {
    #[serde(rename = "userSessionGUID", alias = "userSessionGUId")]
    user_session_guid: Uuid,
}

async fn get_all_characters(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
    Json(body): Json<GetAllCharsDto>,
) -> ApiResult<Vec<crate::models::Character>> {
    let customer_guid = extract_customer_guid(&headers);
    let chars = hs
        .svc
        .get_all_characters(body.user_session_guid, customer_guid)
        .await?;
    Ok(Json(chars))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GetServerDto {
    #[serde(rename = "userSessionGUID", alias = "userSessionGUId")]
    _user_session_guid: Uuid,
    character_name: String,
    zone_name: String,
}

async fn get_server_to_connect_to(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
    Json(body): Json<GetServerDto>,
) -> ApiResult<crate::models::JoinMapResult> {
    let customer_guid = extract_customer_guid(&headers);
    let result = hs
        .svc
        .get_server_to_connect_to(customer_guid, &body.character_name, &body.zone_name)
        .await?;
    Ok(Json(result))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GetByNameDto {
    #[serde(rename = "userSessionGUID", alias = "userSessionGUId")]
    _user_session_guid: String,
    character_name: String,
}

async fn get_char_by_name_public(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
    Json(body): Json<GetByNameDto>,
) -> ApiResult<crate::models::Character> {
    let customer_guid = extract_customer_guid(&headers);
    let ch = hs
        .svc
        .get_character_by_name(customer_guid, &body.character_name)
        .await?;
    Ok(Json(ch))
}

async fn system_status() -> Json<bool> {
    Json(true)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RegisterUserDto {
    email: String,
    password: String,
    first_name: String,
    last_name: String,
}

async fn register_user(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
    Json(body): Json<RegisterUserDto>,
) -> Json<SuccessResponse> {
    let _customer_guid = extract_customer_guid(&headers);
    use argon2::{
        Argon2, PasswordHasher, password_hash::SaltString, password_hash::rand_core::OsRng,
    };
    let salt = SaltString::generate(&mut OsRng);
    let password_hash = match Argon2::default().hash_password(body.password.as_bytes(), &salt) {
        Ok(h) => h.to_string(),
        Err(e) => return Json(SuccessResponse::err(format!("Hash error: {e}"))),
    };

    match hs
        .svc
        .register(
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
#[serde(rename_all = "camelCase")]
struct LogoutDto {
    #[serde(rename = "userSessionGUID", alias = "userSessionGUId")]
    user_session_guid: Uuid,
}

async fn logout(
    State(hs): State<HandlerState>,
    Json(body): Json<LogoutDto>,
) -> Json<SuccessResponse> {
    match hs.svc.logout(body.user_session_guid).await {
        Ok(()) => Json(SuccessResponse::ok()),
        Err(e) => Json(SuccessResponse::err(e.to_string())),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateCharDto {
    #[serde(rename = "userSessionGUID", alias = "userSessionGUId")]
    user_session_guid: Uuid,
    character_name: String,
    class_name: String,
}

async fn create_character(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
    Json(body): Json<CreateCharDto>,
) -> Json<SuccessResponse> {
    let customer_guid = extract_customer_guid(&headers);
    match hs
        .svc
        .create_character(
            body.user_session_guid,
            customer_guid,
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
#[serde(rename_all = "camelCase")]
struct RemoveCharDto {
    #[serde(rename = "userSessionGUID", alias = "userSessionGUId")]
    _user_session_guid: Uuid,
    character_name: String,
}

async fn remove_character(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
    Json(body): Json<RemoveCharDto>,
) -> Json<SuccessResponse> {
    let customer_guid = extract_customer_guid(&headers);
    match hs
        .svc
        .remove_character(customer_guid, &body.character_name)
        .await
    {
        Ok(()) => Json(SuccessResponse::ok()),
        Err(e) => Json(SuccessResponse::err(e.to_string())),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateCharDefaultsDto {
    #[serde(rename = "userSessionGUID", alias = "userSessionGUId")]
    user_session_guid: Uuid,
    character_name: String,
    default_set_name: String,
}

async fn create_char_defaults(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
    Json(body): Json<CreateCharDefaultsDto>,
) -> Json<SuccessResponse> {
    let customer_guid = extract_customer_guid(&headers);
    match hs
        .svc
        .create_character_with_defaults(
            body.user_session_guid,
            customer_guid,
            &body.character_name,
            &body.default_set_name,
        )
        .await
    {
        Ok(()) => Json(SuccessResponse::ok()),
        Err(e) => Json(SuccessResponse::err(e.to_string())),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SetSelectedCharDto {
    #[serde(rename = "userSessionGUID", alias = "userSessionGUId")]
    user_session_guid: Uuid,
    #[serde(alias = "selectedCharacterName")]
    character_name: String,
}

async fn set_selected_char(
    State(hs): State<HandlerState>,
    Json(body): Json<SetSelectedCharDto>,
) -> ApiResult<crate::models::UserSessionWithCharacter> {
    let session = hs
        .svc
        .set_selected_character_and_get_session(body.user_session_guid, &body.character_name)
        .await?;
    Ok(Json(session))
}

#[derive(Deserialize)]
struct UpdatePlayersWrapper {
    request: UpdatePlayersPayload,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdatePlayersPayload {
    zone_instance_id: i32,
    number_of_connected_players: i32,
}

async fn update_number_of_players(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
    Json(body): Json<UpdatePlayersWrapper>,
) -> Json<SuccessResponse> {
    let customer_guid = extract_customer_guid(&headers);
    match hs
        .svc
        .update_number_of_players(
            customer_guid,
            body.request.zone_instance_id,
            body.request.number_of_connected_players,
        )
        .await
    {
        Ok(()) => Json(SuccessResponse::ok()),
        Err(e) => Json(SuccessResponse::err(e.to_string())),
    }
}

// ─── Instance Management ─────────────────────────────────────

fn instance_mgmt_routes(hs: HandlerState) -> Router {
    Router::new()
        .route("/api/Instance/SetZoneInstanceStatus", post(set_zone_status))
        .route(
            "/api/Instance/GetZoneInstancesForWorldServer",
            post(get_zone_instances),
        )
        .route(
            "/api/Instance/UpdateNumberOfPlayers",
            post(update_number_of_players),
        )
        .route("/api/Instance/GetZoneInstance", post(get_zone_instance))
        .route(
            "/api/Instance/GetServerInstanceFromPort",
            post(get_server_instance_from_port),
        )
        .route("/api/Instance/RegisterLauncher", post(register_launcher))
        .route(
            "/api/Instance/StartInstanceLauncher",
            get(start_instance_launcher),
        )
        .route(
            "/api/Instance/ShutDownInstanceLauncher",
            post(shut_down_instance_launcher),
        )
        .route(
            "/api/Instance/SpinUpServerInstance",
            post(spin_up_server_instance),
        )
        .route(
            "/api/Instance/ShutDownServerInstance",
            post(shut_down_server_instance),
        )
        .route(
            "/api/Instance/GetServerToConnectTo",
            post(instance_get_server_to_connect_to),
        )
        .route(
            "/api/Instance/GetZoneInstancesForZone",
            post(get_zone_instances_for_zone),
        )
        .route(
            "/api/Instance/GetCurrentWorldTime",
            post(get_current_world_time),
        )
        .layer(middleware::from_fn(require_customer_guid))
        .with_state(hs)
}

#[derive(Deserialize)]
struct SetZoneStatusWrapper {
    request: SetZoneStatusPayload,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SetZoneStatusPayload {
    #[serde(alias = "zoneInstanceID", alias = "ZoneInstanceID")]
    zone_instance_id: i32,
    instance_status: i32,
}

async fn set_zone_status(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
    Json(body): Json<SetZoneStatusWrapper>,
) -> Json<SuccessResponse> {
    let customer_guid = extract_customer_guid(&headers);
    match hs
        .svc
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
#[serde(rename_all = "camelCase")]
struct GetZoneInstancesPayload {
    #[serde(alias = "worldServerID", alias = "WorldServerID")]
    world_server_id: i32,
}

async fn get_zone_instances(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
    Json(body): Json<GetZoneInstancesWrapper>,
) -> ApiResult<Vec<crate::models::ZoneInstance>> {
    let customer_guid = extract_customer_guid(&headers);
    let zones = hs
        .svc
        .get_zone_instances(customer_guid, body.request.world_server_id)
        .await?;
    Ok(Json(zones))
}

#[derive(Deserialize)]
struct RegisterLauncherWrapper {
    #[serde(rename = "request")]
    request: RegisterLauncherPayload,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RegisterLauncherPayload {
    #[serde(alias = "launcherGUID", alias = "LauncherGUID")]
    launcher_guid: String,
    server_ip: String,
    max_number_of_instances: i32,
    internal_server_ip: String,
    starting_instance_port: i32,
}

async fn register_launcher(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
    Json(body): Json<RegisterLauncherWrapper>,
) -> Json<SuccessResponse> {
    let customer_guid = extract_customer_guid(&headers);
    let r = &body.request;
    let repo = crate::repo::InstanceRepo(&hs.app.db);
    match repo
        .register_launcher(
            customer_guid,
            &r.launcher_guid,
            &r.server_ip,
            r.max_number_of_instances,
            &r.internal_server_ip,
            r.starting_instance_port,
        )
        .await
    {
        Ok(id) => {
            tracing::info!(world_server_id = id, "Launcher registered");
            Json(SuccessResponse::ok())
        }
        Err(e) => Json(SuccessResponse::err(e.to_string())),
    }
}

async fn start_instance_launcher(State(hs): State<HandlerState>, headers: HeaderMap) -> String {
    let customer_guid = extract_customer_guid(&headers);
    let launcher_guid = headers
        .get("x-launcherguid")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    let repo = crate::repo::InstanceRepo(&hs.app.db);
    match repo
        .register_launcher(customer_guid, launcher_guid, "", 10, "", 7778)
        .await
    {
        Ok(id) => id.to_string(),
        Err(_) => "-1".to_string(),
    }
}

async fn shut_down_instance_launcher(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
) -> Json<SuccessResponse> {
    let customer_guid = extract_customer_guid(&headers);
    // world_server_id would come from the launcher's state — use 0 as fallback
    match hs.svc.shut_down_launcher(customer_guid, 0).await {
        Ok(()) => Json(SuccessResponse::ok()),
        Err(e) => Json(SuccessResponse::err(e.to_string())),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SpinUpDto {
    #[serde(alias = "worldServerID", alias = "WorldServerID")]
    world_server_id: i32,
    #[serde(alias = "zoneInstanceID", alias = "ZoneInstanceID")]
    zone_instance_id: i32,
    zone_name: String,
    port: i32,
}

async fn spin_up_server_instance(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
    Json(body): Json<SpinUpDto>,
) -> Json<SuccessResponse> {
    let customer_guid = extract_customer_guid(&headers);
    match hs
        .svc
        .spin_up_server_instance(
            customer_guid,
            body.world_server_id,
            body.zone_instance_id,
            &body.zone_name,
            body.port,
        )
        .await
    {
        Ok(()) => Json(SuccessResponse::ok()),
        Err(e) => Json(SuccessResponse::err(e.to_string())),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ShutDownServerDto {
    #[serde(alias = "worldServerID", alias = "WorldServerID")]
    _world_server_id: i32,
    #[serde(alias = "zoneInstanceID", alias = "ZoneInstanceID")]
    zone_instance_id: i32,
}

async fn shut_down_server_instance(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
    Json(body): Json<ShutDownServerDto>,
) -> Json<SuccessResponse> {
    let customer_guid = extract_customer_guid(&headers);
    match hs
        .svc
        .shut_down_server_instance(customer_guid, body.zone_instance_id)
        .await
    {
        Ok(()) => Json(SuccessResponse::ok()),
        Err(e) => Json(SuccessResponse::err(e.to_string())),
    }
}

async fn instance_get_server_to_connect_to(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
    Json(body): Json<GetServerDto>,
) -> ApiResult<crate::models::JoinMapResult> {
    let customer_guid = extract_customer_guid(&headers);
    let result = hs
        .svc
        .get_server_to_connect_to(customer_guid, &body.character_name, &body.zone_name)
        .await?;
    Ok(Json(result))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ZoneNameDto {
    map_name: String,
}

async fn get_zone_instances_for_zone(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
    Json(body): Json<ZoneNameDto>,
) -> ApiResult<Vec<crate::models::ZoneInstance>> {
    let customer_guid = extract_customer_guid(&headers);
    let zones = hs
        .svc
        .get_zone_instances_for_zone(customer_guid, &body.map_name)
        .await?;
    Ok(Json(zones))
}

#[derive(Deserialize)]
struct WorldTimeWrapper {
    request: WorldTimePayload,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorldTimePayload {
    #[serde(alias = "worldServerID", alias = "WorldServerID")]
    world_server_id: i32,
}

async fn get_current_world_time(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
    Json(body): Json<WorldTimeWrapper>,
) -> Json<serde_json::Value> {
    let customer_guid = extract_customer_guid(&headers);
    match hs
        .svc
        .get_current_world_time(customer_guid, body.request.world_server_id)
        .await
    {
        Ok(time) => Json(serde_json::json!({"currentWorldTime": time})),
        Err(e) => Json(serde_json::json!({"error": e.to_string()})),
    }
}

async fn user_session_set_selected_char(
    State(hs): State<HandlerState>,
    Json(body): Json<SetSelectedCharDto>,
) -> Json<SuccessResponse> {
    match hs
        .svc
        .set_selected_character_and_get_session(body.user_session_guid, &body.character_name)
        .await
    {
        Ok(_) => Json(SuccessResponse::ok()),
        Err(e) => Json(SuccessResponse::err(e.to_string())),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DefaultCustomDataDto {
    default_set_name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GetPlayerGroupsDto {
    #[serde(rename = "userSessionGUID", alias = "userSessionGUId")]
    _user_session_guid: Uuid,
    character_name: String,
    #[serde(alias = "playerGroupTypeID", alias = "PlayerGroupTypeID")]
    player_group_type_id: i32,
}

async fn get_player_groups(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
    Json(body): Json<GetPlayerGroupsDto>,
) -> ApiResult<Vec<crate::models::PlayerGroupMembership>> {
    let customer_guid = extract_customer_guid(&headers);
    let groups = hs
        .svc
        .get_player_groups_character_is_in(
            customer_guid,
            &body.character_name,
            body.player_group_type_id,
        )
        .await?;
    Ok(Json(groups))
}

async fn get_default_custom_data(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
    Json(body): Json<DefaultCustomDataDto>,
) -> ApiResult<CustomDataRows> {
    let customer_guid = extract_customer_guid(&headers);
    let repo = crate::repo::CharsRepo(&hs.app.db);
    let data = repo
        .get_default_custom_data(customer_guid, &body.default_set_name)
        .await?;
    Ok(Json(CustomDataRows { rows: data }))
}

// ─── Character Persistence ───────────────────────────────────

fn character_persistence_routes(hs: HandlerState) -> Router {
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
        .route(
            "/api/Status/GetCharacterStatuses",
            post(get_character_statuses),
        )
        .layer(middleware::from_fn(require_customer_guid))
        .with_state(hs)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CharNameDto {
    character_name: String,
}

async fn get_char_by_name(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
    Json(body): Json<CharNameDto>,
) -> ApiResult<crate::models::Character> {
    let customer_guid = extract_customer_guid(&headers);
    let ch = hs
        .svc
        .get_character_by_name(customer_guid, &body.character_name)
        .await?;
    Ok(Json(ch))
}

async fn get_custom_data(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
    Json(body): Json<CharNameDto>,
) -> ApiResult<CustomDataRows> {
    let customer_guid = extract_customer_guid(&headers);
    let data = hs
        .svc
        .get_custom_data(customer_guid, &body.character_name)
        .await?;
    Ok(Json(CustomDataRows { rows: data }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdatePositionsDto {
    serialized_player_location_data: String,
    #[allow(dead_code)]
    map_name: String,
}

async fn update_all_positions(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
    Json(body): Json<UpdatePositionsDto>,
) -> Json<SuccessResponse> {
    let customer_guid = extract_customer_guid(&headers);

    // Parse pipe-separated format: CharName:X:Y:Z:RX:RY:RZ|CharName2:...
    // Zero-alloc: use split iterator instead of collecting into Vec
    for entry in body.serialized_player_location_data.split('|') {
        let mut it = entry.splitn(8, ':');
        let Some(char_name) = it.next() else { continue };
        let (Some(sx), Some(sy), Some(sz), Some(srx), Some(sry), Some(srz)) = (
            it.next(),
            it.next(),
            it.next(),
            it.next(),
            it.next(),
            it.next(),
        ) else {
            continue;
        };
        let (Ok(x), Ok(y), Ok(z), Ok(rx), Ok(ry), Ok(rz)) = (
            sx.parse::<f64>(),
            sy.parse::<f64>(),
            sz.parse::<f64>(),
            srx.parse::<f64>(),
            sry.parse::<f64>(),
            srz.parse::<f64>(),
        ) else {
            continue;
        };

        if let Err(e) = hs
            .svc
            .update_position(customer_guid, char_name, x, y, z, rx, ry, rz)
            .await
        {
            tracing::warn!(char_name, error = %e, "position update failed");
        }
    }

    Json(SuccessResponse::ok())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AddCustomDataDto {
    character_name: String,
    custom_character_data_key: String,
    custom_character_data_value: String,
}

async fn add_or_update_custom_data(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
    Json(body): Json<AddCustomDataDto>,
) -> Json<SuccessResponse> {
    let customer_guid = extract_customer_guid(&headers);
    match hs
        .svc
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
#[serde(rename_all = "camelCase")]
struct UpdateStatsDto {
    character_name: String,
    // C# sends individual stat fields — we accept as JSON
    #[serde(flatten)]
    stats: serde_json::Value,
}

async fn update_character_stats(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
    Json(body): Json<UpdateStatsDto>,
) -> Json<SuccessResponse> {
    let customer_guid = extract_customer_guid(&headers);
    let stats_json = serde_json::to_string(&body.stats).unwrap_or_default();
    match hs
        .svc
        .update_stats(customer_guid, &body.character_name, &stats_json)
        .await
    {
        Ok(()) => Json(SuccessResponse::ok()),
        Err(e) => Json(SuccessResponse::err(e.to_string())),
    }
}

async fn player_logout(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
    Json(body): Json<CharNameDto>,
) -> Json<SuccessResponse> {
    let customer_guid = extract_customer_guid(&headers);
    match hs
        .svc
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

fn abilities_routes(hs: HandlerState) -> Router {
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
        .route(
            "/api/Abilities/UpdateAbilityOnCharacter",
            post(update_ability),
        )
        .route("/api/Abilities/GetAbilityBars", post(get_ability_bars))
        .route(
            "/api/Abilities/GetAbilityBarsAndAbilities",
            post(get_ability_bars_and_abilities),
        )
        .route("/api/Abilities/GetAbilities", get(get_abilities_list))
        .layer(middleware::from_fn(require_customer_guid))
        .with_state(hs)
}

async fn get_character_abilities(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
    Json(body): Json<CharNameDto>,
) -> ApiResult<Vec<crate::models::CharacterAbility>> {
    let customer_guid = extract_customer_guid(&headers);
    let abilities = hs
        .svc
        .get_character_abilities(customer_guid, &body.character_name)
        .await?;
    Ok(Json(abilities))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AddAbilityDto {
    character_name: String,
    ability_name: String,
    ability_level: i32,
}

async fn add_ability(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
    Json(body): Json<AddAbilityDto>,
) -> Json<SuccessResponse> {
    let customer_guid = extract_customer_guid(&headers);
    match hs
        .svc
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
#[serde(rename_all = "camelCase")]
struct RemoveAbilityDto {
    character_name: String,
    ability_name: String,
}

async fn remove_ability(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
    Json(body): Json<RemoveAbilityDto>,
) -> Json<SuccessResponse> {
    let customer_guid = extract_customer_guid(&headers);
    match hs
        .svc
        .remove_ability(customer_guid, &body.character_name, &body.ability_name)
        .await
    {
        Ok(()) => Json(SuccessResponse::ok()),
        Err(e) => Json(SuccessResponse::err(e.to_string())),
    }
}

async fn update_ability(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
    Json(body): Json<AddAbilityDto>,
) -> Json<SuccessResponse> {
    let customer_guid = extract_customer_guid(&headers);
    match hs
        .svc
        .update_ability(
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

async fn get_ability_bars(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
    Json(body): Json<CharNameDto>,
) -> ApiResult<Vec<crate::models::AbilityBar>> {
    let customer_guid = extract_customer_guid(&headers);
    let bars = hs
        .svc
        .get_ability_bars(customer_guid, &body.character_name)
        .await?;
    Ok(Json(bars))
}

async fn get_ability_bars_and_abilities(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
    Json(body): Json<CharNameDto>,
) -> ApiResult<Vec<crate::models::AbilityBarAbility>> {
    let customer_guid = extract_customer_guid(&headers);
    let items = hs
        .svc
        .get_ability_bars_and_abilities(customer_guid, &body.character_name)
        .await?;
    Ok(Json(items))
}

async fn get_abilities_list() -> Json<Vec<crate::models::CharacterAbility>> {
    // TODO: return all abilities for the customer
    Json(Vec::new())
}

// ─── Zones ───────────────────────────────────────────────────

fn zones_routes(hs: HandlerState) -> Router {
    Router::new()
        .route("/api/Zones/AddZone", post(add_zone))
        .layer(middleware::from_fn(require_customer_guid))
        .with_state(hs)
}

#[derive(Deserialize)]
struct AddZoneWrapper {
    #[serde(rename = "addOrUpdateZone")]
    add_or_update_zone: AddZonePayload,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AddZonePayload {
    map_name: String,
    zone_name: String,
    soft_player_cap: i32,
    hard_player_cap: i32,
    map_mode: i32,
}

async fn add_zone(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
    Json(body): Json<AddZoneWrapper>,
) -> Json<SuccessResponse> {
    let customer_guid = extract_customer_guid(&headers);
    let z = &body.add_or_update_zone;
    match hs
        .svc
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

fn global_data_routes(hs: HandlerState) -> Router {
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
        .with_state(hs)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SetGlobalDataDto {
    global_data_key: String,
    global_data_value: String,
}

async fn set_global_data(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
    Json(body): Json<SetGlobalDataDto>,
) -> Json<SuccessResponse> {
    let customer_guid = extract_customer_guid(&headers);
    match hs
        .svc
        .set_global_data(
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
    State(hs): State<HandlerState>,
    headers: HeaderMap,
    Path(key): Path<String>,
) -> ApiResult<Option<crate::models::GlobalData>> {
    let customer_guid = extract_customer_guid(&headers);
    let data = hs.svc.get_global_data(customer_guid, &key).await?;
    Ok(Json(data))
}

// ─── Instance Lookups ────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ZoneInstanceIdDto {
    zone_instance_id: i32,
}

async fn get_zone_instance(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
    Json(body): Json<ZoneInstanceIdDto>,
) -> ApiResult<Option<crate::models::ServerInstanceInfo>> {
    let customer_guid = extract_customer_guid(&headers);
    let repo = crate::repo::InstanceRepo(&hs.app.db);
    let info = repo
        .get_zone_instance(customer_guid, body.zone_instance_id)
        .await?;
    Ok(Json(info))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PortDto {
    port: i32,
}

async fn get_server_instance_from_port(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
    Json(body): Json<PortDto>,
) -> ApiResult<Option<crate::models::ServerInstanceInfo>> {
    let customer_guid = extract_customer_guid(&headers);
    let repo = crate::repo::InstanceRepo(&hs.app.db);
    let info = repo
        .get_server_instance_from_port(customer_guid, body.port)
        .await?;
    Ok(Json(info))
}

// ─── Character Statuses ──────────────────────────────────────

async fn get_character_statuses(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
    Json(body): Json<CharNameDto>,
) -> ApiResult<Vec<crate::models::CharacterStatus>> {
    let customer_guid = extract_customer_guid(&headers);
    let repo = crate::repo::CharsRepo(&hs.app.db);
    let statuses = repo
        .get_character_statuses(customer_guid, &body.character_name)
        .await?;
    Ok(Json(statuses))
}

// ─── Management (Admin) ─────────────────────────────────────

fn management_routes(hs: HandlerState) -> Router {
    Router::new()
        .route(
            "/api/Users",
            get(list_users).post(create_user_admin).put(edit_user_admin),
        )
        .layer(middleware::from_fn(require_customer_guid))
        .with_state(hs)
}

async fn list_users(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
) -> ApiResult<Vec<crate::models::UserInfo>> {
    let customer_guid = extract_customer_guid(&headers);
    let repo = crate::repo::UsersRepo(&hs.app.db);
    let users = repo.list_users(customer_guid).await?;
    Ok(Json(users))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateUserAdminDto {
    first_name: String,
    last_name: String,
    email: String,
    password: String,
}

async fn create_user_admin(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
    Json(body): Json<CreateUserAdminDto>,
) -> Json<SuccessResponse> {
    let customer_guid = extract_customer_guid(&headers);
    use argon2::{
        Argon2, PasswordHasher,
        password_hash::{SaltString, rand_core::OsRng},
    };
    let salt = SaltString::generate(&mut OsRng);
    let hash = match Argon2::default().hash_password(body.password.as_bytes(), &salt) {
        Ok(h) => h.to_string(),
        Err(e) => return Json(SuccessResponse::err(format!("Hash error: {e}"))),
    };
    let repo = crate::repo::UsersRepo(&hs.app.db);
    match repo
        .create_user_admin(
            customer_guid,
            &body.first_name,
            &body.last_name,
            &body.email,
            &hash,
        )
        .await
    {
        Ok(_) => Json(SuccessResponse::ok()),
        Err(e) => Json(SuccessResponse::err(e.to_string())),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EditUserAdminDto {
    #[serde(alias = "UserGUID", alias = "userGUId")]
    user_guid: Uuid,
    first_name: String,
    last_name: String,
    email: String,
}

async fn edit_user_admin(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
    Json(body): Json<EditUserAdminDto>,
) -> Json<SuccessResponse> {
    let customer_guid = extract_customer_guid(&headers);
    let repo = crate::repo::UsersRepo(&hs.app.db);
    match repo
        .update_user_admin(
            customer_guid,
            body.user_guid,
            &body.first_name,
            &body.last_name,
            &body.email,
        )
        .await
    {
        Ok(()) => Json(SuccessResponse::ok()),
        Err(e) => Json(SuccessResponse::err(e.to_string())),
    }
}
