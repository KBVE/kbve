use std::sync::Arc;

use axum::Json;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use serde_json::json;

use tokio::sync::mpsc;

use crate::error::ApiError;
use crate::state::AppState;
use crate::telemetry::{ErrorBatch, PerfBatch, PerfEvent, PreparedRow, ProductBatch, ProductEvent};

fn header_str<'a>(headers: &'a HeaderMap, name: &str) -> &'a str {
    headers
        .get(name)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
}

/// Resolve the client IP. Prefer Cloudflare's `cf-connecting-ip` (CF overwrites
/// it with the true client IP on every proxied request, so it isn't
/// client-spoofable). Otherwise fall back to `X-Forwarded-For` counting from the
/// RIGHT — the infra-appended end, not the attacker-controlled leftmost entry
/// (which let anyone rotate IPs to bypass the rate limit). `trusted_hops` is how
/// many reverse proxies sit between us and the internet.
fn client_ip(headers: &HeaderMap, trusted_hops: usize) -> String {
    let cf = header_str(headers, "cf-connecting-ip");
    if !cf.is_empty() {
        return cf.to_string();
    }
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

/// Everything the three ingest routes do before they know what they are
/// ingesting: authenticate, rate-limit, and bound the batch. Factored out
/// because a guard that exists on two routes out of three is a hole, and three
/// copies of it is how that happens.
fn admit(app: &AppState, headers: &HeaderMap, batch_len: usize) -> Result<String, ApiError> {
    if let Some(expected) = &app.cfg.ingest_token {
        let provided = header_str(headers, "x-kbve-ingest");
        if !ct_eq(provided, expected) {
            metrics::counter!("metrics_ingest_rejected_total", "reason" => "unauthorized")
                .increment(1);
            return Err(ApiError::Unauthorized);
        }
    }

    let ip = client_ip(headers, app.cfg.trusted_proxy_hops);
    if !app.allow_ip(&ip) {
        metrics::counter!("metrics_ingest_rejected_total", "reason" => "rate_limited_ip")
            .increment(1);
        return Err(ApiError::RateLimited);
    }
    if !app.allow_global() {
        metrics::counter!("metrics_ingest_rejected_total", "reason" => "rate_limited_global")
            .increment(1);
        return Err(ApiError::RateLimited);
    }
    if batch_len == 0 {
        return Err(ApiError::BadRequest("empty batch".into()));
    }
    if batch_len > app.cfg.max_batch {
        metrics::counter!("metrics_ingest_rejected_total", "reason" => "batch_too_large")
            .increment(1);
        return Err(ApiError::TooLarge(format!(
            "batch exceeds {} events",
            app.cfg.max_batch
        )));
    }
    Ok(header_str(headers, "user-agent").to_string())
}

/// Sanitize each event, cap it against its project's budget, and queue it.
/// `lens` labels the counters so a drop can be attributed to one pipeline
/// rather than to ingest in general.
fn enqueue<T, F>(
    app: &AppState,
    tx: &mpsc::Sender<String>,
    events: Vec<T>,
    user_agent: &str,
    lens: &'static str,
    into_row: F,
) -> (u64, u64)
where
    F: Fn(T, &str) -> Option<PreparedRow>,
{
    let mut accepted = 0u64;
    let mut dropped = 0u64;
    for event in events {
        match into_row(event, user_agent) {
            Some(prepared) => {
                if !app.allow_project(&prepared.project) {
                    dropped += 1;
                    metrics::counter!("metrics_ingest_dropped_total", "reason" => "project_capped", "lens" => lens)
                        .increment(1);
                    continue;
                }
                match tx.try_send(prepared.line) {
                    Ok(_) => accepted += 1,
                    Err(_) => {
                        dropped += 1;
                        metrics::counter!("metrics_ingest_dropped_total", "reason" => "queue_full", "lens" => lens)
                            .increment(1);
                    }
                }
            }
            None => {
                dropped += 1;
                metrics::counter!("metrics_ingest_dropped_total", "reason" => "sanitized", "lens" => lens)
                    .increment(1);
            }
        }
    }
    if accepted > 0 {
        metrics::counter!("metrics_ingest_accepted_total", "lens" => lens).increment(accepted);
    }
    (accepted, dropped)
}

fn accepted_response(accepted: u64, dropped: u64) -> impl IntoResponse {
    (
        StatusCode::ACCEPTED,
        Json(json!({ "accepted": accepted, "dropped": dropped })),
    )
}

pub async fn ingest_errors(
    State(app): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(batch): Json<ErrorBatch>,
) -> Result<impl IntoResponse, ApiError> {
    let user_agent = admit(&app, &headers, batch.events.len())?;
    let (accepted, dropped) = enqueue(
        &app,
        &app.sinks.errors,
        batch.events,
        &user_agent,
        "errors",
        |e, ua| e.into_row(ua),
    );
    Ok(accepted_response(accepted, dropped))
}

pub async fn ingest_perf(
    State(app): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(batch): Json<PerfBatch>,
) -> Result<impl IntoResponse, ApiError> {
    let user_agent = admit(&app, &headers, batch.events.len())?;
    let (accepted, dropped) = enqueue(
        &app,
        &app.sinks.perf,
        batch.events,
        &user_agent,
        "perf",
        PerfEvent::into_row,
    );
    Ok(accepted_response(accepted, dropped))
}

pub async fn ingest_events(
    State(app): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(batch): Json<ProductBatch>,
) -> Result<impl IntoResponse, ApiError> {
    let user_agent = admit(&app, &headers, batch.events.len())?;
    let (accepted, dropped) = enqueue(
        &app,
        &app.sinks.events,
        batch.events,
        &user_agent,
        "product",
        ProductEvent::into_row,
    );
    Ok(accepted_response(accepted, dropped))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::Config;
    use crate::state::Sinks;
    use jedi::state::sidecar::ClickHouseConfig;
    use std::sync::Arc;
    use tower::ServiceExt;

    /// A router whose queues are held open by the returned receivers, so a test
    /// can read back exactly what ingest enqueued.
    fn harness(
        token: Option<&str>,
    ) -> (
        axum::Router,
        mpsc::Receiver<String>,
        mpsc::Receiver<String>,
        mpsc::Receiver<String>,
    ) {
        let (errors, errors_rx) = mpsc::channel(16);
        let (perf, perf_rx) = mpsc::channel(16);
        let (events, events_rx) = mpsc::channel(16);
        let mut cfg = Config::from_env();
        cfg.ingest_token = token.map(str::to_string);
        let state = Arc::new(crate::state::AppState::new(
            cfg,
            ClickHouseConfig {
                url: "http://127.0.0.1:1".to_string(),
                user: "test".to_string(),
                password: String::new(),
                database: "telemetry".to_string(),
            },
            Sinks {
                errors,
                perf,
                events,
            },
            None,
        ));
        (
            crate::rest::router(state),
            errors_rx,
            perf_rx,
            events_rx,
        )
    }

    async fn post(app: &axum::Router, path: &str, token: Option<&str>, body: &str) -> StatusCode {
        let mut req = axum::http::Request::builder()
            .method("POST")
            .uri(path)
            .header("content-type", "application/json");
        if let Some(t) = token {
            req = req.header("x-kbve-ingest", t);
        }
        app.clone()
            .oneshot(req.body(axum::body::Body::from(body.to_string())).unwrap())
            .await
            .unwrap()
            .status()
    }

    #[tokio::test]
    async fn every_lens_enforces_the_ingest_token() {
        // The guard is shared by all three routes precisely so it cannot be
        // present on two of them and missing on the third.
        let (app, _e, _p, _v) = harness(Some("secret"));
        for (path, body) in [
            ("/api/v1/ingest/errors", r#"{"events":[{"project":"p","message":"m"}]}"#),
            ("/api/v1/ingest/perf", r#"{"events":[{"project":"p","metric":"lcp","value":1}]}"#),
            ("/api/v1/ingest/events", r#"{"events":[{"project":"p","name":"click"}]}"#),
        ] {
            assert_eq!(post(&app, path, None, body).await, StatusCode::UNAUTHORIZED, "{path}");
            assert_eq!(post(&app, path, Some("wrong"), body).await, StatusCode::UNAUTHORIZED, "{path}");
            assert_eq!(post(&app, path, Some("secret"), body).await, StatusCode::ACCEPTED, "{path}");
        }
    }

    #[tokio::test]
    async fn each_lens_queues_onto_its_own_sink() {
        // A row on the wrong queue would be inserted into the wrong table, which
        // fails the batch rather than the row.
        let (app, mut errors_rx, mut perf_rx, mut events_rx) = harness(None);
        assert_eq!(
            post(&app, "/api/v1/ingest/perf", None, r#"{"events":[{"project":"p","metric":"ttfb","value":12.5}]}"#).await,
            StatusCode::ACCEPTED
        );
        let line = perf_rx.try_recv().expect("perf row queued");
        assert!(line.contains("\"metric\":\"ttfb\""));
        assert!(errors_rx.try_recv().is_err(), "nothing on the errors queue");
        assert!(events_rx.try_recv().is_err(), "nothing on the product queue");
    }

    #[tokio::test]
    async fn an_empty_batch_is_a_bad_request_on_every_lens() {
        let (app, _e, _p, _v) = harness(None);
        for path in [
            "/api/v1/ingest/errors",
            "/api/v1/ingest/perf",
            "/api/v1/ingest/events",
        ] {
            assert_eq!(
                post(&app, path, None, r#"{"events":[]}"#).await,
                StatusCode::BAD_REQUEST,
                "{path}"
            );
        }
    }

    #[tokio::test]
    async fn a_sanitized_away_event_is_dropped_not_rejected() {
        // The batch was well-formed; the event inside it was not usable. That is
        // a 202 with dropped=1, not a 4xx -- the client cannot do anything about
        // it and retrying would not help.
        let (app, _e, mut perf_rx, _v) = harness(None);
        assert_eq!(
            post(&app, "/api/v1/ingest/perf", None, r#"{"events":[{"project":"p","metric":"nonsense","value":1}]}"#).await,
            StatusCode::ACCEPTED
        );
        assert!(perf_rx.try_recv().is_err(), "an unknown metric must not be queued");
    }

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
    fn client_ip_prefers_cf_connecting_ip() {
        let mut h = hdrs("1.1.1.1, 9.9.9.9");
        h.insert("cf-connecting-ip", "5.5.5.5".parse().unwrap());
        assert_eq!(client_ip(&h, 1), "5.5.5.5");
    }

    #[test]
    fn ct_eq_matches_and_rejects() {
        assert!(ct_eq("secret-token", "secret-token"));
        assert!(!ct_eq("secret-token", "secret-toke"));
        assert!(!ct_eq("secret-token", "wrong"));
        assert!(!ct_eq("", "x"));
    }
}
