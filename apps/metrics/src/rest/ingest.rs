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

fn client_ip(headers: &HeaderMap) -> String {
    let xff = header_str(headers, "x-forwarded-for");
    if !xff.is_empty() {
        return xff.split(',').next().unwrap_or(xff).trim().to_string();
    }
    let real = header_str(headers, "x-real-ip");
    if !real.is_empty() {
        return real.to_string();
    }
    "unknown".to_string()
}

pub async fn ingest_errors(
    State(app): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(batch): Json<ErrorBatch>,
) -> Result<impl IntoResponse, ApiError> {
    let ip = client_ip(&headers);
    if !app.allow(&ip) {
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
            Some(row) => match app.tx.try_send(row) {
                Ok(_) => accepted += 1,
                Err(_) => dropped += 1,
            },
            None => dropped += 1,
        }
    }

    Ok((
        StatusCode::ACCEPTED,
        Json(json!({ "accepted": accepted, "dropped": dropped })),
    ))
}
