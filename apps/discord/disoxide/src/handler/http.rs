use axum::{Router, routing::{get, post, delete}};
use std::sync::Arc;
use crate::handler::{message, store, metrics, error::health};
use crate::entity::state::{AppGlobalState, SharedState};
use crate::handler::redis as redis_handler;
use crate::handler::astro as Astro;


pub fn http_router() -> Router<SharedState> {
    Router::new()
        .route("/user", get(message::get_user))
        .route("/message", get(message::get_message))
        .route("/store/{key}", get(store::get_key).post(store::set_key))
        .route("/keys", get(store::list_keys))
        .route("/admin/clear", delete(store::clear_store))
        .route("/metrics", get(metrics::metrics))
        .route("/health", get(health))
        .merge(Astro::astro_router())
        .merge(redis_handler::redis_router())
}