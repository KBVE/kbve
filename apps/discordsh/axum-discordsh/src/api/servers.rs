use std::net::IpAddr;

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
};
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
    Router::new()
        .route("/api/servers/submit", post(submit_server))
        .route("/api/servers/list", get(list_servers))
        .route("/api/servers/:server_id", get(get_server))
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

// ── List / Get Endpoints ────────────────────────────────────────────

/// Query params for GET /api/servers/list
#[derive(Debug, Deserialize)]
pub struct ListServersQuery {
    #[serde(default)]
    pub category: Option<u32>,
    #[serde(default = "default_sort")]
    pub sort: String,
    #[serde(default = "default_page")]
    pub page: u32,
    #[serde(default = "default_limit")]
    pub limit: u32,
}

fn default_sort() -> String {
    "votes".into()
}
fn default_page() -> u32 {
    1
}
fn default_limit() -> u32 {
    24
}

/// Server record returned by list/get endpoints
#[derive(Debug, Serialize)]
pub struct ServerRecord {
    pub server_id: String,
    pub name: String,
    pub summary: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub banner_url: Option<String>,
    pub invite_code: String,
    pub categories: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub tags: Vec<String>,
    pub member_count: i32,
    pub vote_count: i32,
    pub is_online: bool,
}

/// GET /api/servers/list
///
/// Fetches servers from PgCluster (direct SQL, bypassing Postgrest).
/// Falls back to empty response if pool unavailable.
async fn list_servers(
    State(state): State<HttpState>,
    Query(params): Query<ListServersQuery>,
) -> impl IntoResponse {
    let Some(ref cluster) = state.app.pg_cluster else {
        tracing::warn!("[list_servers] PgCluster not initialized");
        return err(
            StatusCode::SERVICE_UNAVAILABLE,
            "Database temporarily unavailable",
        )
        .into_response();
    };

    match query_servers(cluster, &params).await {
        Ok((servers, total)) => {
            let response = serde_json::json!({
                "servers": servers,
                "total": total,
                "page": params.page,
                "limit": params.limit,
            });
            (StatusCode::OK, Json(response)).into_response()
        }
        Err(e) => {
            tracing::error!(error = %e, "[list_servers] Query failed");
            err(StatusCode::INTERNAL_SERVER_ERROR, "Failed to fetch servers").into_response()
        }
    }
}

async fn query_servers(
    cluster: &jedi::state::pg::PgCluster,
    params: &ListServersQuery,
) -> Result<(Vec<ServerRecord>, i64), jedi::entity::error::JediError> {
    let conn = cluster.read().await?;

    // Map category ID to array contains check
    let cat_filter = params.category.map(|c| c as i16);

    // Normalize sort
    let sort_col = match params.sort.to_lowercase().as_str() {
        "members" => "member_count",
        "newest" => "created_at",
        "bumped" => "bumped_at",
        _ => "vote_count",
    };

    // Build query (status=1 = active)
    let sql = format!(
        r#"
        WITH total AS (
            SELECT count(*) AS cnt
            FROM discordsh.servers
            WHERE status = 1
              AND ($1::smallint IS NULL OR $1 = ANY(categories))
        )
        SELECT
            s.server_id,
            s.name,
            s.summary,
            s.description,
            s.icon_url,
            s.banner_url,
            s.invite_code,
            s.categories,
            s.tags,
            s.member_count,
            s.vote_count,
            s.is_online,
            t.cnt AS total_count
        FROM discordsh.servers s, total t
        WHERE s.status = 1
          AND ($1::smallint IS NULL OR $1 = ANY(s.categories))
        ORDER BY s.{} DESC NULLS LAST, s.created_at DESC, s.server_id DESC
        LIMIT $2 OFFSET $3
        "#,
        sort_col
    );

    let limit = params.limit.min(50) as i64;
    let offset = ((params.page - 1) * params.limit).min(10_000) as i64;

    let rows = conn.query(&sql, &[&cat_filter, &limit, &offset]).await?;

    if rows.is_empty() {
        return Ok((vec![], 0));
    }

    let total: i64 = rows.first().map(|r| r.get("total_count")).unwrap_or(0);

    let servers = rows
        .into_iter()
        .map(|row| {
            let cats: Vec<i16> = row.get("categories");
            let category_names = cats
                .into_iter()
                .filter_map(|c| category_id_to_string(c as u32))
                .collect();

            ServerRecord {
                server_id: row.get("server_id"),
                name: row.get("name"),
                summary: row.get("summary"),
                description: row.get("description"),
                icon_url: row.get("icon_url"),
                banner_url: row.get("banner_url"),
                invite_code: row.get("invite_code"),
                categories: category_names,
                tags: row.get("tags"),
                member_count: row.get::<_, i64>("member_count") as i32,
                vote_count: row.get::<_, i64>("vote_count") as i32,
                is_online: row.get("is_online"),
            }
        })
        .collect();

    Ok((servers, total))
}

// Map category ID (1-12) to string slug (matches Astro CATEGORIES)
fn category_id_to_string(id: u32) -> Option<String> {
    match id {
        1 => Some("gaming".into()),
        2 => Some("anime".into()),
        3 => Some("music".into()),
        4 => Some("tech".into()),
        5 => Some("art".into()),
        6 => Some("education".into()),
        7 => Some("social".into()),
        8 => Some("programming".into()),
        9 => Some("memes".into()),
        10 => Some("crypto".into()),
        11 => Some("roleplay".into()),
        12 => Some("nsfw".into()),
        _ => None,
    }
}

/// GET /api/servers/:server_id
///
/// Fetches single server by ID from PgCluster.
async fn get_server(
    State(state): State<HttpState>,
    Path(server_id): Path<String>,
) -> impl IntoResponse {
    if !is_valid_snowflake(&server_id) {
        return err(StatusCode::BAD_REQUEST, "Invalid server ID").into_response();
    }

    let Some(ref cluster) = state.app.pg_cluster else {
        tracing::warn!("[get_server] PgCluster not initialized");
        return err(
            StatusCode::SERVICE_UNAVAILABLE,
            "Database temporarily unavailable",
        )
        .into_response();
    };

    match query_server_by_id(cluster, &server_id).await {
        Ok(Some(server)) => (StatusCode::OK, Json(server)).into_response(),
        Ok(None) => err(StatusCode::NOT_FOUND, "Server not found").into_response(),
        Err(e) => {
            tracing::error!(error = %e, server_id, "[get_server] Query failed");
            err(StatusCode::INTERNAL_SERVER_ERROR, "Failed to fetch server").into_response()
        }
    }
}

async fn query_server_by_id(
    cluster: &jedi::state::pg::PgCluster,
    server_id: &str,
) -> Result<Option<ServerRecord>, jedi::entity::error::JediError> {
    let conn = cluster.read().await?;

    let sql = r#"
        SELECT
            server_id,
            name,
            summary,
            description,
            icon_url,
            banner_url,
            invite_code,
            categories,
            tags,
            member_count,
            vote_count,
            is_online
        FROM discordsh.servers
        WHERE server_id = $1 AND status = 1
    "#;

    let row_opt = conn.query_opt(sql, &[&server_id]).await?;

    Ok(row_opt.map(|row| {
        let cats: Vec<i16> = row.get("categories");
        let category_names = cats
            .into_iter()
            .filter_map(|c| category_id_to_string(c as u32))
            .collect();

        ServerRecord {
            server_id: row.get("server_id"),
            name: row.get("name"),
            summary: row.get("summary"),
            description: row.get("description"),
            icon_url: row.get("icon_url"),
            banner_url: row.get("banner_url"),
            invite_code: row.get("invite_code"),
            categories: category_names,
            tags: row.get("tags"),
            member_count: row.get::<_, i64>("member_count") as i32,
            vote_count: row.get::<_, i64>("vote_count") as i32,
            is_online: row.get("is_online"),
        }
    }))
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
