use crate::db::Pg;
use std::sync::Arc;
use std::time::Instant;

pub struct AppState {
    pub db: Pg,
    pub started_at: Instant,
    pub http: reqwest::Client,
    pub supabase_url: String,
    pub kbve_api_url: String,
}

impl AppState {
    pub fn new(db: Pg) -> Arc<Self> {
        let supabase_url = env_url("SUPABASE_URL", "https://supabase.kbve.com");
        let kbve_api_url = env_url("KBVE_API_URL", "https://kbve.com");
        Arc::new(Self {
            db,
            started_at: Instant::now(),
            http: reqwest::Client::new(),
            supabase_url,
            kbve_api_url,
        })
    }
}

fn env_url(key: &str, default: &str) -> String {
    std::env::var(key)
        .unwrap_or_else(|_| default.to_string())
        .trim_end_matches('/')
        .to_string()
}
