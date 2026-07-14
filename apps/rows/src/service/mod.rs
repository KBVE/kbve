mod abilities;
mod auth;
mod characters;
mod global;
mod instances;
mod zones;

use crate::state::AppState;
use std::sync::Arc;

pub struct OWSService {
    state: Arc<AppState>,
}

/// `created_at` drives TTL-based eviction (24h default) of the in-process session cache.
#[derive(Clone)]
pub struct CachedSession {
    pub customer_guid: uuid::Uuid,
    pub user_guid: uuid::Uuid,
    pub created_at: std::time::Instant,
}

/// Who a confirmed request is acting as. `Player` carries the Supabase `user_guid` and is subject to
/// per-character ownership checks; `Service` is a trusted server-to-server caller (validated service
/// key) that bypasses player-scoped checks.
#[derive(Clone, Copy, Debug)]
pub enum AuthIdentity {
    Player(uuid::Uuid),
    Service,
}

impl OWSService {
    pub fn new(state: Arc<AppState>) -> Self {
        Self { state }
    }

    pub fn state(&self) -> &AppState {
        &self.state
    }
}
