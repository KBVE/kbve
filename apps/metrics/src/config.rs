use std::env;

#[derive(Debug, Clone)]
pub struct Config {
    pub host: String,
    pub port: u16,
    pub errors_table: String,
    pub allowed_origins: Vec<String>,
    pub max_body_bytes: usize,
    pub max_batch: usize,
    pub channel_capacity: usize,
    pub flush_rows: usize,
    pub flush_interval_ms: u64,
    pub rate_limit_per_min: u32,
    pub project_rate_limit_per_min: u32,
    pub global_rate_limit_per_min: u32,
    pub trusted_proxy_hops: usize,
    pub ingest_token: Option<String>,
}

fn get(key: &str, default: &str) -> String {
    env::var(key).unwrap_or_else(|_| default.to_string())
}

impl Config {
    pub fn from_env() -> Self {
        let allowed_origins = get("METRICS_ALLOWED_ORIGINS", "")
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();

        Self {
            host: get("HTTP_HOST", "0.0.0.0"),
            port: get("HTTP_PORT", "5500").parse().unwrap_or(5500),
            errors_table: get("METRICS_ERRORS_TABLE", "errors_distributed"),
            allowed_origins,
            max_body_bytes: get("METRICS_MAX_BODY_BYTES", "262144")
                .parse()
                .unwrap_or(262144),
            max_batch: get("METRICS_MAX_BATCH", "50").parse().unwrap_or(50),
            channel_capacity: get("METRICS_CHANNEL_CAPACITY", "8192")
                .parse()
                .unwrap_or(8192),
            flush_rows: get("METRICS_FLUSH_ROWS", "200").parse().unwrap_or(200),
            flush_interval_ms: get("METRICS_FLUSH_INTERVAL_MS", "2000")
                .parse()
                .unwrap_or(2000),
            rate_limit_per_min: get("METRICS_RATE_LIMIT_PER_MIN", "120")
                .parse()
                .unwrap_or(120),
            project_rate_limit_per_min: get("METRICS_PROJECT_RATE_LIMIT_PER_MIN", "6000")
                .parse()
                .unwrap_or(6000),
            global_rate_limit_per_min: get("METRICS_GLOBAL_RATE_LIMIT_PER_MIN", "60000")
                .parse()
                .unwrap_or(60000),
            trusted_proxy_hops: get("METRICS_TRUSTED_PROXY_HOPS", "1").parse().unwrap_or(1),
            ingest_token: env::var("METRICS_INGEST_TOKEN")
                .ok()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty()),
        }
    }
}
