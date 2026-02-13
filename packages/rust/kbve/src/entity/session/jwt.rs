use crate::entity::response::GenericResponse;
use crate::entity::response::HeaderResponse;

use serde_json::Value;
use axum::http::{ StatusCode, HeaderMap };
use axum::response::IntoResponse;
use time::Duration;
use axum_extra::extract::cookie::SameSite;

pub async fn jwt_logout() -> impl IntoResponse {
	let empty_token_cookie = HeaderResponse::new(
		GenericResponse::default(
            Value::String("complete".to_string()),
			Value::String("User logged out".to_string())
		),
		HeaderMap::new()
	).with_cookie("token", "", Duration::seconds(-1), "/", true, SameSite::Lax);
}
