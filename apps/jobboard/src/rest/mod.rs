mod auth;
mod spa;
mod system;
mod verticals;

use crate::state::AppState;
use axum::Router;
use std::sync::Arc;

pub fn router(app: Arc<AppState>) -> Router {
    let api = Router::new()
        .merge(auth::routes())
        .merge(verticals::routes());

    Router::new()
        .merge(system::routes())
        .nest("/api", api)
        .with_state(app)
        .fallback(spa::handler)
}
