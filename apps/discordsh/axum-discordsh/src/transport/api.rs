use axum::Router;

use super::HttpState;

/// Transport-level API router.
///
/// Session JSON/page endpoints have been removed along with the Discord bot.
/// The router is kept as a no-op so the merge in `https.rs` compiles cleanly.
pub fn router() -> Router<HttpState> {
    Router::new()
}
