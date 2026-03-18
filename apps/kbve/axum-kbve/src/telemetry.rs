//! Client-side error reporting endpoint.
//!
//! WASM/JS clients POST warn/error events to `/api/v1/telemetry/report`.
//! Events are logged through the server's tracing pipeline so they appear
//! in the same log stream as server-side events.
//!
//! ## Safety
//!
//! This endpoint is unauthenticated and internet-facing. Defenses:
//! - **Size cap**: 8KB max payload (reject larger)
//! - **Rate limit**: 120 events/minute globally (429 after)
//! - **Level whitelist**: only "warn" and "error" accepted
//! - **Sanitize**: control chars stripped, HTML entities neutralized,
//!   nested JSON depth limited, all fields truncated
//! - **No reflection**: response is always a static status code, never
//!   echoes input back

use axum::http::StatusCode;
use serde::Deserialize;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Instant;

/// Maximum payload size (bytes). Reject anything larger.
const MAX_BODY_BYTES: usize = 8_192;

/// Max events per minute globally.
const RATE_LIMIT: u64 = 120;

/// Max nesting depth for the `context` JSON value.
const MAX_JSON_DEPTH: usize = 4;

/// Rate limiter state — resets every 60 seconds.
static EVENT_COUNT: AtomicU64 = AtomicU64::new(0);
static WINDOW_START: std::sync::OnceLock<std::sync::Mutex<Instant>> = std::sync::OnceLock::new();

fn check_rate_limit() -> bool {
    let mutex = WINDOW_START.get_or_init(|| std::sync::Mutex::new(Instant::now()));
    let mut start = mutex.lock().unwrap();
    let now = Instant::now();

    if now.duration_since(*start).as_secs() >= 60 {
        *start = now;
        EVENT_COUNT.store(1, Ordering::Relaxed);
        true
    } else {
        let count = EVENT_COUNT.fetch_add(1, Ordering::Relaxed);
        count < RATE_LIMIT
    }
}

/// Truncate a string to at most `max` bytes (on a char boundary).
fn truncate(s: &str, max: usize) -> &str {
    if s.len() <= max {
        return s;
    }
    let mut end = max;
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    &s[..end]
}

/// Strip control characters (except \n, \t) and neutralize HTML angle brackets.
/// Prevents log injection and XSS if logs are ever rendered in a web UI.
fn sanitize(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for ch in s.chars() {
        match ch {
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            // Allow newline and tab (useful in stack traces), strip other control chars
            '\n' | '\t' => out.push(ch),
            c if c.is_control() => {} // drop
            c => out.push(c),
        }
    }
    out
}

/// Reject JSON values with nesting deeper than `max_depth`.
fn json_depth(value: &serde_json::Value, current: usize, max_depth: usize) -> bool {
    if current > max_depth {
        return false;
    }
    match value {
        serde_json::Value::Object(map) => {
            map.values().all(|v| json_depth(v, current + 1, max_depth))
        }
        serde_json::Value::Array(arr) => arr.iter().all(|v| json_depth(v, current + 1, max_depth)),
        _ => true,
    }
}

/// Validate session_id: alphanumeric + hyphens only (no injection vectors).
fn is_valid_session_id(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 64
        && s.chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

#[derive(Deserialize)]
pub struct ClientEvent {
    /// "warn" or "error" — INFO is rejected.
    pub level: String,
    /// Human-readable message (max 512 chars).
    pub message: String,
    /// Optional structured context (max 2KB serialized, depth <= 4).
    #[serde(default)]
    pub context: Option<serde_json::Value>,
    /// Optional JS/WASM stack trace (max 4KB).
    #[serde(default)]
    pub stack: Option<String>,
    /// Anonymous session id (alphanumeric, max 64 chars).
    #[serde(default)]
    pub session_id: Option<String>,
}

/// `POST /api/v1/telemetry/report`
pub async fn report_handler(
    body: axum::body::Bytes,
) -> Result<StatusCode, (StatusCode, &'static str)> {
    // Size guard
    if body.len() > MAX_BODY_BYTES {
        return Err((StatusCode::PAYLOAD_TOO_LARGE, "payload too large"));
    }

    // Rate limit
    if !check_rate_limit() {
        return Err((StatusCode::TOO_MANY_REQUESTS, "rate limited"));
    }

    // Reject non-UTF-8 payloads (binary stuffing)
    if std::str::from_utf8(&body).is_err() {
        return Err((StatusCode::BAD_REQUEST, "invalid encoding"));
    }

    // Parse
    let event: ClientEvent =
        serde_json::from_slice(&body).map_err(|_| (StatusCode::BAD_REQUEST, "invalid JSON"))?;

    // Only WARN and ERROR — reject INFO and anything else
    let level = event.level.to_lowercase();
    if level != "warn" && level != "error" {
        return Err((StatusCode::BAD_REQUEST, "level must be warn or error"));
    }

    // Reject empty messages (no point logging nothing)
    if event.message.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, "message required"));
    }

    // Validate context JSON depth (prevent deeply nested payloads that blow up serialization)
    if let Some(ref ctx) = event.context {
        if !json_depth(ctx, 0, MAX_JSON_DEPTH) {
            return Err((StatusCode::BAD_REQUEST, "context too deeply nested"));
        }
    }

    // Sanitize all string fields: truncate + strip control chars + neutralize HTML
    let message = sanitize(truncate(&event.message, 512));
    let session = match &event.session_id {
        Some(sid) if is_valid_session_id(sid) => sid.as_str(),
        _ => "anon",
    };
    let stack = event
        .stack
        .as_deref()
        .map(|s| sanitize(truncate(s, 4096)))
        .unwrap_or_default();
    let context = event
        .context
        .as_ref()
        .map(|v| {
            let s = v.to_string();
            if s.len() > 2048 {
                "{\"truncated\":true}".to_string()
            } else {
                sanitize(&s)
            }
        })
        .unwrap_or_default();

    // Log through tracing — appears in the same stream as server events
    match level.as_str() {
        "error" => {
            tracing::error!(
                target: "client_telemetry",
                session = session,
                "[client] {message} | ctx={context} stack={stack}"
            );
        }
        "warn" => {
            tracing::warn!(
                target: "client_telemetry",
                session = session,
                "[client] {message} | ctx={context} stack={stack}"
            );
        }
        _ => unreachable!(),
    }

    Ok(StatusCode::NO_CONTENT)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_strips_control_chars() {
        assert_eq!(sanitize("hello\x00world"), "helloworld");
        assert_eq!(sanitize("line\nnew"), "line\nnew"); // \n preserved
        assert_eq!(sanitize("tab\there"), "tab\there"); // \t preserved
    }

    #[test]
    fn sanitize_neutralizes_html() {
        assert_eq!(
            sanitize("<script>alert(1)</script>"),
            "&lt;script&gt;alert(1)&lt;/script&gt;"
        );
        assert_eq!(sanitize("a < b > c"), "a &lt; b &gt; c");
    }

    #[test]
    fn truncate_respects_char_boundaries() {
        let s = "hello 🌍 world";
        let t = truncate(s, 8);
        // 🌍 is 4 bytes at offset 6, so truncating at 8 lands mid-emoji
        // Should back up to byte 6
        assert_eq!(t, "hello ");
    }

    #[test]
    fn json_depth_rejects_deep_nesting() {
        let shallow: serde_json::Value = serde_json::json!({"a": {"b": 1}});
        assert!(json_depth(&shallow, 0, 4));

        // Build depth-6 nesting
        let mut deep = serde_json::json!(42);
        for _ in 0..6 {
            deep = serde_json::json!({"x": deep});
        }
        assert!(!json_depth(&deep, 0, 4));
    }

    #[test]
    fn session_id_validation() {
        assert!(is_valid_session_id("abc123"));
        assert!(is_valid_session_id("a-b_c"));
        assert!(!is_valid_session_id("")); // empty
        assert!(!is_valid_session_id("has spaces"));
        assert!(!is_valid_session_id("<script>")); // injection attempt
        assert!(!is_valid_session_id(&"x".repeat(65))); // too long
    }

    #[test]
    fn rate_limiter_allows_within_limit() {
        // Just verify the function doesn't panic
        assert!(check_rate_limit());
    }
}
