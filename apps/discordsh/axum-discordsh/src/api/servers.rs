use std::net::IpAddr;

use axum::{Json, Router, extract::State, http::StatusCode, response::IntoResponse, routing::post};
use serde::{Deserialize, Serialize};

use super::validate::{
    is_safe_text, is_safe_url, is_valid_invite_code, is_valid_snowflake, is_valid_tag,
};
use crate::transport::HttpState;

/// Maximum categories a server can have.
const MAX_CATEGORIES: usize = 3;
/// Maximum tags a server can have.
const MAX_TAGS: usize = 10;
/// Category IDs must be 1..=12.
const MAX_CATEGORY_ID: u32 = 12;

/// Incoming request body from the frontend form.
#[derive(Debug, Deserialize)]
pub struct SubmitServerRequest {
    pub server_id: String,
    pub name: String,
    pub summary: String,
    pub invite_code: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub icon_url: Option<String>,
    #[serde(default)]
    pub banner_url: Option<String>,
    pub categories: Vec<u32>,
    #[serde(default)]
    pub tags: Vec<String>,
    /// hCaptcha response token — forwarded to the edge function for verification.
    pub captcha_token: String,
    /// User's Supabase JWT — forwarded as Authorization bearer to the edge function.
    pub auth_token: String,
}

/// Successful response echoed back to the frontend.
#[derive(Debug, Serialize)]
#[allow(dead_code)]
struct SubmitResponse {
    status: &'static str,
    message: String,
}

/// Error response with machine-readable status and human-readable message.
#[derive(Debug, Serialize)]
struct ErrorResponse {
    status: &'static str,
    message: String,
}

fn err(status: StatusCode, msg: impl Into<String>) -> (StatusCode, Json<ErrorResponse>) {
    (
        status,
        Json(ErrorResponse {
            status: "error",
            message: msg.into(),
        }),
    )
}

pub fn router() -> Router<HttpState> {
    Router::new().route("/api/servers/submit", post(submit_server))
}

/// POST /api/servers/submit
///
/// Belt-and-suspenders: validate locally, then forward to Supabase edge function
/// which re-validates, verifies captcha, and calls the DB RPC.
async fn submit_server(
    State(state): State<HttpState>,
    axum::extract::ConnectInfo(addr): axum::extract::ConnectInfo<std::net::SocketAddr>,
    Json(req): Json<SubmitServerRequest>,
) -> impl IntoResponse {
    let ip: IpAddr = addr.ip();

    // ── Rate limit ──────────────────────────────────────────────────────
    if !state.app.submit_limiter.check(ip) {
        return err(
            StatusCode::TOO_MANY_REQUESTS,
            "Rate limited — try again later",
        )
        .into_response();
    }

    // ── Field validation ────────────────────────────────────────────────
    if !is_valid_snowflake(&req.server_id) {
        return err(StatusCode::BAD_REQUEST, "Invalid server ID").into_response();
    }

    if req.name.is_empty() || req.name.len() > 100 || !is_safe_text(&req.name) {
        return err(StatusCode::BAD_REQUEST, "Invalid server name").into_response();
    }

    if req.summary.is_empty() || req.summary.len() > 200 || !is_safe_text(&req.summary) {
        return err(StatusCode::BAD_REQUEST, "Invalid summary").into_response();
    }

    if !is_valid_invite_code(&req.invite_code) {
        return err(StatusCode::BAD_REQUEST, "Invalid invite code").into_response();
    }

    if let Some(ref desc) = req.description
        && (desc.len() > 2000 || !is_safe_text(desc))
    {
        return err(StatusCode::BAD_REQUEST, "Invalid description").into_response();
    }

    if let Some(ref url) = req.icon_url
        && !is_safe_url(url, 2048)
    {
        return err(StatusCode::BAD_REQUEST, "Invalid icon URL").into_response();
    }

    if let Some(ref url) = req.banner_url
        && !is_safe_url(url, 2048)
    {
        return err(StatusCode::BAD_REQUEST, "Invalid banner URL").into_response();
    }

    if req.categories.is_empty() || req.categories.len() > MAX_CATEGORIES {
        return err(StatusCode::BAD_REQUEST, "Must have 1-3 categories").into_response();
    }
    if req
        .categories
        .iter()
        .any(|&c| !(1..=MAX_CATEGORY_ID).contains(&c))
    {
        return err(StatusCode::BAD_REQUEST, "Invalid category ID").into_response();
    }

    if req.tags.len() > MAX_TAGS {
        return err(StatusCode::BAD_REQUEST, "Too many tags (max 10)").into_response();
    }
    if req.tags.iter().any(|t| !is_valid_tag(t)) {
        return err(StatusCode::BAD_REQUEST, "Invalid tag format").into_response();
    }

    if req.captcha_token.is_empty() {
        return err(StatusCode::BAD_REQUEST, "Missing captcha token").into_response();
    }

    if req.auth_token.is_empty() {
        return err(StatusCode::BAD_REQUEST, "Missing auth token").into_response();
    }

    // ── Forward to Supabase edge function ───────────────────────────────
    let edge_url = match std::env::var("SUPABASE_EDGE_URL") {
        Ok(u) => u,
        Err(_) => {
            tracing::error!("SUPABASE_EDGE_URL not configured");
            return err(StatusCode::INTERNAL_SERVER_ERROR, "Server misconfiguration")
                .into_response();
        }
    };

    let payload = serde_json::json!({
        "command": "server.submit",
        "data": {
            "server_id": req.server_id,
            "name": req.name,
            "summary": req.summary,
            "invite_code": req.invite_code,
            "description": req.description,
            "icon_url": req.icon_url,
            "banner_url": req.banner_url,
            "categories": req.categories,
            "tags": req.tags,
            "captcha_token": req.captcha_token,
        }
    });

    let resp = state
        .app
        .http_client
        .post(format!("{edge_url}/discordsh"))
        .header("Authorization", format!("Bearer {}", req.auth_token))
        .json(&payload)
        .send()
        .await;

    match resp {
        Ok(r) => {
            let status = r.status();
            let body: serde_json::Value = r.json().await.unwrap_or_else(
                |_| serde_json::json!({ "status": "error", "message": "Invalid edge response" }),
            );

            if status.is_success() {
                (StatusCode::OK, Json(body)).into_response()
            } else {
                let msg = body["message"].as_str().unwrap_or("Submission failed");
                err(
                    StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::BAD_GATEWAY),
                    msg,
                )
                .into_response()
            }
        }
        Err(e) => {
            tracing::error!(error = %e, "Edge function request failed");
            err(StatusCode::BAD_GATEWAY, "Upstream service unavailable").into_response()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn submit_request_deser() {
        let json = serde_json::json!({
            "server_id": "12345678901234567",
            "name": "My Server",
            "summary": "A cool server",
            "invite_code": "abc123",
            "categories": [1, 3],
            "tags": ["gaming", "rust-lang"],
            "captcha_token": "tok",
            "auth_token": "jwt"
        });

        let req: SubmitServerRequest = serde_json::from_value(json).unwrap();
        assert_eq!(req.server_id, "12345678901234567");
        assert_eq!(req.categories, vec![1, 3]);
        assert!(req.description.is_none());
        assert!(req.icon_url.is_none());
    }
}
