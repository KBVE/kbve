mod auth;
mod spa;
mod supabase_proxy;
mod system;
mod verticals;

use crate::state::AppState;
use axum::Router;
use axum::routing::any;
use std::sync::Arc;

pub fn router(app: Arc<AppState>) -> Router {
    let api = Router::new()
        .merge(auth::routes())
        .merge(verticals::routes());

    Router::new()
        .merge(system::routes())
        .nest("/api", api)
        .route("/supabase/{*rest}", any(supabase_proxy::handler))
        .with_state(app)
        .fallback(spa::handler)
}
