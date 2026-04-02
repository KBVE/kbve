use std::sync::Arc;
use std::time::Instant;

use crate::api::rate_limit::RateLimiter;
use crate::health::HealthMonitor;

/// Central application state for the HTTP server.
pub struct AppState {
    /// Background health monitor (CPU, memory, threads).
    pub health_monitor: Arc<HealthMonitor>,

    /// Process start time (for uptime calculation).
    #[allow(dead_code)]
    pub start_time: Instant,

    /// Shared reqwest client for outbound calls.
    pub http_client: reqwest::Client,

    /// Rate limiter for server submission endpoint (5 req / 60s per IP).
    pub submit_limiter: RateLimiter,
}

impl AppState {
    pub fn new(health_monitor: Arc<HealthMonitor>) -> Self {
        let http_client = reqwest::Client::builder()
            .connect_timeout(std::time::Duration::from_secs(10))
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .expect("Failed to build HTTP client");

        Self {
            health_monitor,
            start_time: Instant::now(),
            http_client,
            submit_limiter: RateLimiter::new(5, 60),
        }
    }
}
