//! Zone-instance + launcher lifecycle routes (`/api/Instance/*`). Write/lifecycle routes require an
//! `x-service-key` (dedicated server / launcher); read routes are tenant-gated by
//! `require_customer_guid`.

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
use utoipa::ToSchema;
use uuid::Uuid;

pub(super) fn instance_mgmt_routes(hs: HandlerState) -> Router {
    let server = Router::new()
        .route("/api/Instance/SetZoneInstanceStatus", post(set_zone_status))
        .route(
            "/api/Instance/UpdateNumberOfPlayers",
            post(update_number_of_players),
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
        .layer(middleware::from_fn_with_state(
            hs.clone(),
            super::require_service_key,
        ));

    server
        .route(
            "/api/Instance/GetZoneInstancesForWorldServer",
            post(get_zone_instances),
        )
        .route("/api/Instance/GetZoneInstance", post(get_zone_instance))
        .route(
            "/api/Instance/GetServerInstanceFromPort",
            post(get_server_instance_from_port),
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
        .route("/api/Instance/GetZoneAssignment", post(get_zone_assignment))
        .layer(middleware::from_fn_with_state(
            hs.clone(),
            require_customer_guid,
        ))
        .with_state(hs)
}

#[derive(Deserialize, ToSchema)]
pub(crate) struct SetZoneStatusWrapper {
    #[schema(inline)]
    request: SetZoneStatusPayload,
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SetZoneStatusPayload {
    #[serde(alias = "zoneInstanceID", alias = "ZoneInstanceID")]
    zone_instance_id: i32,
    instance_status: i32,
}

/// Sets a zone instance's status code. Requires `x-service-key`.
#[utoipa::path(post, path = "/api/Instance/SetZoneInstanceStatus", tag = "instances",
    request_body = inline(SetZoneStatusWrapper),
    responses(
        (status = 200, description = "Update result", body = SuccessResponse),
        (status = 401, description = "Missing or invalid x-service-key"),
    )
)]
pub(crate) async fn set_zone_status(
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

#[derive(Deserialize, ToSchema)]
pub(crate) struct GetZoneInstancesWrapper {
    #[schema(inline)]
    request: GetZoneInstancesPayload,
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GetZoneInstancesPayload {
    #[serde(alias = "worldServerID", alias = "WorldServerID")]
    world_server_id: i32,
}

/// Lists zone instances managed by a world server.
#[utoipa::path(post, path = "/api/Instance/GetZoneInstancesForWorldServer", tag = "instances",
    request_body = inline(GetZoneInstancesWrapper),
    responses((status = 200, description = "Zone instances", body = [crate::models::ZoneInstance]))
)]
pub(crate) async fn get_zone_instances(
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

#[derive(Deserialize, ToSchema)]
pub(crate) struct RegisterLauncherWrapper {
    #[serde(rename = "request")]
    #[schema(inline)]
    request: RegisterLauncherPayload,
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RegisterLauncherPayload {
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

/// Registers an instance launcher and returns its assigned `worldServerId`. Requires
/// `x-service-key`. Response is the OWS `{ success, errorMessage, worldServerId }` envelope.
#[utoipa::path(post, path = "/api/Instance/RegisterLauncher", tag = "instances",
    request_body = inline(RegisterLauncherWrapper),
    responses(
        (status = 200, description = "OWS envelope with worldServerId"),
        (status = 401, description = "Missing or invalid x-service-key"),
    )
)]
pub(crate) async fn register_launcher(
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

/// Convenience launcher registration keyed off the `x-launcherguid` header; returns the assigned
/// world-server id as a plain-text body. Requires `x-service-key`.
#[utoipa::path(get, path = "/api/Instance/StartInstanceLauncher", tag = "instances",
    params(("x-launcherguid" = String, Header, description = "Launcher GUID")),
    responses(
        (status = 200, description = "Assigned world-server id (plain text)"),
        (status = 400, description = "Missing or empty x-launcherguid header"),
        (status = 500, description = "Registration failed (body `-1`)"),
    )
)]
pub(crate) async fn start_instance_launcher(
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

/// Shuts down all launchers for the tenant. Requires `x-service-key`.
#[utoipa::path(post, path = "/api/Instance/ShutDownInstanceLauncher", tag = "instances",
    responses(
        (status = 200, description = "Shutdown result", body = SuccessResponse),
        (status = 401, description = "Missing or invalid x-service-key"),
    )
)]
pub(crate) async fn shut_down_instance_launcher(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
) -> Json<SuccessResponse> {
    let customer_guid = extract_customer_guid(&headers);
    // Launcher doesn't echo its world_server_id back, so we fall back to 0 (all launchers).
    match hs.svc.shut_down_launcher(customer_guid, 0).await {
        Ok(()) => Json(SuccessResponse::ok()),
        Err(e) => Json(SuccessResponse::err(e.to_string())),
    }
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SpinUpDto {
    #[serde(alias = "worldServerID", alias = "WorldServerID")]
    world_server_id: i32,
    #[serde(alias = "zoneInstanceID", alias = "ZoneInstanceID")]
    zone_instance_id: i32,
    zone_name: String,
    port: i32,
}

/// Spins up a server instance for a zone. Requires `x-service-key`.
#[utoipa::path(post, path = "/api/Instance/SpinUpServerInstance", tag = "instances",
    request_body = inline(SpinUpDto),
    responses(
        (status = 200, description = "Spin-up result", body = SuccessResponse),
        (status = 401, description = "Missing or invalid x-service-key"),
    )
)]
pub(crate) async fn spin_up_server_instance(
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

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ShutDownServerDto {
    #[serde(alias = "worldServerID", alias = "WorldServerID")]
    _world_server_id: i32,
    #[serde(alias = "zoneInstanceID", alias = "ZoneInstanceID")]
    zone_instance_id: i32,
}

/// Shuts down a single server instance. Requires `x-service-key`.
#[utoipa::path(post, path = "/api/Instance/ShutDownServerInstance", tag = "instances",
    request_body = inline(ShutDownServerDto),
    responses(
        (status = 200, description = "Shutdown result", body = SuccessResponse),
        (status = 401, description = "Missing or invalid x-service-key"),
    )
)]
pub(crate) async fn shut_down_server_instance(
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

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GetServerDto {
    #[serde(default, rename = "userSessionGUID", alias = "userSessionGUId")]
    user_session_guid: Option<Uuid>,
    character_name: String,
    zone_name: String,
    #[serde(default)]
    _player_group_type: Option<i32>,
}

/// Instance-namespace variant of `GetServerToConnectTo`; resolves the game server for a character.
#[utoipa::path(post, path = "/api/Instance/GetServerToConnectTo", tag = "instances",
    request_body = inline(GetServerDto),
    responses((status = 200, description = "Connection target", body = crate::models::JoinMapResult))
)]
pub(crate) async fn instance_get_server_to_connect_to(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
    Json(body): Json<GetServerDto>,
) -> ApiResult<crate::models::JoinMapResult> {
    let caller = hs
        .svc
        .confirm_login(&headers, body.user_session_guid)
        .await?;
    let customer_guid = extract_customer_guid(&headers);
    let result = hs
        .svc
        .get_server_to_connect_to(customer_guid, caller, &body.character_name, &body.zone_name)
        .await?;
    Ok(Json(result))
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ZoneNameDto {
    map_name: String,
}

/// Lists every zone instance for a given map.
#[utoipa::path(post, path = "/api/Instance/GetZoneInstancesForZone", tag = "instances",
    request_body = inline(ZoneNameDto),
    responses((status = 200, description = "Zone instances", body = [crate::models::ZoneInstance]))
)]
pub(crate) async fn get_zone_instances_for_zone(
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

#[derive(Deserialize, ToSchema)]
pub(crate) struct WorldTimeWrapper {
    #[schema(inline)]
    request: WorldTimePayload,
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorldTimePayload {
    #[serde(alias = "worldServerID", alias = "WorldServerID")]
    world_server_id: i32,
}

/// Returns the in-game world clock for a world server. Response is `{ "CurrentWorldTime": <f64> }`.
#[utoipa::path(post, path = "/api/Instance/GetCurrentWorldTime", tag = "instances",
    request_body = inline(WorldTimeWrapper),
    responses((status = 200, description = "`{ CurrentWorldTime }` envelope"))
)]
pub(crate) async fn get_current_world_time(
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

#[derive(Deserialize, ToSchema)]
pub(crate) struct UpdatePlayersWrapper {
    #[schema(inline)]
    request: UpdatePlayersPayload,
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UpdatePlayersPayload {
    zone_instance_id: i32,
    number_of_connected_players: i32,
}

/// Reports the live player count for a zone instance. Requires `x-service-key`.
#[utoipa::path(post, path = "/api/Instance/UpdateNumberOfPlayers", tag = "instances",
    request_body = inline(UpdatePlayersWrapper),
    responses(
        (status = 200, description = "Update result", body = SuccessResponse),
        (status = 401, description = "Missing or invalid x-service-key"),
    )
)]
pub(crate) async fn update_number_of_players(
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

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ZoneInstanceIdDto {
    zone_instance_id: i32,
}

/// Fetches a single zone instance's server info, or `null` if absent.
#[utoipa::path(post, path = "/api/Instance/GetZoneInstance", tag = "instances",
    request_body = inline(ZoneInstanceIdDto),
    responses((status = 200, description = "Server instance info (nullable)", body = crate::models::ServerInstanceInfo))
)]
pub(crate) async fn get_zone_instance(
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

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PortDto {
    port: i32,
}

/// Resolves the server instance bound to a port, or `null` if none.
#[utoipa::path(post, path = "/api/Instance/GetServerInstanceFromPort", tag = "instances",
    request_body = inline(PortDto),
    responses((status = 200, description = "Server instance info (nullable)", body = crate::models::ServerInstanceInfo))
)]
pub(crate) async fn get_server_instance_from_port(
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

/// Polled by Iris dedicated servers every ~5s; returns the assigned zone once allocation
/// completes, or `assigned: false` while we're still waiting.
#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ZoneAssignmentDto {
    world_server_id: i32,
}

/// Long-poll for a server's zone assignment. Returns `{ assigned: true, ... }` once allocation
/// completes, otherwise `{ assigned: false, message }`.
#[utoipa::path(post, path = "/api/Instance/GetZoneAssignment", tag = "instances",
    request_body = inline(ZoneAssignmentDto),
    responses((status = 200, description = "Assignment envelope (`assigned` flag + zone details)"))
)]
pub(crate) async fn get_zone_assignment(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
    Json(body): Json<ZoneAssignmentDto>,
) -> Json<serde_json::Value> {
    let customer_guid = extract_customer_guid(&headers);
    let repo = crate::repo::InstanceRepo(&hs.app.db);

    match repo
        .get_zone_assignment(customer_guid, body.world_server_id)
        .await
    {
        Ok(Some(assignment)) => Json(serde_json::json!({
            "assigned": true,
            "zoneInstanceId": assignment.zone_instance_id,
            "mapName": assignment.map_name,
            "zoneName": assignment.zone_name,
            "port": assignment.port,
            "worldServerId": body.world_server_id,
            "seed": assignment.seed,
            "biome": assignment.biome,
        })),
        Ok(None) => Json(serde_json::json!({
            "assigned": false,
            "message": "No zone assignment yet. Keep polling."
        })),
        Err(e) => Json(serde_json::json!({
            "assigned": false,
            "error": e.to_string()
        })),
    }
}
