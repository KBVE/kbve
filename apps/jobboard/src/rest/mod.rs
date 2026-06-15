mod auth;
mod system;
mod verticals;

use crate::state::AppState;
use axum::Router;
use std::sync::Arc;

pub fn router(app: Arc<AppState>) -> Router {
    Router::new()
        .merge(system::routes())
        .merge(auth::routes())
        .merge(verticals::routes())
        .with_state(app)
}
