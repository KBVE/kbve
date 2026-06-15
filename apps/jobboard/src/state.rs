use crate::db::Pg;
use std::sync::Arc;
use std::time::Instant;

pub struct AppState {
    pub db: Pg,
    pub started_at: Instant,
    pub http: reqwest::Client,
    pub supabase_url: String,
}

impl AppState {
    pub fn new(db: Pg) -> Arc<Self> {
        let supabase_url = std::env::var("SUPABASE_URL")
            .unwrap_or_else(|_| "https://supabase.kbve.com".to_string())
            .trim_end_matches('/')
            .to_string();
        Arc::new(Self {
            db,
            started_at: Instant::now(),
            http: reqwest::Client::new(),
            supabase_url,
        })
    }
}
