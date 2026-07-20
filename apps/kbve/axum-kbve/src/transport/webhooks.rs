use axum::{
    Json,
    body::Bytes,
    extract::Path,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use hmac::{Hmac, KeyInit, Mac};
use jedi::entity::error::JediError;
use jedi::state::pg::{PgCallerReadFut, PgCluster, tokio_postgres::Transaction};
use serde_json::{Value, json};
use sha2::Sha256;
use std::sync::Arc;
use uuid::Uuid;

use crate::db::get_pg_cluster;

type HmacSha256 = Hmac<Sha256>;

const ALLOWED_EVENTS: &[&str] = &[
    "issues",
    "issue_comment",
    "pull_request",
    "pull_request_review",
    "pull_request_review_comment",
    "ping",
];
const WEBHOOK_SERVICE: &str = "github_webhook";
const REPOS_SERVICE: &str = "github_repos";
const MAX_BODY_BYTES: usize = 1_048_576;

pub async fn github_webhook(
    Path(guild_id): Path<String>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    if body.len() > MAX_BODY_BYTES {
        return (StatusCode::PAYLOAD_TOO_LARGE, "payload too large").into_response();
    }
    if !is_snowflake(&guild_id) {
        return json_status(
            StatusCode::BAD_REQUEST,
            json!({ "error": "invalid guild_id" }),
        );
    }

    let event = header_str(&headers, "x-github-event")
        .unwrap_or("")
        .to_string();
    let delivery = header_str(&headers, "x-github-delivery").map(str::to_owned);
    let signature = header_str(&headers, "x-hub-signature-256").map(str::to_owned);

    if !ALLOWED_EVENTS.contains(&event.as_str()) {
        return json_status(
            StatusCode::OK,
            json!({ "ok": true, "skipped": event, "guild": guild_id }),
        );
    }

    let cluster = match get_pg_cluster() {
        Some(c) => Arc::clone(c),
        None => return service_unavailable(),
    };

    let secret = match fetch_token(&cluster, &guild_id, WEBHOOK_SERVICE).await {
        Ok(Some(s)) => s,
        Ok(None) => {
            return json_status(
                StatusCode::NOT_FOUND,
                json!({ "error": "webhook not configured for guild" }),
            );
        }
        Err(e) => {
            tracing::error!(guild = %guild_id, error = %e, "gh-webhook: vault lookup failed");
            return json_status(
                StatusCode::INTERNAL_SERVER_ERROR,
                json!({ "error": "failed to resolve webhook secret" }),
            );
        }
    };

    if !verify_signature(&secret, signature.as_deref(), &body) {
        tracing::warn!(
            guild = %guild_id,
            event = %event,
            delivery = ?delivery,
            "gh-webhook: signature verification failed"
        );
        return json_status(
            StatusCode::UNAUTHORIZED,
            json!({ "error": "invalid signature" }),
        );
    }

    if event == "ping" {
        return json_status(
            StatusCode::OK,
            json!({ "ok": true, "pong": true, "guild": guild_id }),
        );
    }

    let payload: Value = match serde_json::from_slice(&body) {
        Ok(v) => v,
        Err(_) => return json_status(StatusCode::BAD_REQUEST, json!({ "error": "invalid JSON" })),
    };

    let Some((owner, repo)) = repo_from_payload(&payload) else {
        return json_status(
            StatusCode::OK,
            json!({ "ok": true, "skipped": "no repo in payload", "guild": guild_id }),
        );
    };

    let full_name = format!("{}/{}", owner, repo).to_lowercase();
    let Some(allowlist) = fetch_allowlist(&cluster, &guild_id).await else {
        return json_status(
            StatusCode::OK,
            json!({ "ok": true, "skipped": "allowlist lookup failed", "guild": guild_id }),
        );
    };
    if !allowlist.is_empty() && !allowlist.contains(&full_name) {
        return json_status(
            StatusCode::OK,
            json!({ "ok": true, "skipped": format!("repo not allowlisted: {full_name}"), "guild": guild_id }),
        );
    }

    let Some(issue) = issue_from_payload(&payload) else {
        return json_status(
            StatusCode::OK,
            json!({ "ok": true, "skipped": "no issue in payload", "guild": guild_id }),
        );
    };

    let Some(number) = issue
        .get("number")
        .and_then(Value::as_i64)
        .and_then(|n| i32::try_from(n).ok())
    else {
        return json_status(
            StatusCode::OK,
            json!({ "ok": true, "skipped": "issue missing number", "guild": guild_id }),
        );
    };
    let upsert = UpsertIssue {
        owner: owner.clone(),
        repo: repo.clone(),
        number,
        title: str_field(issue, "title").unwrap_or_default(),
        state: str_field(issue, "state").unwrap_or_default(),
        body: str_field(issue, "body"),
        labels: issue
            .get("labels")
            .cloned()
            .unwrap_or_else(|| json!([]))
            .to_string(),
        assignees: issue
            .get("assignees")
            .cloned()
            .unwrap_or_else(|| json!([]))
            .to_string(),
        author: issue.get("user").and_then(|u| str_field(u, "login")),
        html_url: str_field(issue, "html_url").unwrap_or_default(),
        is_pull_request: payload.get("pull_request").is_some()
            || issue.get("pull_request").is_some(),
        node_id: str_field(issue, "node_id"),
        created_at: str_field(issue, "created_at").unwrap_or_default(),
        updated_at: str_field(issue, "updated_at").unwrap_or_default(),
        closed_at: str_field(issue, "closed_at"),
    };

    let actor = payload
        .get("sender")
        .and_then(|s| str_field(s, "login"))
        .or_else(|| {
            payload
                .get("comment")
                .and_then(|c| c.get("user"))
                .and_then(|u| str_field(u, "login"))
        });
    let event_type = map_event_type(&event, payload.get("action").and_then(Value::as_str));
    let record = RecordEvent {
        owner: owner.clone(),
        repo: repo.clone(),
        number,
        event_type,
        actor,
        payload: String::from_utf8_lossy(&body).into_owned(),
        delivery: delivery.clone(),
    };

    if let Err(e) = persist(&cluster, upsert, record).await {
        tracing::error!(guild = %guild_id, error = %e, "gh-webhook: persist failed");
        return json_status(
            StatusCode::INTERNAL_SERVER_ERROR,
            json!({ "error": "upsert failed" }),
        );
    }

    json_status(
        StatusCode::OK,
        json!({
            "ok": true,
            "event": event,
            "delivery": delivery,
            "issue": format!("{full_name}#{number}"),
            "guild": guild_id,
        }),
    )
}

struct UpsertIssue {
    owner: String,
    repo: String,
    number: i32,
    title: String,
    state: String,
    body: Option<String>,
    labels: String,
    assignees: String,
    author: Option<String>,
    html_url: String,
    is_pull_request: bool,
    node_id: Option<String>,
    created_at: String,
    updated_at: String,
    closed_at: Option<String>,
}

struct RecordEvent {
    owner: String,
    repo: String,
    number: i32,
    event_type: String,
    actor: Option<String>,
    payload: String,
    delivery: Option<String>,
}

async fn fetch_token(
    cluster: &PgCluster,
    guild: &str,
    service: &str,
) -> Result<Option<String>, JediError> {
    let guild = guild.to_owned();
    let service = service.to_owned();
    cluster
        .with_caller_read(
            Uuid::nil(),
            Some("service_role"),
            move |tx| -> PgCallerReadFut<'_, Option<String>> {
                Box::pin(token_query(tx, guild, service))
            },
        )
        .await
}

async fn token_query(
    tx: &Transaction<'_>,
    guild: String,
    service: String,
) -> Result<Option<String>, JediError> {
    let row = tx
        .query_opt(
            "SELECT discordsh.bot_get_guild_token($1::text, $2::text)",
            &[&guild, &service],
        )
        .await
        .map_err(JediError::from)?;
    Ok(row.and_then(|r| r.get::<_, Option<String>>(0)))
}

/// Returns `Some(set)` on a successful lookup — an empty set means no
/// allowlist is configured (allow all). Returns `None` when the lookup or
/// parse fails, so the caller can fail closed instead of allowing all repos.
async fn fetch_allowlist(
    cluster: &PgCluster,
    guild: &str,
) -> Option<std::collections::HashSet<String>> {
    let raw = match fetch_token(cluster, guild, REPOS_SERVICE).await {
        Ok(Some(s)) => s,
        Ok(None) => return Some(std::collections::HashSet::new()),
        Err(e) => {
            tracing::error!(guild = %guild, error = %e, "gh-webhook: allowlist lookup failed");
            return None;
        }
    };
    let parsed: Value = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(e) => {
            tracing::error!(guild = %guild, error = %e, "gh-webhook: allowlist parse failed");
            return None;
        }
    };
    Some(
        parsed
            .get("repos")
            .and_then(Value::as_array)
            .map(|arr| {
                arr.iter()
                    .filter_map(Value::as_str)
                    .map(|s| s.trim().to_lowercase())
                    .collect()
            })
            .unwrap_or_default(),
    )
}

async fn persist(
    cluster: &PgCluster,
    upsert: UpsertIssue,
    record: RecordEvent,
) -> Result<(), JediError> {
    cluster
        .with_caller_write(
            Uuid::nil(),
            Some("service_role"),
            move |tx| -> PgCallerReadFut<'_, ()> { Box::pin(persist_query(tx, upsert, record)) },
        )
        .await
}

async fn persist_query(
    tx: &Transaction<'_>,
    u: UpsertIssue,
    r: RecordEvent,
) -> Result<(), JediError> {
    tx.execute(
        "SELECT gh.upsert_issue($1, $2, $3::int, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, \
         $11::boolean, $12, $13::timestamptz, $14::timestamptz, $15::timestamptz)",
        &[
            &u.owner,
            &u.repo,
            &u.number,
            &u.title,
            &u.state,
            &u.body,
            &u.labels,
            &u.assignees,
            &u.author,
            &u.html_url,
            &u.is_pull_request,
            &u.node_id,
            &u.created_at,
            &u.updated_at,
            &u.closed_at,
        ],
    )
    .await
    .map_err(JediError::from)?;

    if let Err(e) = tx
        .execute(
            "SELECT gh.record_event($1, $2, $3::int, $4, $5, $6::jsonb, $7)",
            &[
                &r.owner,
                &r.repo,
                &r.number,
                &r.event_type,
                &r.actor,
                &r.payload,
                &r.delivery,
            ],
        )
        .await
    {
        tracing::warn!(error = %e, "gh-webhook: record_event failed");
    }
    Ok(())
}

fn verify_signature(secret: &str, signature: Option<&str>, body: &[u8]) -> bool {
    let Some(sig) = signature else { return false };
    let Some(hex) = sig.strip_prefix("sha256=") else {
        return false;
    };
    let mut mac =
        HmacSha256::new_from_slice(secret.as_bytes()).expect("HMAC accepts any key length");
    mac.update(body);
    let actual: String = mac
        .finalize()
        .into_bytes()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();
    constant_time_eq(hex.to_lowercase().as_bytes(), actual.as_bytes())
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

fn is_snowflake(s: &str) -> bool {
    (17..=20).contains(&s.len()) && s.bytes().all(|b| b.is_ascii_digit())
}

fn header_str<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    headers.get(name).and_then(|h| h.to_str().ok())
}

fn str_field(v: &Value, key: &str) -> Option<String> {
    v.get(key).and_then(Value::as_str).map(str::to_owned)
}

fn repo_from_payload(p: &Value) -> Option<(String, String)> {
    let r = p.get("repository")?;
    let owner = r.get("owner").and_then(|o| str_field(o, "login"))?;
    let repo = str_field(r, "name").or_else(|| {
        str_field(r, "full_name").and_then(|full| full.split('/').nth(1).map(str::to_owned))
    })?;
    if owner.is_empty() || repo.is_empty() {
        return None;
    }
    Some((owner, repo))
}

fn issue_from_payload(p: &Value) -> Option<&Value> {
    p.get("issue").or_else(|| p.get("pull_request"))
}

fn map_event_type(github_event: &str, action: Option<&str>) -> String {
    match github_event {
        "issue_comment" => match action {
            Some("created") => "commented".to_string(),
            other => format!("comment_{}", other.unwrap_or("unknown")),
        },
        "pull_request_review" => match action {
            Some("submitted") => "reviewed".to_string(),
            other => format!("review_{}", other.unwrap_or("unknown")),
        },
        "pull_request_review_comment" => match action {
            Some("created") => "commented".to_string(),
            other => format!("review_comment_{}", other.unwrap_or("unknown")),
        },
        _ => action.unwrap_or(github_event).to_string(),
    }
}

fn json_status(status: StatusCode, body: Value) -> Response {
    (status, Json(body)).into_response()
}

fn service_unavailable() -> Response {
    json_status(
        StatusCode::SERVICE_UNAVAILABLE,
        json!({ "error": "database unavailable" }),
    )
}
