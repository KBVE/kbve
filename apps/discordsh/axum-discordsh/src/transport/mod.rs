pub mod https;
pub mod svg;

use std::sync::Arc;

use crate::state::AppState;

/// Shared state available to all Axum HTTP handlers.
#[derive(Clone)]
pub(crate) struct HttpState {
    pub app: Arc<AppState>,
}
