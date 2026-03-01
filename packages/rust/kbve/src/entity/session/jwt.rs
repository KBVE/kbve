use crate::entity::response::GenericResponse;
use crate::entity::response::HeaderResponse;

use axum::http::HeaderMap;
use axum::response::IntoResponse;
use axum_extra::extract::cookie::SameSite;
use serde_json::Value;
use time::Duration;

pub async fn jwt_logout() -> impl IntoResponse {
    let _empty_token_cookie = HeaderResponse::new(
        GenericResponse::default(
            Value::String("complete".to_string()),
            Value::String("User logged out".to_string()),
        ),
        HeaderMap::new(),
    )
    .with_cookie("token", "", Duration::seconds(-1), "/", true, SameSite::Lax);
}
