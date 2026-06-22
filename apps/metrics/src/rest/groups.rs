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
    let where_clause = cap_project(p.project)
        .as_deref()
        .map(|pr| format!("WHERE project = {}", quote(pr)))
        .unwrap_or_default();
    let sql = format!(
        "SELECT project, fingerprint, error_type, sample_message, \
         toString(events) AS events, toString(sessions) AS sessions, \
         toString(first_seen) AS first_seen, toString(last_seen) AS last_seen \
         FROM error_groups {} ORDER BY last_seen DESC LIMIT {}",
        where_clause,
        clamp(p.limit, 100)
    );
    query(&app, sql, "groups").await
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
    let sql = format!(
        "SELECT project, platform, release, environment, error_type, message, \
         stack, url, user_id, session_id, handled, extra \
         FROM errors_distributed WHERE {} ORDER BY timestamp DESC LIMIT {}",
        conds.join(" AND "),
        clamp(p.limit, 50)
    );
    query(&app, sql, "events").await
}

#[cfg(test)]
mod tests {
    use super::*;

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
