//! Transport-agnostic service layer — ECS-inspired architecture.
//!
//! - **Resources**: `AppState` (shared state, DashMap caches)
//! - **Components**: `CachedSession`, models (data structs)
//! - **Systems**: domain modules (auth, characters, instances, global, abilities, zones)
//!
//! REST, gRPC, and WebSocket handlers are thin adapters that call these systems.

mod abilities;
mod auth;
mod characters;
mod global;
mod instances;
mod zones;

use crate::state::AppState;
use std::sync::Arc;

/// The core service — holds Arc<AppState> and delegates to domain systems.
pub struct OWSService {
    state: Arc<AppState>,
}

/// Cached session data stored in DashMap — avoids DB hit on hot path.
#[derive(Clone)]
pub struct CachedSession {
    pub customer_guid: uuid::Uuid,
    pub user_guid: uuid::Uuid,
}

impl OWSService {
    pub fn new(state: Arc<AppState>) -> Self {
        Self { state }
    }

    /// Access the shared state (for transport adapters that need it).
    pub fn state(&self) -> &AppState {
        &self.state
    }
}
