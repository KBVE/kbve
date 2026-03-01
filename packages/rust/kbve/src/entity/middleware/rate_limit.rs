use axum::{
    extract::{Extension, Request},
    http::{HeaderValue, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};
use dashmap::DashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

/// Per-key rate limit entry tracking request count within a time window.
#[derive(Debug, Clone)]
pub struct RateLimitEntry {
    pub count: u32,
    pub window_start: Instant,
}

/// Configuration for rate limiting behavior.
#[derive(Debug, Clone)]
pub struct RateLimitConfig {
    pub max_requests: u32,
    pub window_duration: Duration,
}

impl RateLimitConfig {
    pub fn new(max_requests: u32, window_duration: Duration) -> Self {
        Self {
            max_requests,
            window_duration,
        }
    }
}

/// Thread-safe store for tracking rate limits per key (typically per IP).
pub type RateLimitStore = Arc<DashMap<String, RateLimitEntry>>;

/// Create a new empty rate limit store.
pub fn new_rate_limit_store() -> RateLimitStore {
    Arc::new(DashMap::new())
}

/// Check and increment the rate limit for a given key.
///
/// Returns `(allowed, remaining, reset_seconds)`:
/// - `allowed`: whether the request should proceed
/// - `remaining`: how many requests are left in the current window
/// - `reset_seconds`: seconds until the current window resets
pub fn check_rate_limit(
    store: &RateLimitStore,
    key: &str,
    config: &RateLimitConfig,
) -> (bool, u32, u64) {
    let now = Instant::now();

    let mut entry = store
        .entry(key.to_string())
        .or_insert_with(|| RateLimitEntry {
            count: 0,
            window_start: now,
        });

    let elapsed = now.duration_since(entry.window_start);
    if elapsed >= config.window_duration {
        entry.count = 0;
        entry.window_start = now;
    }

    let reset_seconds = config
        .window_duration
        .saturating_sub(now.duration_since(entry.window_start))
        .as_secs();

    if entry.count >= config.max_requests {
        let remaining = 0;
        return (false, remaining, reset_seconds);
    }

    entry.count += 1;
    let remaining = config.max_requests.saturating_sub(entry.count);

    (true, remaining, reset_seconds)
}

/// Extract the client IP address from the request.
///
/// Checks `X-Forwarded-For` first, then `X-Real-IP`, and falls back to `"unknown"`.
pub fn get_client_ip(req: &Request) -> String {
    if let Some(forwarded) = req.headers().get("x-forwarded-for") {
        if let Ok(forwarded_str) = forwarded.to_str() {
            if let Some(ip) = forwarded_str.split(',').next() {
                let trimmed = ip.trim();
                if !trimmed.is_empty() {
                    return trimmed.to_string();
                }
            }
        }
    }

    if let Some(real_ip) = req.headers().get("x-real-ip") {
        if let Ok(ip_str) = real_ip.to_str() {
            let trimmed = ip_str.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
    }

    "unknown".to_string()
}

/// Axum middleware that enforces per-IP rate limiting.
///
/// Requires `RateLimitStore` and `RateLimitConfig` to be available as extensions.
///
/// # Usage
/// ```ignore
/// use kbve::{new_rate_limit_store, RateLimitConfig, rate_limit_middleware};
/// use axum::{Router, middleware};
/// use std::time::Duration;
///
/// let store = new_rate_limit_store();
/// let config = RateLimitConfig::new(100, Duration::from_secs(60));
///
/// let app = Router::new()
///     .layer(middleware::from_fn(rate_limit_middleware))
///     .layer(Extension(store))
///     .layer(Extension(config));
/// ```
pub async fn rate_limit_middleware(
    Extension(store): Extension<RateLimitStore>,
    Extension(config): Extension<RateLimitConfig>,
    req: Request,
    next: Next,
) -> Response {
    let ip = get_client_ip(&req);
    let (allowed, remaining, reset) = check_rate_limit(&store, &ip, &config);

    if !allowed {
        let mut resp = (StatusCode::TOO_MANY_REQUESTS, "Rate limit exceeded").into_response();

        let headers = resp.headers_mut();
        headers.insert("x-ratelimit-limit", HeaderValue::from(config.max_requests));
        headers.insert("x-ratelimit-remaining", HeaderValue::from(0u32));
        headers.insert("x-ratelimit-reset", HeaderValue::from(reset));
        headers.insert("retry-after", HeaderValue::from(reset));

        return resp;
    }

    let mut resp = next.run(req).await;

    let headers = resp.headers_mut();
    headers.insert("x-ratelimit-limit", HeaderValue::from(config.max_requests));
    headers.insert("x-ratelimit-remaining", HeaderValue::from(remaining));
    headers.insert("x-ratelimit-reset", HeaderValue::from(reset));

    resp
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::Request as HttpRequest;

    fn make_config(max: u32, window_secs: u64) -> RateLimitConfig {
        RateLimitConfig::new(max, Duration::from_secs(window_secs))
    }

    #[test]
    fn test_window_allows_requests_within_limit() {
        let store = new_rate_limit_store();
        let config = make_config(5, 60);

        for _ in 0..5 {
            let (allowed, _, _) = check_rate_limit(&store, "127.0.0.1", &config);
            assert!(allowed);
        }
    }

    #[test]
    fn test_window_blocks_after_limit() {
        let store = new_rate_limit_store();
        let config = make_config(3, 60);

        for _ in 0..3 {
            let (allowed, _, _) = check_rate_limit(&store, "127.0.0.1", &config);
            assert!(allowed);
        }

        let (allowed, remaining, _) = check_rate_limit(&store, "127.0.0.1", &config);
        assert!(!allowed);
        assert_eq!(remaining, 0);
    }

    #[test]
    fn test_remaining_decrements() {
        let store = new_rate_limit_store();
        let config = make_config(5, 60);

        let (_, remaining, _) = check_rate_limit(&store, "127.0.0.1", &config);
        assert_eq!(remaining, 4);

        let (_, remaining, _) = check_rate_limit(&store, "127.0.0.1", &config);
        assert_eq!(remaining, 3);

        let (_, remaining, _) = check_rate_limit(&store, "127.0.0.1", &config);
        assert_eq!(remaining, 2);
    }

    #[test]
    fn test_different_keys_independent() {
        let store = new_rate_limit_store();
        let config = make_config(2, 60);

        check_rate_limit(&store, "ip_a", &config);
        check_rate_limit(&store, "ip_a", &config);

        let (allowed, _, _) = check_rate_limit(&store, "ip_a", &config);
        assert!(!allowed);

        let (allowed, remaining, _) = check_rate_limit(&store, "ip_b", &config);
        assert!(allowed);
        assert_eq!(remaining, 1);
    }

    #[test]
    fn test_window_resets_after_duration() {
        let store = new_rate_limit_store();
        let config = make_config(1, 0); // 0-second window resets immediately

        let (allowed, _, _) = check_rate_limit(&store, "127.0.0.1", &config);
        assert!(allowed);

        // Window duration is 0, so next check should reset the window
        let (allowed, _, _) = check_rate_limit(&store, "127.0.0.1", &config);
        assert!(allowed);
    }

    #[test]
    fn test_get_client_ip_forwarded_for() {
        let req = HttpRequest::builder()
            .header("x-forwarded-for", "203.0.113.50, 70.41.3.18")
            .body(Body::empty())
            .unwrap();
        let req: Request = req.into();

        assert_eq!(get_client_ip(&req), "203.0.113.50");
    }

    #[test]
    fn test_get_client_ip_real_ip() {
        let req = HttpRequest::builder()
            .header("x-real-ip", "198.51.100.78")
            .body(Body::empty())
            .unwrap();
        let req: Request = req.into();

        assert_eq!(get_client_ip(&req), "198.51.100.78");
    }

    #[test]
    fn test_get_client_ip_prefers_forwarded_for() {
        let req = HttpRequest::builder()
            .header("x-forwarded-for", "203.0.113.50")
            .header("x-real-ip", "198.51.100.78")
            .body(Body::empty())
            .unwrap();
        let req: Request = req.into();

        assert_eq!(get_client_ip(&req), "203.0.113.50");
    }

    #[test]
    fn test_get_client_ip_fallback() {
        let req = HttpRequest::builder().body(Body::empty()).unwrap();
        let req: Request = req.into();

        assert_eq!(get_client_ip(&req), "unknown");
    }

    #[test]
    fn test_reset_seconds_within_window() {
        let store = new_rate_limit_store();
        let config = make_config(10, 60);

        let (_, _, reset) = check_rate_limit(&store, "127.0.0.1", &config);
        // Reset should be close to 60 seconds (window just started)
        assert!(reset <= 60);
        assert!(reset >= 59);
    }

    #[test]
    fn test_new_rate_limit_store_is_empty() {
        let store = new_rate_limit_store();
        assert!(store.is_empty());
    }
}
