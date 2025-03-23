use axum::response::IntoResponse;
use tower::BoxError;
use jedi::entity::error::JediError;

use axum::{ http::StatusCode, Json };
use serde_json::json;

pub async fn handle_error(error: BoxError) -> impl IntoResponse {
  JediError::from(error).into_response()
}

pub async fn health() -> impl IntoResponse {
  (StatusCode::OK, Json(json!({ "status": "ok" })))
}
