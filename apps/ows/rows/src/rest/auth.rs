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
    #[serde(default, rename = "userSessionGUID", alias = "userSessionGUId")]
    _user_session_guid: Option<Uuid>,
    character_name: String,
    zone_name: String,
    #[serde(default)]
    _player_group_type: Option<i32>,
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
