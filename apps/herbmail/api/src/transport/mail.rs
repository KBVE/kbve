use std::{sync::OnceLock, time::Duration};

use axum::{
    Json, Router,
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
    routing::post,
};
use jedi::jwt_cache::{JwtCacheError, TokenInfo, get_jwt_cache};
use mail_builder::MessageBuilder;
use mail_send::{SmtpClientBuilder, smtp::message::Message};
use serde::Deserialize;
use serde_json::{Value, json};
use tracing::{info, warn};

const MAX_SUBJECT: usize = 998;
const MAX_BODY: usize = 64 * 1024;
const MAX_RECIPIENT: usize = 254;

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

pub fn router() -> Router {
    Router::new().route("/mail/send", post(send)).layer(
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
}
