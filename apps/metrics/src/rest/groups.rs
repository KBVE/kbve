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

async fn query(app: &AppState, sql: String, key: &str) -> Response {
    match app.ch.execute_select(&sql).await {
        Ok(rows) => {
            let mut body = serde_json::Map::new();
            body.insert(key.to_string(), json!(rows));
            (StatusCode::OK, Json(serde_json::Value::Object(body))).into_response()
        }
        Err(e) => {
            tracing::error!(error = %e, "telemetry query failed");
            (
                StatusCode::BAD_GATEWAY,
                Json(json!({ "error": "query failed" })),
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
    let where_clause = p
        .project
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
    let mut conds = vec![format!("fingerprint = {}", quote(&p.fingerprint))];
    if let Some(pr) = p.project.as_deref() {
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
