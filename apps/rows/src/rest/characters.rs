//! Character persistence routes (`/api/Characters/*`, `/api/Status/*`). Read routes are tenant-gated
//! (`require_customer_guid`); write routes (stats, positions, logout) additionally require a valid
//! `x-service-key` and are only callable by the trusted UE dedicated server.

use super::HandlerState;
use crate::error::{ApiResult, SuccessResponse};
use crate::middleware::{extract_customer_guid, require_customer_guid};
use crate::models::CustomDataRows;
use axum::{Json, Router, extract::State, http::HeaderMap, middleware, routing::post};
use serde::Deserialize;
use utoipa::ToSchema;

pub(super) fn character_persistence_routes(hs: HandlerState) -> Router {
    let server = Router::new()
        .route(
            "/api/Characters/UpdateCharacterStats",
            post(update_character_stats),
        )
        .route(
            "/api/Characters/UpdateAllPlayerPositions",
            post(update_all_positions),
        )
        .route("/api/Characters/PlayerLogout", post(player_logout))
        .layer(middleware::from_fn_with_state(
            hs.clone(),
            super::require_service_key,
        ));

    server
        .route("/api/Characters/GetByName", post(get_char_by_name))
        .route("/api/Characters/GetCustomData", post(get_custom_data))
        .route(
            "/api/Characters/AddOrUpdateCustomData",
            post(add_or_update_custom_data),
        )
        .route(
            "/api/Status/GetCharacterStatuses",
            post(get_character_statuses),
        )
        .layer(middleware::from_fn_with_state(
            hs.clone(),
            require_customer_guid,
        ))
        .with_state(hs)
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CharNameDto {
    character_name: String,
}

/// Fetches a character by name within the tenant.
#[utoipa::path(post, path = "/api/Characters/GetByName", tag = "characters",
    request_body = inline(CharNameDto),
    responses((status = 200, description = "Character", body = crate::models::Character))
)]
pub(crate) async fn get_char_by_name(
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

/// Returns all custom-data key/value rows for a character.
#[utoipa::path(post, path = "/api/Characters/GetCustomData", tag = "characters",
    request_body = inline(CharNameDto),
    responses((status = 200, description = "Custom-data rows", body = crate::models::CustomDataRows))
)]
pub(crate) async fn get_custom_data(
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

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UpdatePositionsDto {
    serialized_player_location_data: String,
    #[allow(dead_code)]
    map_name: String,
}

/// Bulk position update from the dedicated server. Requires `x-service-key`. The
/// `serializedPlayerLocationData` field uses the OWS wire format
/// `CharName:X:Y:Z:RX:RY:RZ|CharName2:...`.
#[utoipa::path(post, path = "/api/Characters/UpdateAllPlayerPositions", tag = "characters",
    request_body = inline(UpdatePositionsDto),
    responses(
        (status = 200, description = "Update result", body = SuccessResponse),
        (status = 401, description = "Missing or invalid x-service-key"),
    )
)]
pub(crate) async fn update_all_positions(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
    Json(body): Json<UpdatePositionsDto>,
) -> Json<SuccessResponse> {
    let customer_guid = extract_customer_guid(&headers);

    // Wire format from OWS: `CharName:X:Y:Z:RX:RY:RZ|CharName2:...`
    let mut updated = 0u32;
    let mut failed = 0u32;
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
            failed += 1;
        } else {
            updated += 1;
        }
    }

    if failed > 0 {
        Json(SuccessResponse::err(format!(
            "{failed} position updates failed, {updated} succeeded"
        )))
    } else {
        Json(SuccessResponse::ok())
    }
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AddCustomDataWrapper {
    #[schema(inline)]
    add_or_update_custom_character_data: AddCustomDataPayload,
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AddCustomDataPayload {
    character_name: String,
    custom_field_name: String,
    field_value: String,
}

/// Upserts a single custom-data field on a character.
#[utoipa::path(post, path = "/api/Characters/AddOrUpdateCustomData", tag = "characters",
    request_body = inline(AddCustomDataWrapper),
    responses((status = 200, description = "Upsert result", body = SuccessResponse))
)]
pub(crate) async fn add_or_update_custom_data(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
    Json(body): Json<AddCustomDataWrapper>,
) -> Json<SuccessResponse> {
    let customer_guid = extract_customer_guid(&headers);
    let data = &body.add_or_update_custom_character_data;
    match hs
        .svc
        .add_or_update_custom_data(
            customer_guid,
            &data.character_name,
            &data.custom_field_name,
            &data.field_value,
        )
        .await
    {
        Ok(()) => Json(SuccessResponse::ok()),
        Err(e) => Json(SuccessResponse::err(e.to_string())),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UpdateStatsDto {
    #[serde(alias = "charName", alias = "CharName")]
    character_name: String,
    // C# OWS posts each stat as a top-level field; flatten captures them as a JSON map.
    #[serde(flatten)]
    stats: serde_json::Value,
}

/// Persists arbitrary character stats from the dedicated server. Requires `x-service-key`. The body
/// is `{ "characterName": "...", <statName>: <value>, ... }` — stat fields are flattened into a JSON
/// map alongside `characterName`.
#[utoipa::path(post, path = "/api/Characters/UpdateCharacterStats", tag = "characters",
    request_body = serde_json::Value,
    responses(
        (status = 200, description = "Update result", body = SuccessResponse),
        (status = 401, description = "Missing or invalid x-service-key"),
    )
)]
pub(crate) async fn update_character_stats(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
    Json(body): Json<UpdateStatsDto>,
) -> Json<SuccessResponse> {
    let customer_guid = extract_customer_guid(&headers);
    let stats_json = match serde_json::to_string(&body.stats) {
        Ok(j) => j,
        Err(e) => {
            tracing::error!(error = %e, "Invalid stats JSON");
            return Json(SuccessResponse::err(format!("Invalid stats JSON: {e}")));
        }
    };
    match hs
        .svc
        .update_stats(customer_guid, &body.character_name, &stats_json)
        .await
    {
        Ok(()) => Json(SuccessResponse::ok()),
        Err(e) => Json(SuccessResponse::err(e.to_string())),
    }
}

/// Marks a character offline. Requires `x-service-key`.
#[utoipa::path(post, path = "/api/Characters/PlayerLogout", tag = "characters",
    request_body = inline(CharNameDto),
    responses(
        (status = 200, description = "Logout result", body = SuccessResponse),
        (status = 401, description = "Missing or invalid x-service-key"),
    )
)]
pub(crate) async fn player_logout(
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

/// Returns online/offline status rows for a character.
#[utoipa::path(post, path = "/api/Status/GetCharacterStatuses", tag = "characters",
    request_body = inline(CharNameDto),
    responses((status = 200, description = "Character status rows", body = [crate::models::CharacterStatus]))
)]
pub(crate) async fn get_character_statuses(
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
