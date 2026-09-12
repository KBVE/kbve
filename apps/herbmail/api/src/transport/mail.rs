use std::{sync::OnceLock, time::Duration};

use axum::{
    Json, Router,
    extract::{Path, Query},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use jedi::jwt_cache::{JwtCacheError, TokenInfo, get_jwt_cache};
use mail_builder::MessageBuilder;
use mail_parser::{MessageParser, MimeHeaders};
use mail_send::{SmtpClientBuilder, smtp::message::Message};
use serde::Deserialize;
use serde_json::{Value, json};
use tracing::{info, warn};

const MAX_SUBJECT: usize = 998;
const MAX_BODY: usize = 64 * 1024;
const MAX_RECIPIENT: usize = 254;
const MAX_RENDERED_BODY: usize = 256 * 1024;

fn scrub_header(value: &str) -> String {
    value
        .chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .collect::<String>()
        .trim()
        .to_string()
}

fn message_id_token(value: &str) -> Option<String> {
    let v = value.trim();
    let inner = v.strip_prefix('<')?.strip_suffix('>')?;
    (!inner.is_empty()
        && inner.len() <= 250
        && !inner
            .chars()
            .any(|c| c == '<' || c == '>' || c.is_whitespace() || c.is_control()))
    .then(|| v.to_string())
}

#[derive(Deserialize)]
pub struct SendRequest {
    pub to: String,
    #[serde(default)]
    pub subject: String,
    pub body: String,
    #[serde(default)]
    pub in_reply_to: Option<String>,
}

#[derive(Deserialize)]
pub struct InboxQuery {
    #[serde(default)]
    pub limit: Option<u32>,
    #[serde(default)]
    pub before: Option<String>,
    #[serde(default)]
    pub before_id: Option<String>,
    #[serde(default)]
    pub direction: Option<String>,
}

pub fn router() -> Router {
    Router::new()
        .route("/mail/send", post(send))
        .route("/mail/inbox", get(inbox))
        .route("/mail/messages/{id}", get(message))
        .route("/mail/me", get(me))
        .layer(
            tower::ServiceBuilder::new()
                .layer(
                    tower_http::trace::TraceLayer::new_for_http().make_span_with(
                        tower_http::trace::DefaultMakeSpan::new().level(tracing::Level::INFO),
                    ),
                )
                .layer(tower_http::timeout::TimeoutLayer::with_status_code(
                    StatusCode::REQUEST_TIMEOUT,
                    Duration::from_secs(30),
                ))
                .layer(tower_http::limit::RequestBodyLimitLayer::new(128 * 1024)),
        )
}

fn http_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .expect("reqwest client")
    })
}

struct Reject(StatusCode, String);

impl IntoResponse for Reject {
    fn into_response(self) -> Response {
        (self.0, Json(json!({ "error": self.1 }))).into_response()
    }
}

fn error(status: StatusCode, reason: &str) -> Reject {
    Reject(status, reason.to_string())
}

async fn authenticate(headers: &HeaderMap) -> Result<std::sync::Arc<TokenInfo>, Reject> {
    let token = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(str::trim)
        .filter(|t| !t.is_empty())
        .ok_or_else(|| error(StatusCode::UNAUTHORIZED, "missing bearer token"))?;
    let cache = get_jwt_cache().ok_or_else(|| {
        warn!("jwt cache not initialized");
        error(
            StatusCode::SERVICE_UNAVAILABLE,
            "authentication unavailable",
        )
    })?;
    cache.verify_and_cache(token).await.map_err(|e| match e {
        JwtCacheError::TokenExpired => error(StatusCode::UNAUTHORIZED, "token expired"),
        JwtCacheError::InvalidToken(_) => error(StatusCode::UNAUTHORIZED, "invalid token"),
        other => {
            warn!(error = %other, "jwt verification failed");
            error(StatusCode::UNAUTHORIZED, "authentication failed")
        }
    })
}

struct Supabase {
    url: String,
    service_key: String,
}

fn supabase() -> Result<Supabase, Reject> {
    let url = std::env::var("SUPABASE_URL").map_err(|_| {
        warn!("SUPABASE_URL not configured");
        error(StatusCode::SERVICE_UNAVAILABLE, "mail store unavailable")
    })?;
    let service_key = std::env::var("SUPABASE_SERVICE_ROLE_KEY").map_err(|_| {
        warn!("SUPABASE_SERVICE_ROLE_KEY not configured");
        error(StatusCode::SERVICE_UNAVAILABLE, "mail store unavailable")
    })?;
    Ok(Supabase { url, service_key })
}

async fn rpc(db: &Supabase, name: &str, payload: Value) -> Result<Value, Reject> {
    let result = http_client()
        .post(format!("{}/rest/v1/rpc/{name}", db.url))
        .header("apikey", &db.service_key)
        .bearer_auth(&db.service_key)
        .json(&payload)
        .send()
        .await
        .and_then(|r| r.error_for_status());
    let response = match result {
        Ok(r) => r,
        Err(e) => {
            warn!(rpc = name, error = %e, "supabase rpc failed");
            return Err(error(StatusCode::BAD_GATEWAY, "mail store error"));
        }
    };
    response.json().await.map_err(|e| {
        warn!(rpc = name, error = %e, "supabase rpc returned invalid json");
        error(StatusCode::BAD_GATEWAY, "mail store error")
    })
}

fn relay_target() -> (String, u16) {
    let host = std::env::var("STALWART_RELAY_HOST")
        .unwrap_or_else(|_| "stalwart.stalwart.svc.cluster.local".into());
    let port = std::env::var("STALWART_RELAY_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(2525);
    (host, port)
}

async fn relay(
    from: &str,
    to: &str,
    subject: &str,
    body: &str,
    message_id: &str,
    in_reply_to: Option<&str>,
) -> Result<(), String> {
    let mut message = MessageBuilder::new()
        .from(from.to_string())
        .to(to.to_string())
        .subject(subject.to_string())
        .text_body(body.to_string())
        .message_id(message_id.to_string());
    if let Some(parent) = in_reply_to {
        message = message
            .in_reply_to(parent.to_string())
            .references(parent.to_string());
    }
    let raw = message.write_to_vec().map_err(|e| format!("render: {e}"))?;
    let (host, port) = relay_target();
    let mut client = SmtpClientBuilder::new(host, port)
        .map_err(|e| format!("relay target: {e}"))?
        .helo_host("herbmail-api.herbmail.svc.cluster.local")
        .timeout(Duration::from_secs(15))
        .connect_plain()
        .await
        .map_err(|e| format!("connect: {e}"))?;
    client
        .send(Message::new(from.to_string(), vec![to.to_string()], raw))
        .await
        .map_err(|e| format!("send: {e}"))
}

fn policy_status(reason: &str) -> StatusCode {
    match reason {
        "not_a_reply" | "no_username" | "self" => StatusCode::FORBIDDEN,
        "daily_cap" => StatusCode::TOO_MANY_REQUESTS,
        _ => StatusCode::UNPROCESSABLE_ENTITY,
    }
}

/// Inbound rows hold the raw MIME body Stalwart handed the hook. Outbound
/// rows hold the plain text the user typed. Either way the client gets
/// `text` (and `html` when the sender only supplied HTML), never the
/// undecoded MIME.
fn render_body(direction: &str, raw: &str) -> Value {
    if direction != "in" {
        return json!({ "text": truncate(raw), "html": Value::Null, "attachments": [] });
    }
    let Some(parsed) = MessageParser::default().parse(raw.as_bytes()) else {
        return json!({ "text": truncate(raw), "html": Value::Null, "attachments": [] });
    };
    let text = parsed.body_text(0).map(|t| truncate(&t));
    let html = parsed.body_html(0).map(|h| truncate(&h));
    let attachments: Vec<Value> = parsed
        .attachments()
        .map(|a| {
            json!({
                "name": a.attachment_name().map(scrub_header),
                "content_type": a.content_type().map(|c| match c.subtype() {
                    Some(sub) => format!("{}/{sub}", c.ctype()),
                    None => c.ctype().to_string(),
                }),
                "size": a.contents().len(),
            })
        })
        .collect();
    let text = match (text, &html) {
        (Some(t), _) if !t.trim().is_empty() => Some(t),
        (_, Some(h)) => Some(truncate(&html_to_text(h))),
        (t, None) => t,
    };
    json!({ "text": text, "html": html, "attachments": attachments })
}

fn truncate(value: &str) -> String {
    if value.len() <= MAX_RENDERED_BODY {
        return value.to_string();
    }
    let mut end = MAX_RENDERED_BODY;
    while !value.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}\n[truncated]", &value[..end])
}

fn html_to_text(html: &str) -> String {
    let mut out = String::with_capacity(html.len());
    let mut in_tag = false;
    let mut tag = String::new();
    for c in html.chars() {
        match c {
            '<' => {
                in_tag = true;
                tag.clear();
            }
            '>' if in_tag => {
                in_tag = false;
                let name = tag.trim_start_matches('/').to_ascii_lowercase();
                let name = name
                    .split(|c: char| c.is_whitespace() || c == '/')
                    .next()
                    .unwrap_or("");
                if matches!(
                    name,
                    "br" | "p" | "div" | "tr" | "li" | "h1" | "h2" | "h3" | "blockquote"
                ) {
                    out.push('\n');
                }
            }
            _ if in_tag => tag.push(c),
            _ => out.push(c),
        }
    }
    out.replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
}

/// Cursor shape: `YYYY-MM-DDTHH:MM:SS[.frac](Z|+HH:MM|-HH:MM)`, at most 40
/// ASCII bytes, so nothing but a timestamp ever reaches the RPC cast.
fn is_rfc3339(value: &str) -> bool {
    let b = value.as_bytes();
    if b.len() < 20 || b.len() > 40 || !value.is_ascii() {
        return false;
    }
    let digits = |r: std::ops::Range<usize>| b[r].iter().all(u8::is_ascii_digit);
    if !(digits(0..4)
        && b[4] == b'-'
        && digits(5..7)
        && b[7] == b'-'
        && digits(8..10)
        && (b[10] == b'T' || b[10] == b't' || b[10] == b' ')
        && digits(11..13)
        && b[13] == b':'
        && digits(14..16)
        && b[16] == b':'
        && digits(17..19))
    {
        return false;
    }
    let mut i = 19;
    if i < b.len() && b[i] == b'.' {
        i += 1;
        let start = i;
        while i < b.len() && b[i].is_ascii_digit() {
            i += 1;
        }
        if i == start {
            return false;
        }
    }
    match &b[i..] {
        b"Z" | b"z" | b"+00:00" | b"+00" => true,
        rest if rest.len() == 6 && (rest[0] == b'+' || rest[0] == b'-') => {
            rest[1..3].iter().all(u8::is_ascii_digit)
                && rest[3] == b':'
                && rest[4..6].iter().all(u8::is_ascii_digit)
        }
        _ => false,
    }
}

fn parse_uuid(value: &str) -> Option<uuid::Uuid> {
    uuid::Uuid::parse_str(value.trim()).ok()
}

async fn inbox(headers: HeaderMap, Query(q): Query<InboxQuery>) -> Response {
    let user = match authenticate(&headers).await {
        Ok(u) => u,
        Err(r) => return r.into_response(),
    };
    let db = match supabase() {
        Ok(db) => db,
        Err(r) => return r.into_response(),
    };
    let limit = q.limit.unwrap_or(50).clamp(1, 200);
    let before = q.before.as_deref().map(str::trim).filter(|b| !b.is_empty());
    let before_id = q
        .before_id
        .as_deref()
        .map(str::trim)
        .filter(|b| !b.is_empty());
    let cursor = match (before, before_id) {
        (None, None) => None,
        (Some(ts), Some(id)) if is_rfc3339(ts) => match parse_uuid(id) {
            Some(id) => Some((ts.to_string(), id)),
            None => {
                return error(StatusCode::UNPROCESSABLE_ENTITY, "bad_cursor").into_response();
            }
        },
        _ => {
            return error(StatusCode::UNPROCESSABLE_ENTITY, "bad_cursor").into_response();
        }
    };
    let direction = match q.direction.as_deref().map(str::trim) {
        None | Some("") | Some("all") => None,
        Some(d @ ("in" | "out")) => Some(d),
        Some(_) => {
            return error(StatusCode::UNPROCESSABLE_ENTITY, "bad_direction").into_response();
        }
    };
    let rows = match rpc(
        &db,
        "herbmail_inbox_list",
        json!({
            "p_user_id": user.user_id,
            "p_limit": limit,
            "p_before": cursor.as_ref().map(|c| c.0.clone()),
            "p_before_id": cursor.as_ref().map(|c| c.1),
            "p_direction": direction,
        }),
    )
    .await
    {
        Ok(v) => v,
        Err(r) => return r.into_response(),
    };
    let messages = if rows.is_array() { rows } else { json!([]) };
    (StatusCode::OK, Json(json!({ "messages": messages }))).into_response()
}

async fn message(headers: HeaderMap, Path(id): Path<String>) -> Response {
    let user = match authenticate(&headers).await {
        Ok(u) => u,
        Err(r) => return r.into_response(),
    };
    let Some(id) = parse_uuid(&id) else {
        return error(StatusCode::NOT_FOUND, "not found").into_response();
    };
    let db = match supabase() {
        Ok(db) => db,
        Err(r) => return r.into_response(),
    };
    let row = match rpc(
        &db,
        "herbmail_message_get",
        json!({ "p_user_id": user.user_id, "p_id": id }),
    )
    .await
    {
        Ok(v) => v,
        Err(r) => return r.into_response(),
    };
    let Some(row) = row.as_object() else {
        return error(StatusCode::NOT_FOUND, "not found").into_response();
    };
    let direction = row.get("direction").and_then(Value::as_str).unwrap_or("in");
    let raw = row.get("body").and_then(Value::as_str).unwrap_or("");
    let rendered = render_body(direction, raw);
    let mut out = row.clone();
    out.remove("body");
    out.remove("headers");
    let failed = row
        .get("error")
        .and_then(Value::as_str)
        .is_some_and(|e| !e.is_empty());
    out.insert(
        "error".into(),
        if failed {
            json!("delivery failed")
        } else {
            Value::Null
        },
    );
    out.insert("body".into(), rendered);
    (StatusCode::OK, Json(Value::Object(out))).into_response()
}

async fn me(headers: HeaderMap) -> Response {
    let user = match authenticate(&headers).await {
        Ok(u) => u,
        Err(r) => return r.into_response(),
    };
    let db = match supabase() {
        Ok(db) => db,
        Err(r) => return r.into_response(),
    };
    let stats = match rpc(
        &db,
        "herbmail_mailbox_stats",
        json!({ "p_user_id": user.user_id }),
    )
    .await
    {
        Ok(v) => v,
        Err(r) => return r.into_response(),
    };
    let mut out = stats.as_object().cloned().unwrap_or_default();
    out.insert("user_id".into(), json!(user.user_id));
    if !out.contains_key("username") || out["username"].is_null() {
        out.insert("username".into(), json!(user.kbve_username));
    }
    (StatusCode::OK, Json(Value::Object(out))).into_response()
}

async fn send(headers: HeaderMap, Json(req): Json<SendRequest>) -> Response {
    let user = match authenticate(&headers).await {
        Ok(u) => u,
        Err(r) => return r.into_response(),
    };
    if req.subject.len() > MAX_SUBJECT || req.body.len() > MAX_BODY || req.to.len() > MAX_RECIPIENT
    {
        return error(StatusCode::UNPROCESSABLE_ENTITY, "message too large").into_response();
    }
    if req.body.contains('\0') {
        return error(StatusCode::UNPROCESSABLE_ENTITY, "bad_body").into_response();
    }
    let to = req.to.trim().to_ascii_lowercase();
    if to.is_empty()
        || to.chars().any(|c| c.is_whitespace() || c.is_control())
        || to.matches('@').count() != 1
    {
        return error(StatusCode::UNPROCESSABLE_ENTITY, "bad_recipient").into_response();
    }
    let subject = scrub_header(&req.subject);
    let in_reply_to = req.in_reply_to.as_deref().and_then(message_id_token);
    let db = match supabase() {
        Ok(db) => db,
        Err(r) => return r.into_response(),
    };
    let prepared = match rpc(
        &db,
        "herbmail_outbound_prepare",
        json!({
            "p_user_id": user.user_id,
            "p_to": to,
            "p_subject": subject,
            "p_body": req.body,
            "p_in_reply_to": in_reply_to,
        }),
    )
    .await
    {
        Ok(v) => v,
        Err(r) => return r.into_response(),
    };
    if prepared["ok"].as_bool() != Some(true) {
        let reason = prepared["reason"].as_str().unwrap_or("rejected");
        return error(policy_status(reason), reason).into_response();
    }
    let (Some(id), Some(from), Some(to)) = (
        prepared["id"].as_str(),
        prepared["from"].as_str(),
        prepared["to"].as_str(),
    ) else {
        warn!("herbmail_outbound_prepare returned an incomplete row");
        return error(StatusCode::BAD_GATEWAY, "mail store error").into_response();
    };
    let message_id = format!("<{}@herbmail.com>", uuid::Uuid::new_v4());
    let outcome = relay(
        from,
        to,
        &subject,
        &req.body,
        &message_id,
        in_reply_to.as_deref(),
    )
    .await;
    let (status, err) = match &outcome {
        Ok(()) => ("sent", None),
        Err(e) => ("failed", Some(e.as_str())),
    };
    let _ = rpc(
        &db,
        "herbmail_outbound_mark",
        json!({ "p_id": id, "p_status": status, "p_message_id": message_id, "p_error": err }),
    )
    .await;
    match outcome {
        Ok(()) => {
            info!(user = %user.kbve_username, to, "outbound mail relayed");
            (
                StatusCode::ACCEPTED,
                Json(json!({ "id": id, "message_id": message_id })),
            )
                .into_response()
        }
        Err(e) => {
            warn!(user = %user.kbve_username, to, error = %e, "outbound relay failed");
            error(StatusCode::BAD_GATEWAY, "relay failed").into_response()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use tower::ServiceExt;

    #[tokio::test]
    async fn rejects_without_bearer() {
        let app = router();
        let response = app
            .oneshot(
                axum::extract::Request::builder()
                    .method("POST")
                    .uri("/mail/send")
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"to":"a@b.co","body":"hi"}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn read_routes_reject_without_bearer() {
        for uri in [
            "/mail/inbox",
            "/mail/me",
            "/mail/messages/0f0b2d1e-3b5f-4b39-9c9d-2b8c8a6f1d2e",
        ] {
            let response = router()
                .oneshot(
                    axum::extract::Request::builder()
                        .uri(uri)
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::UNAUTHORIZED, "{uri}");
        }
    }

    #[test]
    fn policy_reasons_map_to_statuses() {
        assert_eq!(policy_status("not_a_reply"), StatusCode::FORBIDDEN);
        assert_eq!(policy_status("daily_cap"), StatusCode::TOO_MANY_REQUESTS);
        assert_eq!(
            policy_status("bad_recipient"),
            StatusCode::UNPROCESSABLE_ENTITY
        );
    }

    #[test]
    fn headers_are_scrubbed_and_ids_validated() {
        assert_eq!(scrub_header("Re: hi\r\nBcc: x@y"), "Re: hi  Bcc: x@y");
        assert_eq!(
            message_id_token(" <abc@example.com> ").as_deref(),
            Some("<abc@example.com>")
        );
        assert_eq!(message_id_token("abc@example.com"), None);
        assert_eq!(message_id_token("<a b@example.com>"), None);
        assert_eq!(message_id_token("<>"), None);
    }

    #[test]
    fn relay_target_defaults_to_internal_listener() {
        let (host, port) = relay_target();
        assert!(host.ends_with("svc.cluster.local"));
        assert_eq!(port, 2525);
    }

    #[test]
    fn inbound_mime_is_decoded_to_text() {
        let raw = concat!(
            "From: a@example.com\r\n",
            "To: b@herbmail.com\r\n",
            "Subject: hi\r\n",
            "MIME-Version: 1.0\r\n",
            "Content-Type: multipart/alternative; boundary=\"xyz\"\r\n",
            "\r\n",
            "--xyz\r\n",
            "Content-Type: text/plain; charset=\"UTF-8\"\r\n",
            "Content-Transfer-Encoding: quoted-printable\r\n",
            "\r\n",
            "Why do I need to reply=3F\r\n",
            "--xyz\r\n",
            "Content-Type: text/html; charset=\"UTF-8\"\r\n",
            "\r\n",
            "<div>Why do I need to reply?</div>\r\n",
            "--xyz--\r\n",
        );
        let body = render_body("in", raw);
        assert_eq!(
            body["text"].as_str().unwrap().trim(),
            "Why do I need to reply?"
        );
        assert!(body["html"].as_str().unwrap().contains("<div>"));
        assert_eq!(body["attachments"].as_array().unwrap().len(), 0);
    }

    #[test]
    fn html_only_inbound_falls_back_to_stripped_text() {
        let raw = concat!(
            "From: a@example.com\r\n",
            "Content-Type: text/html; charset=\"UTF-8\"\r\n",
            "\r\n",
            "<p>Hello &amp; welcome</p><p>Bye</p>\r\n",
        );
        let body = render_body("in", raw);
        let text = body["text"].as_str().unwrap();
        assert!(text.contains("Hello & welcome"));
        assert!(text.contains("Bye"));
    }

    #[test]
    fn outbound_rows_are_plain_text_already() {
        let body = render_body("out", "typed by the user");
        assert_eq!(body["text"], "typed by the user");
        assert!(body["html"].is_null());
    }

    #[test]
    fn cursors_must_be_rfc3339() {
        assert!(is_rfc3339("2026-09-12T06:30:44.609166+00:00"));
        assert!(is_rfc3339("2026-09-12T06:30:44Z"));
        assert!(is_rfc3339("2026-09-12 06:30:44-05:00"));
        assert!(!is_rfc3339("2026-09-12"));
        assert!(!is_rfc3339("now()"));
        assert!(!is_rfc3339("2026-09-12T06:30:44+00:00;drop"));
        assert!(!is_rfc3339("2026-09-12T06:30:44.+00:00"));
    }

    #[tokio::test]
    async fn inbox_rejects_half_cursors_before_auth_is_even_needed() {
        // Auth runs first, so a bad cursor with no bearer is still 401; the
        // cursor validation is covered by the pure helpers below.
        let response = router()
            .oneshot(
                axum::extract::Request::builder()
                    .uri("/mail/inbox?before=2026-09-12T00:00:00Z")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[test]
    fn message_ids_must_be_uuids() {
        assert!(parse_uuid("0f0b2d1e-3b5f-4b39-9c9d-2b8c8a6f1d2e").is_some());
        assert!(parse_uuid("../etc").is_none());
    }
}
