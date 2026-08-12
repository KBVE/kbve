use axum::{
    Json,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use utoipa::ToSchema;

use crate::bbs::claim::{Redeem, claims};
use crate::bbs::online_count;
use crate::db::get_kv_cache;

use super::https::auth_user_id;

const REDEEM_WINDOW_SECS: u64 = 60;
const REDEEM_MAX_PER_WINDOW: u64 = 10;

#[derive(Deserialize, ToSchema)]
pub(crate) struct ClaimBody {
    /// Code shown on the terminal, dashes and case optional.
    pub code: String,
}

#[derive(Serialize, ToSchema)]
pub(crate) struct ClaimResult {
    pub ok: bool,
}

#[derive(Serialize, ToSchema)]
pub(crate) struct BbsStatus {
    pub online: usize,
    pub host: String,
    pub petscii_port: u16,
    pub ansi_port: u16,
}

fn port_of(key: &str, default: u16) -> u16 {
    std::env::var(key)
        .ok()
        .and_then(|v| v.rsplit(':').next().and_then(|p| p.parse().ok()))
        .unwrap_or(default)
}

/// `POST /api/v1/bbs/claim` — bind a waiting terminal session to the caller's account.
#[utoipa::path(
    post,
    path = "/api/v1/bbs/claim",
    tag = "bbs",
    request_body = ClaimBody,
    responses(
        (status = 200, description = "Terminal session authenticated", body = ClaimResult),
        (status = 400, description = "Malformed code"),
        (status = 401, description = "Missing / invalid bearer token"),
        (status = 404, description = "Unknown, expired, or already used code"),
        (status = 429, description = "Too many redeem attempts"),
    ),
    security(("bearerAuth" = [])),
)]
pub(crate) async fn claim_code(headers: HeaderMap, Json(body): Json<ClaimBody>) -> Response {
    let user_id = match auth_user_id(&headers).await {
        Ok(id) => id,
        Err(resp) => return resp,
    };

    let code: String = body
        .code
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect();
    if code.len() < 6 || code.len() > 16 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "Malformed code"})),
        )
            .into_response();
    }

    if let Some(cache) = get_kv_cache() {
        let hits = cache
            .check_rate(&format!("bbs:claim:{user_id}"), REDEEM_WINDOW_SECS)
            .await
            .unwrap_or(0);
        if hits > REDEEM_MAX_PER_WINDOW {
            return (
                StatusCode::TOO_MANY_REQUESTS,
                Json(json!({"error": "Too many redeem attempts"})),
            )
                .into_response();
        }
    }

    match claims().redeem(&code, &user_id).await {
        Redeem::Ok => Json(ClaimResult { ok: true }).into_response(),
        Redeem::Unknown => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "Unknown or expired code"})),
        )
            .into_response(),
    }
}

/// `GET /api/v1/bbs/status` — dial-in details and current caller count.
#[utoipa::path(
    get,
    path = "/api/v1/bbs/status",
    tag = "bbs",
    responses((status = 200, description = "Board status", body = BbsStatus)),
)]
pub(crate) async fn status() -> Response {
    Json(BbsStatus {
        online: online_count(),
        host: std::env::var("BBS_PUBLIC_HOST").unwrap_or_else(|_| "bbs.kbve.com".to_string()),
        petscii_port: port_of("BBS_PETSCII_ADDR", 6400),
        ansi_port: port_of("BBS_ANSI_ADDR", 6401),
    })
    .into_response()
}
