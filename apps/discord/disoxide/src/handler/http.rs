use axum::{Router, routing::{get, post, delete}};
use std::sync::Arc;
use crate::handler::{message, store, metrics};
use crate::entity::state::GlobalState;

pub fn http_router(state: Arc<GlobalState>) -> Router {
    Router::new()
        .route("/user", get(message::get_user))
        .route("/message", get(message::get_message))
        .route("/store/{key}", get(store::get_key).post(store::set_key))
        .route("/keys", get(store::list_keys))
        .route("/admin/clear", delete(store::clear_store))
        .route("/metrics", get(metrics::metrics))
        .with_state(state)
}