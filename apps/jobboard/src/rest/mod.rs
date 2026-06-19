mod applications;
mod auth;
mod profiles;
mod proxy;
mod seo;
mod spa;
mod system;
mod verticals;

use crate::state::AppState;
use axum::Router;
use axum::routing::any;
use std::sync::Arc;

pub fn router(app: Arc<AppState>) -> Router {
    let api = Router::new()
        .merge(system::api_routes())
        .merge(auth::routes())
        .merge(verticals::routes())
        .merge(applications::routes())
        .merge(profiles::routes());

    Router::new()
        .merge(system::routes())
        .merge(seo::routes())
        .nest("/api", api)
        .route("/supabase/{*rest}", any(proxy::supabase))
        .route("/kbveapi/{*rest}", any(proxy::kbve_api))
        .with_state(app)
        .fallback(spa::handler)
}
