use std::sync::Arc;

use axum::Json;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use serde_json::json;

use crate::error::ApiError;
use crate::state::AppState;
use crate::telemetry::ErrorBatch;

fn header_str<'a>(headers: &'a HeaderMap, name: &str) -> &'a str {
    headers
        .get(name)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
}

/// Resolve the client IP from `X-Forwarded-For`, counting from the RIGHT so the
/// value is one the infrastructure appended — not the attacker-controlled
/// leftmost entry (which let anyone rotate IPs to bypass the rate limit).
/// `trusted_hops` is how many reverse proxies sit between us and the internet.
fn client_ip(headers: &HeaderMap, trusted_hops: usize) -> String {
    let xff = header_str(headers, "x-forwarded-for");
    if !xff.is_empty() {
        let parts: Vec<&str> = xff
            .split(',')
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .collect();
        if !parts.is_empty() {
            let idx = parts.len().saturating_sub(1 + trusted_hops);
            return parts[idx].to_string();
        }
    }
    let real = header_str(headers, "x-real-ip");
    if !real.is_empty() {
        return real.to_string();
    }
    "unknown".to_string()
}

/// Constant-time string comparison so the token check can't be probed by timing.
fn ct_eq(a: &str, b: &str) -> bool {
    let (a, b) = (a.as_bytes(), b.as_bytes());
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

pub async fn ingest_errors(
    State(app): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(batch): Json<ErrorBatch>,
) -> Result<impl IntoResponse, ApiError> {
    if let Some(expected) = &app.cfg.ingest_token {
        let provided = header_str(&headers, "x-kbve-ingest");
        if !ct_eq(provided, expected) {
            return Err(ApiError::Unauthorized);
        }
    }

    let ip = client_ip(&headers, app.cfg.trusted_proxy_hops);
    if !app.allow_ip(&ip) {
        return Err(ApiError::RateLimited);
    }
    if !app.allow_global() {
        return Err(ApiError::RateLimited);
    }
    if batch.events.is_empty() {
        return Err(ApiError::BadRequest("empty batch".into()));
    }
    if batch.events.len() > app.cfg.max_batch {
        return Err(ApiError::TooLarge(format!(
            "batch exceeds {} events",
            app.cfg.max_batch
        )));
    }

    let user_agent = header_str(&headers, "user-agent").to_string();
    let mut accepted = 0usize;
    let mut dropped = 0usize;
    for event in batch.events {
        match event.into_row(&user_agent) {
            Some(row) => {
                let project = row.get("project").and_then(|v| v.as_str()).unwrap_or("");
                if !app.allow_project(project) {
                    dropped += 1;
                    continue;
                }
                match app.tx.try_send(row) {
                    Ok(_) => accepted += 1,
                    Err(_) => dropped += 1,
                }
            }
            None => dropped += 1,
        }
    }

    Ok((
        StatusCode::ACCEPTED,
        Json(json!({ "accepted": accepted, "dropped": dropped })),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hdrs(xff: &str) -> HeaderMap {
        let mut h = HeaderMap::new();
        if !xff.is_empty() {
            h.insert("x-forwarded-for", xff.parse().unwrap());
        }
        h
    }

    #[test]
    fn client_ip_ignores_spoofed_left_entry() {
        // Attacker prepends a fake IP; with one trusted proxy we pick the
        // infra-appended right side, not the spoofed "1.1.1.1".
        let h = hdrs("1.1.1.1, 9.9.9.9, 8.8.8.8");
        assert_eq!(client_ip(&h, 1), "9.9.9.9");
        assert_eq!(client_ip(&h, 0), "8.8.8.8");
    }

    #[test]
    fn client_ip_handles_short_chain_and_missing() {
        assert_eq!(client_ip(&hdrs("7.7.7.7"), 1), "7.7.7.7");
        assert_eq!(client_ip(&hdrs(""), 1), "unknown");
    }

    #[test]
    fn ct_eq_matches_and_rejects() {
        assert!(ct_eq("secret-token", "secret-token"));
        assert!(!ct_eq("secret-token", "secret-toke"));
        assert!(!ct_eq("secret-token", "wrong"));
        assert!(!ct_eq("", "x"));
    }
}
