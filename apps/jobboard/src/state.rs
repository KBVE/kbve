use crate::db::Pg;
use std::sync::Arc;
use std::time::Instant;

pub struct AppState {
    pub db: Pg,
    pub started_at: Instant,
}

impl AppState {
    pub fn new(db: Pg) -> Arc<Self> {
        Arc::new(Self {
            db,
            started_at: Instant::now(),
        })
    }
}
