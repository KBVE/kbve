use std::collections::HashMap;
use std::net::IpAddr;
use std::sync::Mutex;
use std::time::Instant;

/// Simple sliding-window rate limiter keyed by IP address.
///
/// Each IP gets a fixed number of requests per window. Once exhausted,
/// subsequent requests are rejected until the window resets.
pub struct RateLimiter {
    /// Map from IP -> (window start, request count).
    buckets: Mutex<HashMap<IpAddr, (Instant, u32)>>,
    /// Maximum requests allowed per window.
    max_requests: u32,
    /// Window duration in seconds.
    window_secs: u64,
}

impl RateLimiter {
    pub fn new(max_requests: u32, window_secs: u64) -> Self {
        Self {
            buckets: Mutex::new(HashMap::new()),
            max_requests,
            window_secs,
        }
    }

    /// Returns `true` if the request is allowed, `false` if rate-limited.
    pub fn check(&self, ip: IpAddr) -> bool {
        let now = Instant::now();
        let mut buckets = self.buckets.lock().unwrap();

        let entry = buckets.entry(ip).or_insert((now, 0));

        // Reset window if expired
        if now.duration_since(entry.0).as_secs() >= self.window_secs {
            entry.0 = now;
            entry.1 = 1;
            return true;
        }

        if entry.1 >= self.max_requests {
            return false;
        }

        entry.1 += 1;
        true
    }

    /// Prune entries older than 2x the window to prevent unbounded growth.
    /// Call periodically from a background task.
    #[allow(dead_code)]
    pub fn prune(&self) {
        let now = Instant::now();
        let cutoff = self.window_secs * 2;
        let mut buckets = self.buckets.lock().unwrap();
        buckets.retain(|_, (start, _)| now.duration_since(*start).as_secs() < cutoff);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::Ipv4Addr;

    #[test]
    fn allows_up_to_limit() {
        let limiter = RateLimiter::new(3, 60);
        let ip = IpAddr::V4(Ipv4Addr::new(127, 0, 0, 1));

        assert!(limiter.check(ip));
        assert!(limiter.check(ip));
        assert!(limiter.check(ip));
        assert!(!limiter.check(ip)); // 4th request rejected
    }

    #[test]
    fn different_ips_independent() {
        let limiter = RateLimiter::new(1, 60);
        let ip1 = IpAddr::V4(Ipv4Addr::new(10, 0, 0, 1));
        let ip2 = IpAddr::V4(Ipv4Addr::new(10, 0, 0, 2));

        assert!(limiter.check(ip1));
        assert!(!limiter.check(ip1));
        assert!(limiter.check(ip2)); // separate bucket
    }

    #[test]
    fn prune_removes_old_entries() {
        let limiter = RateLimiter::new(10, 0); // 0-second window -> always expired
        let ip = IpAddr::V4(Ipv4Addr::new(1, 2, 3, 4));

        limiter.check(ip);
        assert_eq!(limiter.buckets.lock().unwrap().len(), 1);

        limiter.prune();
        assert_eq!(limiter.buckets.lock().unwrap().len(), 0);
    }
}
