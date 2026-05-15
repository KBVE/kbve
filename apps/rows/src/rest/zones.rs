use super::HandlerState;
use crate::error::SuccessResponse;
use crate::middleware::{extract_customer_guid, require_customer_guid};
use axum::{Json, Router, extract::State, http::HeaderMap, middleware, routing::post};
use serde::Deserialize;

pub(super) fn zones_routes(hs: HandlerState) -> Router {
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
