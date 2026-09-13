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
        .route("/dashboard", get(system::dashboard))
        .route("/health", get(system::health))
        .route("/readiness", get(system::readiness))
        .route("/api/v1/ingest/errors", post(ingest::ingest_errors))
        .route("/api/v1/ingest/perf", post(ingest::ingest_perf))
        // Deliberately not /api/v1/events: that path is the READ side, listing
        // the error events behind a fingerprint. Product events write here and
        // are read at /api/v1/product.
        .route("/api/v1/ingest/events", post(ingest::ingest_events))
        .route("/api/v1/groups", get(groups::groups))
        .route("/api/v1/events", get(groups::events))
        .route("/api/v1/perf", get(groups::perf))
        .route("/api/v1/product", get(groups::product))
        .with_state(state)
}
