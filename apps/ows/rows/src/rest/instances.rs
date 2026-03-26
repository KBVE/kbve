use super::HandlerState;
use crate::error::{ApiResult, SuccessResponse};
use crate::middleware::{extract_customer_guid, require_customer_guid};
use axum::{
    Json, Router,
    extract::State,
    http::HeaderMap,
    middleware,
    routing::{get, post},
};
use serde::Deserialize;
use uuid::Uuid;

pub(super) fn instance_mgmt_routes(hs: HandlerState) -> Router {
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
    #[serde(alias = "serverIP")]
    server_ip: String,
    #[serde(alias = "maxNumberOfInstances")]
    max_number_of_instances: i32,
    #[serde(alias = "internalServerIP")]
    internal_server_ip: String,
    #[serde(alias = "startingInstancePort")]
    starting_instance_port: i32,
}

async fn register_launcher(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
    Json(body): Json<RegisterLauncherWrapper>,
) -> Json<serde_json::Value> {
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
            Json(serde_json::json!({
                "success": true,
                "errorMessage": "",
                "worldServerId": id
            }))
        }
        Err(e) => Json(serde_json::json!({
            "success": false,
            "errorMessage": e.to_string()
        })),
    }
}

async fn start_instance_launcher(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
) -> axum::response::Response {
    use axum::response::IntoResponse;

    let customer_guid = extract_customer_guid(&headers);
    let launcher_guid = match headers
        .get("x-launcherguid")
        .and_then(|v| v.to_str().ok())
        .filter(|s| !s.is_empty())
    {
        Some(g) => g.to_string(),
        None => {
            return (
                axum::http::StatusCode::BAD_REQUEST,
                "Missing or empty x-launcherguid header",
            )
                .into_response();
        }
    };

    let repo = crate::repo::InstanceRepo(&hs.app.db);
    match repo
        .register_launcher(customer_guid, &launcher_guid, "", 10, "", 7778)
        .await
    {
        Ok(id) => id.to_string().into_response(),
        Err(e) => {
            tracing::error!(error = %e, "StartInstanceLauncher failed");
            (axum::http::StatusCode::INTERNAL_SERVER_ERROR, "-1").into_response()
        }
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GetServerDto {
    #[serde(default, rename = "userSessionGUID", alias = "userSessionGUId")]
    _user_session_guid: Option<Uuid>,
    character_name: String,
    zone_name: String,
    #[serde(default)]
    _player_group_type: Option<i32>,
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
        Ok(time) => Json(serde_json::json!({"CurrentWorldTime": time})),
        Err(e) => Json(serde_json::json!({"error": e.to_string()})),
    }
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
