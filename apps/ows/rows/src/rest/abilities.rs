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

pub(super) fn abilities_routes(hs: HandlerState) -> Router {
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CharNameDto {
    character_name: String,
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
