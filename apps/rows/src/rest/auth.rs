//! Player-facing auth + session routes (`/api/Users/*`, `/api/Characters/*`). All routes are
//! tenant-gated by `require_customer_guid`; the `X-CustomerGUID` header is injected by the
//! same-origin staff proxy. Legacy local email/password endpoints are deprecated in favor of
//! Supabase external login.

use super::HandlerState;
use crate::error::{ApiResult, RowsError, SuccessResponse};
use crate::middleware::{extract_customer_guid, require_customer_guid};
use crate::models::CustomDataRows;
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

pub(super) fn public_api_routes(hs: HandlerState) -> Router {
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
        .layer(middleware::from_fn_with_state(
            hs.clone(),
            require_customer_guid,
        ))
        .with_state(hs)
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LoginDto {
    email: String,
    password: String,
}

/// DEPRECATED: `LoginAndCreateSession` is the legacy OWS local email/password login. Clients should
/// authenticate against Supabase and call `ExternalLoginAndCreateSession`; this endpoint stays only
/// for backwards compatibility and will be removed.
#[utoipa::path(post, path = "/api/Users/LoginAndCreateSession", tag = "auth",
    request_body = inline(LoginDto),
    responses((status = 200, description = "Session created (deprecated local login)", body = crate::models::LoginResult))
)]
pub(crate) async fn login(
    State(hs): State<HandlerState>,
    Json(body): Json<LoginDto>,
) -> ApiResult<crate::models::LoginResult> {
    let result = hs.svc.login(&body.email, &body.password).await?;
    Ok(Json(result))
}

/// Accepts both the new `{ "accessToken": "<jwt>" }` shape and the legacy
/// `{ "provider": "...", "providerToken": "<jwt>" }` payload for backward compat.
#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ExternalLoginDto {
    #[serde(default)]
    access_token: Option<String>,
    #[serde(default)]
    provider: Option<String>,
    #[serde(default)]
    provider_token: Option<String>,
}

/// Exchanges a Supabase JWT for a ROWS session. Accepts the new `accessToken` shape and the legacy
/// `provider`/`providerToken` payload.
#[utoipa::path(post, path = "/api/Users/ExternalLoginAndCreateSession", tag = "auth",
    request_body = inline(ExternalLoginDto),
    responses((status = 200, description = "Login result (authenticated flag + session GUID)", body = crate::models::LoginResult))
)]
pub(crate) async fn external_login(
    State(hs): State<HandlerState>,
    Json(body): Json<ExternalLoginDto>,
) -> Json<crate::models::LoginResult> {
    let token = body
        .access_token
        .or(body.provider_token)
        .unwrap_or_default();

    if token.is_empty() {
        return Json(crate::models::LoginResult {
            authenticated: false,
            user_session_guid: None,
            error_message: "Missing accessToken or providerToken".into(),
        });
    }

    if !hs.app.supabase.jwt_enabled() {
        return Json(crate::models::LoginResult {
            authenticated: false,
            user_session_guid: None,
            error_message: "External auth not configured (SUPABASE_JWT_SECRET not set)".into(),
        });
    }

    match hs.svc.external_login(&token).await {
        Ok(result) => Json(result),
        Err(e) => Json(crate::models::LoginResult {
            authenticated: false,
            user_session_guid: None,
            error_message: e.to_string(),
        }),
    }
}

/// Looks up a live session by `userSessionGUID` (query parameter).
#[utoipa::path(get, path = "/api/Users/GetUserSession", tag = "auth",
    params(("userSessionGUID" = String, Query, description = "Session GUID to resolve")),
    responses(
        (status = 200, description = "Session found", body = crate::models::UserSession),
        (status = 400, description = "Missing or malformed userSessionGUID"),
    )
)]
pub(crate) async fn get_user_session(
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

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GetAllCharsDto {
    #[serde(rename = "userSessionGUID", alias = "userSessionGUId")]
    user_session_guid: Uuid,
}

/// Lists every character owned by the session's user.
#[utoipa::path(post, path = "/api/Users/GetAllCharacters", tag = "characters",
    request_body = inline(GetAllCharsDto),
    responses((status = 200, description = "Characters for the session", body = [crate::models::Character]))
)]
pub(crate) async fn get_all_characters(
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

/// Resolves (and lazily spins up) the game server a character should connect to for a zone.
#[utoipa::path(post, path = "/api/Users/GetServerToConnectTo", tag = "instances",
    request_body = inline(GetServerDto),
    responses((status = 200, description = "Connection target", body = crate::models::JoinMapResult))
)]
pub(crate) async fn get_server_to_connect_to(
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
pub(crate) struct GetByNameDto {
    #[serde(rename = "userSessionGUID", alias = "userSessionGUId")]
    _user_session_guid: String,
    character_name: String,
}

/// Fetches a single character by name within the tenant.
#[utoipa::path(post, path = "/api/Characters/ByName", tag = "characters",
    request_body = inline(GetByNameDto),
    responses((status = 200, description = "Character", body = crate::models::Character))
)]
pub(crate) async fn get_char_by_name_public(
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

/// Liveness ping for legacy OWS clients; always returns `true`.
#[utoipa::path(get, path = "/api/System/Status", tag = "health",
    responses((status = 200, description = "Always true", body = bool))
)]
pub(crate) async fn system_status() -> Json<bool> {
    Json(true)
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RegisterUserDto {
    email: String,
    password: String,
    first_name: String,
    last_name: String,
}

/// DEPRECATED: `RegisterUser` creates a legacy OWS local account with a password hash. Accounts now
/// originate in Supabase and are provisioned on first `ExternalLoginAndCreateSession`; kept for
/// backwards compatibility only, slated for removal.
#[utoipa::path(post, path = "/api/Users/RegisterUser", tag = "auth",
    request_body = inline(RegisterUserDto),
    responses((status = 200, description = "Registration result (deprecated local account)", body = SuccessResponse))
)]
pub(crate) async fn register_user(
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

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LogoutDto {
    #[serde(rename = "userSessionGUID", alias = "userSessionGUId")]
    user_session_guid: Uuid,
}

/// Invalidates a session GUID.
#[utoipa::path(post, path = "/api/Users/Logout", tag = "auth",
    request_body = inline(LogoutDto),
    responses((status = 200, description = "Logout result", body = SuccessResponse))
)]
pub(crate) async fn logout(
    State(hs): State<HandlerState>,
    Json(body): Json<LogoutDto>,
) -> Json<SuccessResponse> {
    match hs.svc.logout(body.user_session_guid).await {
        Ok(()) => Json(SuccessResponse::ok()),
        Err(e) => Json(SuccessResponse::err(e.to_string())),
    }
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CreateCharDto {
    #[serde(rename = "userSessionGUID", alias = "userSessionGUId")]
    user_session_guid: Uuid,
    character_name: String,
    class_name: String,
}

/// Creates a character under the session's user with an explicit class.
#[utoipa::path(post, path = "/api/Users/CreateCharacter", tag = "characters",
    request_body = inline(CreateCharDto),
    responses((status = 200, description = "Creation result", body = SuccessResponse))
)]
pub(crate) async fn create_character(
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

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RemoveCharDto {
    #[serde(rename = "userSessionGUID", alias = "userSessionGUId")]
    _user_session_guid: Uuid,
    character_name: String,
}

/// Deletes a character by name within the tenant.
#[utoipa::path(post, path = "/api/Users/RemoveCharacter", tag = "characters",
    request_body = inline(RemoveCharDto),
    responses((status = 200, description = "Removal result", body = SuccessResponse))
)]
pub(crate) async fn remove_character(
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

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CreateCharDefaultsDto {
    #[serde(rename = "userSessionGUID", alias = "userSessionGUId")]
    user_session_guid: Uuid,
    character_name: String,
    default_set_name: String,
}

/// Creates a character seeded from a named default value set.
#[utoipa::path(post, path = "/api/Users/CreateCharacterUsingDefaultCharacterValues", tag = "characters",
    request_body = inline(CreateCharDefaultsDto),
    responses((status = 200, description = "Creation result", body = SuccessResponse))
)]
pub(crate) async fn create_char_defaults(
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

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SetSelectedCharDto {
    #[serde(rename = "userSessionGUID", alias = "userSessionGUId")]
    user_session_guid: Uuid,
    #[serde(alias = "selectedCharacterName")]
    character_name: String,
}

/// Sets the active character on a session and returns the merged session+character view.
#[utoipa::path(post, path = "/api/Users/SetSelectedCharacterAndGetUserSession", tag = "characters",
    request_body = inline(SetSelectedCharDto),
    responses((status = 200, description = "Session with selected character", body = crate::models::UserSessionWithCharacter))
)]
pub(crate) async fn set_selected_char(
    State(hs): State<HandlerState>,
    Json(body): Json<SetSelectedCharDto>,
) -> ApiResult<crate::models::UserSessionWithCharacter> {
    let session = hs
        .svc
        .set_selected_character_and_get_session(body.user_session_guid, &body.character_name)
        .await?;
    Ok(Json(session))
}

/// Sets the active character on a session; returns a bare success flag.
#[utoipa::path(post, path = "/api/Users/UserSessionSetSelectedCharacter", tag = "characters",
    request_body = inline(SetSelectedCharDto),
    responses((status = 200, description = "Selection result", body = SuccessResponse))
)]
pub(crate) async fn user_session_set_selected_char(
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

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DefaultCustomDataDto {
    default_set_name: String,
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GetPlayerGroupsDto {
    #[serde(rename = "userSessionGUID", alias = "userSessionGUId")]
    _user_session_guid: Uuid,
    character_name: String,
    #[serde(alias = "playerGroupTypeID", alias = "PlayerGroupTypeID")]
    player_group_type_id: i32,
}

/// Lists the player groups a character belongs to for a given group type. Returns the legacy OWS
/// `{ success, rows }` envelope.
#[utoipa::path(post, path = "/api/Users/GetPlayerGroupsCharacterIsIn", tag = "characters",
    request_body = inline(GetPlayerGroupsDto),
    responses((status = 200, description = "OWS `{ success, rows }` envelope of group memberships"))
)]
pub(crate) async fn get_player_groups(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
    Json(body): Json<GetPlayerGroupsDto>,
) -> Json<serde_json::Value> {
    let customer_guid = extract_customer_guid(&headers);
    match hs
        .svc
        .get_player_groups_character_is_in(
            customer_guid,
            &body.character_name,
            body.player_group_type_id,
        )
        .await
    {
        Ok(groups) => Json(serde_json::json!({
            "success": "true",
            "rows": groups,
        })),
        Err(e) => Json(serde_json::json!({
            "success": "false",
            "errmsg": e.to_string(),
        })),
    }
}

/// Returns the default custom-data rows for a named default set.
#[utoipa::path(post, path = "/api/Characters/GetDefaultCustomData", tag = "characters",
    request_body = inline(DefaultCustomDataDto),
    responses((status = 200, description = "Default custom-data rows", body = crate::models::CustomDataRows))
)]
pub(crate) async fn get_default_custom_data(
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
