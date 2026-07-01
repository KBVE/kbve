pub mod groups;
pub mod ingest;
pub mod system;

use std::sync::Arc;

use axum::Router;
use axum::routing::{get, post};

use crate::state::AppState;

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/", get(system::index))
        .route("/health", get(system::health))
        .route("/readiness", get(system::readiness))
        .route("/api/v1/ingest/errors", post(ingest::ingest_errors))
        .route("/api/v1/groups", get(groups::groups))
        .route("/api/v1/events", get(groups::events))
        .with_state(state)
}
