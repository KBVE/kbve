//! Character ability + ability-bar routes (`/api/Abilities/*`). All tenant-gated by
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

/// Lists every ability a character has learned.
#[utoipa::path(post, path = "/api/Abilities/GetCharacterAbilities", tag = "abilities",
    request_body = inline(CharNameDto),
    responses((status = 200, description = "Character abilities", body = [crate::models::CharacterAbility]))
)]
pub(crate) async fn get_character_abilities(
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

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AddAbilityDto {
    character_name: String,
    ability_name: String,
    ability_level: i32,
}

/// Grants an ability to a character at a given level.
#[utoipa::path(post, path = "/api/Abilities/AddAbilityToCharacter", tag = "abilities",
    request_body = inline(AddAbilityDto),
    responses((status = 200, description = "Grant result", body = SuccessResponse))
)]
pub(crate) async fn add_ability(
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

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RemoveAbilityDto {
    character_name: String,
    ability_name: String,
}

/// Removes an ability from a character.
#[utoipa::path(post, path = "/api/Abilities/RemoveAbilityFromCharacter", tag = "abilities",
    request_body = inline(RemoveAbilityDto),
    responses((status = 200, description = "Removal result", body = SuccessResponse))
)]
pub(crate) async fn remove_ability(
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

/// Updates the level of an ability the character already has.
#[utoipa::path(post, path = "/api/Abilities/UpdateAbilityOnCharacter", tag = "abilities",
    request_body = inline(AddAbilityDto),
    responses((status = 200, description = "Update result", body = SuccessResponse))
)]
pub(crate) async fn update_ability(
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

/// Lists a character's ability bars.
#[utoipa::path(post, path = "/api/Abilities/GetAbilityBars", tag = "abilities",
    request_body = inline(CharNameDto),
    responses((status = 200, description = "Ability bars", body = [crate::models::AbilityBar]))
)]
pub(crate) async fn get_ability_bars(
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

/// Lists ability bars joined with the abilities slotted into them.
#[utoipa::path(post, path = "/api/Abilities/GetAbilityBarsAndAbilities", tag = "abilities",
    request_body = inline(CharNameDto),
    responses((status = 200, description = "Ability bars with slotted abilities", body = [crate::models::AbilityBarAbility]))
)]
pub(crate) async fn get_ability_bars_and_abilities(
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

/// Returns the global ability catalog. Currently a stub returning an empty list.
#[utoipa::path(get, path = "/api/Abilities/GetAbilities", tag = "abilities",
    responses((status = 200, description = "Ability catalog (stub: empty)", body = [crate::models::CharacterAbility]))
)]
pub(crate) async fn get_abilities_list() -> Json<Vec<crate::models::CharacterAbility>> {
    Json(Vec::new())
}
