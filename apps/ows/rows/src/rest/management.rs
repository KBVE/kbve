use super::HandlerState;
use crate::error::{ApiResult, SuccessResponse};
use crate::middleware::{extract_customer_guid, require_customer_guid};
use axum::{Json, Router, extract::State, http::HeaderMap, middleware, routing::get};
use serde::Deserialize;
use uuid::Uuid;

pub(super) fn management_routes(hs: HandlerState) -> Router {
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
