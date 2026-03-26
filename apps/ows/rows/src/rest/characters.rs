use super::HandlerState;
use crate::error::{ApiResult, SuccessResponse};
use crate::middleware::{extract_customer_guid, require_customer_guid};
use crate::models::CustomDataRows;
use axum::{Json, Router, extract::State, http::HeaderMap, middleware, routing::post};
use serde::Deserialize;

pub(super) fn character_persistence_routes(hs: HandlerState) -> Router {
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
struct AddCustomDataWrapper {
    add_or_update_custom_character_data: AddCustomDataPayload,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AddCustomDataPayload {
    character_name: String,
    custom_field_name: String,
    field_value: String,
}

async fn add_or_update_custom_data(
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
struct UpdateStatsDto {
    #[serde(alias = "charName", alias = "CharName")]
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
