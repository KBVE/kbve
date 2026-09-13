use std::sync::Arc;

use axum::Json;
use axum::extract::{Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use kbve::gate::AuthError;
use serde::Deserialize;
use serde_json::json;

use crate::state::AppState;

#[derive(Deserialize)]
pub struct GroupsParams {
    project: Option<String>,
    limit: Option<u32>,
    since_hours: Option<u32>,
}

#[derive(Deserialize)]
pub struct EventsParams {
    fingerprint: String,
    project: Option<String>,
    limit: Option<u32>,
}

fn quote(value: &str) -> String {
    format!("'{}'", value.replace('\\', "\\\\").replace('\'', "\\'"))
}

fn clamp(limit: Option<u32>, fallback: u32) -> u32 {
    limit.unwrap_or(fallback).clamp(1, 1000)
}

/// The rollup views aggregate over everything the tables hold, which is the
/// right default and useless for "is this worse than yesterday". A window means
/// aggregating from the base table instead, so these builders exist alongside
/// the view readers rather than replacing them -- with an e2e case asserting the
/// two agree when the window covers every row.
///
/// Clamped to the tables' 30-day TTL: a longer window silently reads the same
/// rows while implying it read more.
const MAX_SINCE_HOURS: u32 = 24 * 30;

fn window_predicate(since_hours: Option<u32>) -> Option<String> {
    let hours = since_hours?.clamp(1, MAX_SINCE_HOURS);
    Some(format!("timestamp >= now() - INTERVAL {hours} HOUR"))
}

/// Bound a project filter before it reaches the query (length cap; quote()
/// already neutralizes injection — this is defense in depth).
fn cap_project(project: Option<String>) -> Option<String> {
    project.map(|p| p.chars().take(256).collect())
}

/// Fingerprints are server-generated hex (see telemetry::fingerprint); reject
/// anything that isn't, so the read path can't be probed with arbitrary input.
fn valid_fingerprint(fp: &str) -> bool {
    !fp.is_empty() && fp.len() <= 64 && fp.bytes().all(|b| b.is_ascii_hexdigit())
}

fn bad_request(msg: &str) -> Response {
    (StatusCode::BAD_REQUEST, Json(json!({ "error": msg }))).into_response()
}

fn auth_status(err: &AuthError) -> StatusCode {
    match err {
        AuthError::MissingToken | AuthError::InvalidToken(_) | AuthError::TokenExpired => {
            StatusCode::UNAUTHORIZED
        }
        AuthError::NotStaff => StatusCode::FORBIDDEN,
        AuthError::Upstream(_) => StatusCode::BAD_GATEWAY,
    }
}

// The error is the response to send, which is the axum pattern: a rejection
// here has already decided its status and body. Boxing it to satisfy
// result_large_err would put an allocation on the rejection path and a deref at
// every call site, to buy back stack an async fn is not short of.
#[allow(clippy::result_large_err)]
async fn authorize(app: &AppState, headers: &HeaderMap) -> Result<(), Response> {
    match &app.auth {
        Some(auth) => auth.require_staff(headers).await.map(|_| ()).map_err(|e| {
            (auth_status(&e), Json(json!({ "error": e.to_string() }))).into_response()
        }),
        None => Err((
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "error": "auth not configured" })),
        )
            .into_response()),
    }
}

const QUERY_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(15);

async fn query(app: &AppState, sql: String, key: &str) -> Response {
    match tokio::time::timeout(QUERY_TIMEOUT, app.ch.execute_select(&sql)).await {
        Ok(Ok(rows)) => {
            let mut body = serde_json::Map::new();
            body.insert(key.to_string(), json!(rows));
            (StatusCode::OK, Json(serde_json::Value::Object(body))).into_response()
        }
        Ok(Err(e)) => {
            tracing::error!(error = %e, "telemetry query failed");
            (
                StatusCode::BAD_GATEWAY,
                Json(json!({ "error": "query failed" })),
            )
                .into_response()
        }
        Err(_) => {
            tracing::error!(
                timeout_s = QUERY_TIMEOUT.as_secs(),
                "telemetry query timed out"
            );
            (
                StatusCode::GATEWAY_TIMEOUT,
                Json(json!({ "error": "query timed out" })),
            )
                .into_response()
        }
    }
}

pub async fn groups(
    State(app): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(p): Query<GroupsParams>,
) -> Response {
    if let Err(resp) = authorize(&app, &headers).await {
        return resp;
    }
    let project = cap_project(p.project);
    let limit = clamp(p.limit, 100);
    let sql = match window_predicate(p.since_hours) {
        Some(window) => {
            let mut conds = vec![window];
            if let Some(pr) = project.as_deref() {
                conds.push(format!("project = {}", quote(pr)));
            }
            groups_window_sql(&app.cfg.errors_table, &conds.join(" AND "), limit)
        }
        None => {
            let where_clause = project
                .as_deref()
                .map(|pr| format!("WHERE project = {}", quote(pr)))
                .unwrap_or_default();
            groups_sql(&app.cfg.groups_view, &where_clause, limit)
        }
    };
    query(&app, sql, "groups").await
}

/// Ordered inside, stringified outside. ClickHouse resolves ORDER BY against the
/// SELECT alias, so ordering by `last_seen` in the same projection that aliases
/// `toString(last_seen) AS last_seen` sorts the *text* — which only happens to be
/// chronological because the format is fixed width, and stops being so the moment
/// a value renders at a different precision.
fn groups_sql(view: &str, where_clause: &str, limit: u32) -> String {
    format!(
        "SELECT project, fingerprint, error_type, sample_message, \
         toString(events) AS events, toString(sessions) AS sessions, \
         toString(first_seen) AS first_seen, toString(last_seen) AS last_seen \
         FROM (SELECT * FROM {view} {where_clause} ORDER BY last_seen DESC LIMIT {limit})"
    )
}

/// The windowed equivalents of the three rollup views. Each mirrors the view in
/// packages/data/ch/schemas/telemetry.sql; they are kept honest by an e2e case
/// that runs both paths over the same rows and compares the answers, so a change
/// to one that is not made to the other fails rather than silently serving two
/// different numbers depending on whether a window was asked for.
fn groups_window_sql(table: &str, conds: &str, limit: u32) -> String {
    format!(
        "SELECT project, fingerprint, error_type, sample_message, \
         toString(events) AS events, toString(sessions) AS sessions, \
         toString(first_seen) AS first_seen, toString(last_seen) AS last_seen \
         FROM (SELECT project, fingerprint, any(error_type) AS error_type, \
         any(message) AS sample_message, count() AS events, \
         uniq(session_id) AS sessions, min(timestamp) AS first_seen, \
         max(timestamp) AS last_seen FROM {table} WHERE {conds} \
         GROUP BY project, fingerprint ORDER BY last_seen DESC LIMIT {limit})"
    )
}

fn perf_window_sql(table: &str, conds: &str, limit: u32) -> String {
    format!(
        "SELECT project, metric, \
         toString(samples) AS samples, toString(sessions) AS sessions, \
         toString(p50) AS p50, toString(p75) AS p75, toString(p95) AS p95, \
         toString(first_seen) AS first_seen, toString(last_seen) AS last_seen \
         FROM (SELECT project, metric, count() AS samples, \
         uniq(session_id) AS sessions, quantile(0.50)(value) AS p50, \
         quantile(0.75)(value) AS p75, quantile(0.95)(value) AS p95, \
         min(timestamp) AS first_seen, max(timestamp) AS last_seen \
         FROM {table} WHERE {conds} GROUP BY project, metric \
         ORDER BY samples DESC LIMIT {limit})"
    )
}

fn product_window_sql(table: &str, conds: &str, limit: u32) -> String {
    format!(
        "SELECT project, name, \
         toString(events) AS events, toString(sessions) AS sessions, \
         toString(users) AS users, \
         toString(first_seen) AS first_seen, toString(last_seen) AS last_seen \
         FROM (SELECT project, name, count() AS events, \
         uniq(session_id) AS sessions, uniq(user_id) AS users, \
         min(timestamp) AS first_seen, max(timestamp) AS last_seen \
         FROM {table} WHERE {conds} GROUP BY project, name \
         ORDER BY events DESC LIMIT {limit})"
    )
}

/// `timestamp` is selected, not merely ordered by: without it the client is handed
/// a list of errors with no indication of when any of them happened.
fn events_sql(table: &str, conds: &str, limit: u32) -> String {
    format!(
        "SELECT toString(timestamp) AS timestamp, \
         project, platform, release, environment, error_type, message, \
         stack, url, user_id, session_id, handled, extra \
         FROM {table} WHERE {conds} ORDER BY timestamp DESC LIMIT {limit}"
    )
}

pub async fn events(
    State(app): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(p): Query<EventsParams>,
) -> Response {
    if let Err(resp) = authorize(&app, &headers).await {
        return resp;
    }
    if !valid_fingerprint(&p.fingerprint) {
        return bad_request("invalid fingerprint");
    }
    let mut conds = vec![format!("fingerprint = {}", quote(&p.fingerprint))];
    if let Some(pr) = cap_project(p.project).as_deref() {
        conds.push(format!("project = {}", quote(pr)));
    }
    let sql = events_sql(
        &app.cfg.errors_table,
        &conds.join(" AND "),
        clamp(p.limit, 50),
    );
    query(&app, sql, "events").await
}

#[derive(Deserialize)]
pub struct LensParams {
    project: Option<String>,
    limit: Option<u32>,
    since_hours: Option<u32>,
}

/// Every count and quantile is stringified in the projection for the same
/// reason the error rollup does it: a UInt64 past 2^53 loses precision on the
/// way through JSON, and a quantile rendered by the client is a quantile the
/// client can round differently than the dashboard beside it.
fn perf_sql(view: &str, where_clause: &str, limit: u32) -> String {
    format!(
        "SELECT project, metric, \
         toString(samples) AS samples, toString(sessions) AS sessions, \
         toString(p50) AS p50, toString(p75) AS p75, toString(p95) AS p95, \
         toString(first_seen) AS first_seen, toString(last_seen) AS last_seen \
         FROM (SELECT * FROM {view} {where_clause} ORDER BY samples DESC LIMIT {limit})"
    )
}

fn product_sql(view: &str, where_clause: &str, limit: u32) -> String {
    format!(
        "SELECT project, name, \
         toString(events) AS events, toString(sessions) AS sessions, \
         toString(users) AS users, \
         toString(first_seen) AS first_seen, toString(last_seen) AS last_seen \
         FROM (SELECT * FROM {view} {where_clause} ORDER BY events DESC LIMIT {limit})"
    )
}

/// Web Vitals quantiles per (project, metric).
pub async fn perf(
    State(app): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(p): Query<LensParams>,
) -> Response {
    if let Err(resp) = authorize(&app, &headers).await {
        return resp;
    }
    let project = cap_project(p.project);
    let limit = clamp(p.limit, 100);
    let sql = match window_predicate(p.since_hours) {
        Some(window) => {
            let mut conds = vec![window];
            if let Some(pr) = project.as_deref() {
                conds.push(format!("project = {}", quote(pr)));
            }
            perf_window_sql(&app.cfg.perf_table, &conds.join(" AND "), limit)
        }
        None => {
            let where_clause = project
                .as_deref()
                .map(|pr| format!("WHERE project = {}", quote(pr)))
                .unwrap_or_default();
            perf_sql(&app.cfg.perf_view, &where_clause, limit)
        }
    };
    query(&app, sql, "perf").await
}

/// Named product events per (project, name).
pub async fn product(
    State(app): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(p): Query<LensParams>,
) -> Response {
    if let Err(resp) = authorize(&app, &headers).await {
        return resp;
    }
    let project = cap_project(p.project);
    let limit = clamp(p.limit, 100);
    let sql = match window_predicate(p.since_hours) {
        Some(window) => {
            let mut conds = vec![window];
            if let Some(pr) = project.as_deref() {
                conds.push(format!("project = {}", quote(pr)));
            }
            product_window_sql(&app.cfg.events_table, &conds.join(" AND "), limit)
        }
        None => {
            let where_clause = project
                .as_deref()
                .map(|pr| format!("WHERE project = {}", quote(pr)))
                .unwrap_or_default();
            product_sql(&app.cfg.events_view, &where_clause, limit)
        }
    };
    query(&app, sql, "product").await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn groups_orders_by_the_timestamp_not_its_text() {
        let sql = groups_sql("error_groups", "WHERE project = 'friendslop'", 100);
        // The ORDER BY must sit in the inner projection, where last_seen is still a
        // DateTime. If it ever moves out beside `toString(last_seen) AS last_seen`
        // the sort silently becomes lexicographic over the rendered string.
        let inner = sql.split("FROM (").nth(1).expect("inner projection");
        assert!(inner.contains("ORDER BY last_seen DESC"));
        assert!(
            !sql.starts_with("SELECT project, fingerprint, error_type, sample_message, ORDER BY"),
            "sanity"
        );
        let outer = sql.split("FROM (").next().unwrap();
        assert!(
            !outer.contains("ORDER BY"),
            "the outer projection aliases last_seen to a String; ordering there sorts text"
        );
    }

    #[test]
    fn both_reads_honour_the_configured_names() {
        // Ingest and the readiness probe already honoured METRICS_ERRORS_TABLE while
        // the read path hardcoded its own names, so a redirected ingest left reads
        // querying a table nothing was written to — with readiness green.
        assert!(groups_sql("other_groups", "", 10).contains("FROM other_groups"));
        assert!(events_sql("other_errors", "fingerprint = 'ab'", 10).contains("FROM other_errors"));
    }

    #[test]
    fn events_returns_when_each_error_happened() {
        let sql = events_sql("errors_distributed", "fingerprint = 'ab'", 50);
        assert!(
            sql.contains("toString(timestamp) AS timestamp"),
            "a list of errors with no time on any of them is not much of a list"
        );
    }

    #[test]
    fn lens_reads_order_inside_the_projection() {
        // Same trap as the error rollup: the outer projection aliases the
        // ordering column to a String, so an ORDER BY out there sorts text.
        for sql in [
            perf_sql("perf_summary", "", 100),
            product_sql("event_counts", "", 100),
        ] {
            let outer = sql.split("FROM (").next().unwrap();
            assert!(!outer.contains("ORDER BY"), "{sql}");
            let inner = sql.split("FROM (").nth(1).expect("inner projection");
            assert!(inner.contains("ORDER BY"), "{sql}");
        }
    }

    #[test]
    fn lens_reads_honour_the_configured_view() {
        assert!(perf_sql("other_perf", "", 10).contains("FROM other_perf"));
        assert!(product_sql("other_events", "", 10).contains("FROM other_events"));
    }

    #[test]
    fn lens_reads_stringify_every_number() {
        // A UInt64 past 2^53 loses precision through JSON, and a quantile the
        // client re-renders is one it can round differently than the dashboard.
        let sql = perf_sql("perf_summary", "", 10);
        for col in ["samples", "sessions", "p50", "p75", "p95"] {
            assert!(
                sql.contains(&format!("toString({col})")),
                "{col} not stringified"
            );
        }
        let sql = product_sql("event_counts", "", 10);
        for col in ["events", "sessions", "users"] {
            assert!(
                sql.contains(&format!("toString({col})")),
                "{col} not stringified"
            );
        }
    }

    #[test]
    fn lens_project_filter_is_quoted_and_capped() {
        let evil = cap_project(Some("x' OR 1=1 --".into())).unwrap();
        let sql = perf_sql(
            "perf_summary",
            &format!("WHERE project = {}", quote(&evil)),
            10,
        );
        assert!(sql.contains(r"x\' OR 1=1 --"), "{sql}");
    }

    #[test]
    fn a_window_is_clamped_to_the_retention_period() {
        // Above the 30-day TTL the extra hours read nothing while implying they
        // read more, so the number is pinned to what the data can support.
        assert!(window_predicate(Some(9999)).unwrap().contains("INTERVAL 720 HOUR"));
        // Zero would be a window containing nothing; one hour is the floor.
        assert!(window_predicate(Some(0)).unwrap().contains("INTERVAL 1 HOUR"));
        assert!(window_predicate(Some(24)).unwrap().contains("INTERVAL 24 HOUR"));
    }

    #[test]
    fn no_window_means_no_predicate() {
        // The absence of the parameter has to stay the all-time view read, not
        // become a default window that quietly hides older rows.
        assert!(window_predicate(None).is_none());
    }

    #[test]
    fn windowed_reads_aggregate_from_the_base_table() {
        // The views aggregate over everything, so a window cannot be expressed
        // against them -- it has to go to the table the view reads.
        let sql = perf_window_sql("perf_distributed", "timestamp >= now() - INTERVAL 24 HOUR", 10);
        assert!(sql.contains("FROM perf_distributed"));
        assert!(sql.contains("GROUP BY project, metric"));
        assert!(sql.contains("INTERVAL 24 HOUR"));
    }

    #[test]
    fn windowed_reads_return_the_same_columns_as_the_views() {
        // A client cannot be handed a different row shape depending on whether it
        // asked for a window. Compares the outer projection of each pair.
        fn columns(sql: &str) -> Vec<String> {
            sql.split("FROM (")
                .next()
                .unwrap()
                .trim_start_matches("SELECT ")
                .split(',')
                .map(|c| {
                    c.split(" AS ")
                        .last()
                        .unwrap_or(c)
                        .split_whitespace()
                        .collect::<Vec<_>>()
                        .join("")
                })
                .collect()
        }
        assert_eq!(
            columns(&groups_sql("error_groups", "", 10)),
            columns(&groups_window_sql("errors_distributed", "1", 10))
        );
        assert_eq!(
            columns(&perf_sql("perf_summary", "", 10)),
            columns(&perf_window_sql("perf_distributed", "1", 10))
        );
        assert_eq!(
            columns(&product_sql("event_counts", "", 10)),
            columns(&product_window_sql("events_distributed", "1", 10))
        );
    }

    #[test]
    fn windowed_reads_still_order_inside_the_projection() {
        for sql in [
            groups_window_sql("errors_distributed", "1", 10),
            perf_window_sql("perf_distributed", "1", 10),
            product_window_sql("events_distributed", "1", 10),
        ] {
            let outer = sql.split("FROM (").next().unwrap();
            assert!(!outer.contains("ORDER BY"), "{sql}");
        }
    }

    #[test]
    fn fingerprint_validation() {
        assert!(valid_fingerprint("a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"));
        assert!(!valid_fingerprint(""));
        assert!(!valid_fingerprint("' OR 1=1 --"));
        assert!(!valid_fingerprint("xyz"));
        assert!(!valid_fingerprint(&"a".repeat(65)));
    }

    #[test]
    fn project_is_length_capped() {
        let long = "p".repeat(500);
        assert_eq!(cap_project(Some(long)).unwrap().chars().count(), 256);
        assert!(cap_project(None).is_none());
    }
}
