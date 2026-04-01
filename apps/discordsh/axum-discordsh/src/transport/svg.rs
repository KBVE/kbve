use axum::Router;

use super::HttpState;

/// Build the `/svg/` sub-router for dynamic image generation.
///
/// All game-session SVG/PNG endpoints have been removed along with the
/// Discord bot.  The router is kept as a no-op so the merge in `https.rs`
/// continues to compile without changes.
pub fn router() -> Router<HttpState> {
    Router::new()
}
