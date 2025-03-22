use axum::response::IntoResponse;
use tower::BoxError;
use jedi::entity::error::JediError;

pub async fn handle_error(error: BoxError) -> impl IntoResponse {
  JediError::from(error).into_response()
}
