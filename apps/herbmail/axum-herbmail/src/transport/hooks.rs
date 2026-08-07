use std::{sync::OnceLock, time::Duration};

use axum::{
    Json, Router,
    http::{HeaderMap, StatusCode, header},
    routing::post,
};
use serde::Deserialize;
use serde_json::{Value, json};
use tracing::{info, warn};

#[derive(Deserialize)]
pub struct HookRequest {
    pub context: Context,
    #[serde(default)]
    pub envelope: Option<Envelope>,
    #[serde(default)]
    pub message: Option<Message>,
}

#[derive(Deserialize)]
pub struct Context {
    pub stage: String,
}

#[derive(Deserialize)]
pub struct Envelope {
    pub from: Address,
    pub to: Vec<Address>,
}

#[derive(Deserialize)]
pub struct Address {
    pub address: String,
}

#[derive(Deserialize)]
pub struct Message {
    #[serde(default)]
    pub headers: Vec<(String, String)>,
    pub contents: String,
}

pub fn router() -> Router {
    Router::new()
        .route("/hooks/stalwart", post(stalwart_hook))
        .layer(
            tower::ServiceBuilder::new()
                .layer(
                    tower_http::trace::TraceLayer::new_for_http().make_span_with(
                        tower_http::trace::DefaultMakeSpan::new().level(tracing::Level::INFO),
                    ),
                )
                .layer(tower_http::limit::RequestBodyLimitLayer::new(32 * 1024 * 1024)),
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

fn accept() -> Json<Value> {
    Json(json!({ "action": "accept" }))
}

fn discard() -> Json<Value> {
    Json(json!({ "action": "discard" }))
}

fn reject(status: u16, message: &str) -> Json<Value> {
    Json(json!({
        "action": "reject",
        "response": { "status": status, "message": message }
    }))
}

fn bearer_authorized(headers: &HeaderMap) -> Option<bool> {
    let secret = std::env::var("STALWART_HOOK_SECRET").ok()?;
    if secret.is_empty() {
        return None;
    }
    let expected = format!("Bearer {secret}");
    Some(
        headers
            .get(header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .map(|v| v == expected)
            .unwrap_or(false),
    )
}

fn subject_of(message: &Message) -> Option<String> {
    message
        .headers
        .iter()
        .find(|(name, _)| name.eq_ignore_ascii_case("subject"))
        .map(|(_, value)| value.trim().to_string())
}

async fn stalwart_hook(
    headers: HeaderMap,
    Json(req): Json<HookRequest>,
) -> Result<Json<Value>, StatusCode> {
    match bearer_authorized(&headers) {
        None => {
            warn!("STALWART_HOOK_SECRET not configured — refusing hook call");
            return Err(StatusCode::SERVICE_UNAVAILABLE);
        }
        Some(false) => return Err(StatusCode::UNAUTHORIZED),
        Some(true) => {}
    }

    if req.context.stage != "data" {
        return Ok(accept());
    }

    let (Some(envelope), Some(message)) = (req.envelope, req.message) else {
        warn!("data-stage hook without envelope/message");
        return Err(StatusCode::UNPROCESSABLE_ENTITY);
    };

    let supabase_url = std::env::var("SUPABASE_URL").map_err(|_| {
        warn!("SUPABASE_URL not configured");
        StatusCode::SERVICE_UNAVAILABLE
    })?;
    let service_key = std::env::var("SUPABASE_SERVICE_ROLE_KEY").map_err(|_| {
        warn!("SUPABASE_SERVICE_ROLE_KEY not configured");
        StatusCode::SERVICE_UNAVAILABLE
    })?;

    let recipients: Vec<&str> = envelope.to.iter().map(|a| a.address.as_str()).collect();
    let payload = json!({
        "p_from": envelope.from.address,
        "p_recipients": recipients,
        "p_subject": subject_of(&message),
        "p_body": message.contents,
        "p_headers": message.headers,
    });

    let result = http_client()
        .post(format!("{supabase_url}/rest/v1/rpc/stalwart_ingest"))
        .header("apikey", &service_key)
        .bearer_auth(&service_key)
        .json(&payload)
        .send()
        .await
        .and_then(|r| r.error_for_status());

    let response = match result {
        Ok(r) => r,
        Err(e) => {
            warn!(error = %e, "stalwart_ingest rpc failed");
            return Err(StatusCode::BAD_GATEWAY);
        }
    };

    let verdict: Value = response.json().await.map_err(|e| {
        warn!(error = %e, "stalwart_ingest rpc returned invalid json");
        StatusCode::BAD_GATEWAY
    })?;

    let accepted = verdict
        .get("accepted")
        .and_then(Value::as_array)
        .map(|a| a.len())
        .unwrap_or(0);
    let rejected = verdict
        .get("rejected")
        .and_then(Value::as_array)
        .map(|a| a.len())
        .unwrap_or(0);

    info!(accepted, rejected, "stalwart hook ingested message");

    if accepted > 0 {
        Ok(discard())
    } else {
        Ok(reject(550, "no such user at herbmail.com"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    fn data_stage_body() -> String {
        serde_json::json!({
            "context": { "stage": "data" },
            "envelope": {
                "from": { "address": "someone@example.com" },
                "to": [{ "address": "h0lybyte@herbmail.com" }]
            },
            "message": {
                "headers": [["Subject", "hello"]],
                "contents": "Subject: hello\r\n\r\nhi",
                "size": 24
            }
        })
        .to_string()
    }

    fn request(auth: Option<&str>, body: String) -> axum::http::Request<Body> {
        let mut builder = axum::http::Request::builder()
            .method("POST")
            .uri("/hooks/stalwart")
            .header("content-type", "application/json");
        if let Some(auth) = auth {
            builder = builder.header("authorization", auth);
        }
        builder.body(Body::from(body)).unwrap()
    }

    #[tokio::test]
    #[serial_test::serial]
    async fn rejects_without_secret_configured() {
        std::env::remove_var("STALWART_HOOK_SECRET");
        let response = router()
            .oneshot(request(None, data_stage_body()))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    }

    #[tokio::test]
    #[serial_test::serial]
    async fn rejects_bad_bearer() {
        std::env::set_var("STALWART_HOOK_SECRET", "right-secret");
        let response = router()
            .oneshot(request(Some("Bearer wrong-secret"), data_stage_body()))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        std::env::remove_var("STALWART_HOOK_SECRET");
    }

    #[tokio::test]
    #[serial_test::serial]
    async fn accepts_non_data_stage() {
        std::env::set_var("STALWART_HOOK_SECRET", "s3cret");
        let body = serde_json::json!({ "context": { "stage": "rcpt" } }).to_string();
        let response = router()
            .oneshot(request(Some("Bearer s3cret"), body))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        let value: Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(value["action"], "accept");
        std::env::remove_var("STALWART_HOOK_SECRET");
    }
}
