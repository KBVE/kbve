use axum::{
    response::{IntoResponse, Response},
    http::StatusCode,
    Json,
};
use serde::Serialize;
use thiserror::Error;
use tower::BoxError;

use jedi::entity::error::JediError;

pub async fn handle_error(error: BoxError) -> impl IntoResponse {
    if error.is::<tower::timeout::error::Elapsed>() {
        return JediError::Timeout.into_response();
    }
    JediError::Internal(format!("{error}")).into_response()
}
