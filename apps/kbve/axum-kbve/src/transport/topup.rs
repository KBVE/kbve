//! Stripe credit on-ramp. This is the ONLY code path that touches Stripe; the
//! store itself only spends credits. Implemented with reqwest + a manual
//! HMAC-SHA256 webhook-signature check to avoid a heavy SDK dependency.
//!
//! Both routes degrade to 503 when the relevant env is unset, so builds and
//! e2e stay green without live Stripe keys:
//!   STRIPE_SECRET_KEY       — checkout session creation
//!   STRIPE_WEBHOOK_SECRET   — webhook signature verification
//!   STORE_TOPUP_SUCCESS_URL / STORE_TOPUP_CANCEL_URL — redirect targets

use axum::{
    Json,
    body::Bytes,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use hmac::{Hmac, KeyInit, Mac};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::Sha256;
use utoipa::ToSchema;

use super::wallet::{resolve_user, service_unavailable};
use crate::db::get_wallet_client;

type HmacSha256 = Hmac<Sha256>;

/// Server-defined credit packs. Keyed by `pack_id`; amounts in USD cents.
const PACKS: &[(&str, i64, i64)] = &[
    // (pack_id, credits, unit_amount_cents)
    ("small", 100, 100),
    ("medium", 550, 500),
    ("large", 1200, 1000),
];

fn pack(pack_id: &str) -> Option<(i64, i64)> {
    PACKS
        .iter()
        .find(|(id, _, _)| *id == pack_id)
        .map(|(_, credits, cents)| (*credits, *cents))
}

#[derive(Deserialize, ToSchema)]
pub(crate) struct CheckoutBody {
    /// One of the server-defined pack ids (small | medium | large).
    pub pack_id: String,
}

#[derive(Serialize, ToSchema)]
pub(crate) struct CheckoutDto {
    pub checkout_url: String,
}

/// `POST /api/v1/wallet/topup/checkout` — create a Stripe Checkout Session.
#[utoipa::path(
    post,
    path = "/api/v1/wallet/topup/checkout",
    tag = "store",
    request_body = CheckoutBody,
    responses(
        (status = 200, description = "Stripe checkout url", body = CheckoutDto),
        (status = 400, description = "Unknown pack"),
        (status = 401, description = "Missing / invalid bearer token"),
        (status = 503, description = "Stripe on-ramp not configured"),
    ),
    security(("bearerAuth" = [])),
)]
pub(crate) async fn checkout(headers: HeaderMap, Json(body): Json<CheckoutBody>) -> Response {
    let user_id = match resolve_user(&headers).await {
        Ok(id) => id,
        Err(resp) => return resp,
    };
    let secret = match std::env::var("STRIPE_SECRET_KEY") {
        Ok(s) if !s.is_empty() => s,
        _ => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({"error": "stripe not configured"})),
            )
                .into_response();
        }
    };
    let (credits, cents) = match pack(&body.pack_id) {
        Some(p) => p,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "unknown pack"})),
            )
                .into_response();
        }
    };
    let success_url = std::env::var("STORE_TOPUP_SUCCESS_URL")
        .unwrap_or_else(|_| "https://kbve.com/store/?topup=success".to_string());
    let cancel_url = std::env::var("STORE_TOPUP_CANCEL_URL")
        .unwrap_or_else(|_| "https://kbve.com/store/?topup=cancel".to_string());
    let credits_str = credits.to_string();
    let cents_str = cents.to_string();
    let user_str = user_id.to_string();
    let name = format!("{credits} KBVE credits");

    let form: Vec<(&str, String)> = vec![
        ("mode", "payment".to_string()),
        ("success_url", success_url),
        ("cancel_url", cancel_url),
        ("line_items[0][quantity]", "1".to_string()),
        ("line_items[0][price_data][currency]", "usd".to_string()),
        ("line_items[0][price_data][unit_amount]", cents_str),
        ("line_items[0][price_data][product_data][name]", name),
        ("metadata[user_id]", user_str),
        ("metadata[pack_id]", body.pack_id.clone()),
        ("metadata[credits]", credits_str),
    ];

    let client = reqwest::Client::new();
    let resp = client
        .post("https://api.stripe.com/v1/checkout/sessions")
        .basic_auth(secret, Option::<String>::None)
        .form(&form)
        .send()
        .await;
    match resp {
        Ok(r) if r.status().is_success() => {
            let v: serde_json::Value = match r.json().await {
                Ok(v) => v,
                Err(_) => {
                    return (
                        StatusCode::BAD_GATEWAY,
                        Json(json!({"error": "stripe response parse failed"})),
                    )
                        .into_response();
                }
            };
            match v.get("url").and_then(|u| u.as_str()) {
                Some(url) => Json(CheckoutDto {
                    checkout_url: url.to_string(),
                })
                .into_response(),
                None => (
                    StatusCode::BAD_GATEWAY,
                    Json(json!({"error": "stripe session missing url"})),
                )
                    .into_response(),
            }
        }
        Ok(r) => {
            tracing::error!("stripe checkout create failed: {}", r.status());
            (
                StatusCode::BAD_GATEWAY,
                Json(json!({"error": "stripe checkout failed"})),
            )
                .into_response()
        }
        Err(e) => {
            tracing::error!("stripe checkout request error: {}", e);
            (
                StatusCode::BAD_GATEWAY,
                Json(json!({"error": "stripe request error"})),
            )
                .into_response()
        }
    }
}

/// Verify a `Stripe-Signature` header against the raw payload.
fn verify_signature(secret: &str, sig_header: &str, payload: &[u8]) -> bool {
    let mut timestamp: Option<&str> = None;
    let mut v1s: Vec<&str> = Vec::new();
    for part in sig_header.split(',') {
        let mut kv = part.splitn(2, '=');
        match (kv.next(), kv.next()) {
            (Some("t"), Some(t)) => timestamp = Some(t),
            (Some("v1"), Some(v)) => v1s.push(v),
            _ => {}
        }
    }
    let Some(t) = timestamp else { return false };
    let mut mac = match HmacSha256::new_from_slice(secret.as_bytes()) {
        Ok(m) => m,
        Err(_) => return false,
    };
    mac.update(t.as_bytes());
    mac.update(b".");
    mac.update(payload);
    let expected = mac.finalize().into_bytes();
    let expected_hex: String = expected.iter().map(|b| format!("{b:02x}")).collect();
    // Constant-time-ish: compare against each provided v1.
    v1s.iter().any(|v| {
        v.len() == expected_hex.len()
            && v.bytes()
                .zip(expected_hex.bytes())
                .fold(0u8, |acc, (a, b)| acc | (a ^ b))
                == 0
    })
}

/// `POST /api/v1/wallet/topup/webhook` — Stripe webhook (no bearer; verified
/// by signature). On `checkout.session.completed`, credits the wallet. Not in
/// the OpenAPI surface: the raw `Bytes` body has no schema, and Stripe posts a
/// signed payload rather than a documented request shape.
pub(crate) async fn webhook(headers: HeaderMap, body: Bytes) -> Response {
    let secret = match std::env::var("STRIPE_WEBHOOK_SECRET") {
        Ok(s) if !s.is_empty() => s,
        _ => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({"error": "stripe webhook not configured"})),
            )
                .into_response();
        }
    };
    let sig = headers
        .get("stripe-signature")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if !verify_signature(&secret, sig, &body) {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "bad signature"})),
        )
            .into_response();
    }
    let event: serde_json::Value = match serde_json::from_slice(&body) {
        Ok(v) => v,
        Err(_) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "bad payload"})),
            )
                .into_response();
        }
    };

    let event_type = event.get("type").and_then(|t| t.as_str()).unwrap_or("");
    if event_type != "checkout.session.completed" {
        return StatusCode::OK.into_response(); // ignore other events
    }

    let event_id = event.get("id").and_then(|i| i.as_str()).unwrap_or("");
    let session = event
        .get("data")
        .and_then(|d| d.get("object"))
        .cloned()
        .unwrap_or(serde_json::Value::Null);
    let session_id = session.get("id").and_then(|s| s.as_str());
    let metadata = session.get("metadata").cloned().unwrap_or(json!({}));
    let user_id_str = metadata.get("user_id").and_then(|u| u.as_str());
    // Forward only the pack_id we set at checkout; the credit grant is derived
    // authoritatively from the server-side pack table in the database, so a
    // webhook-layer bug can't grant arbitrary credits. Validate the pack exists
    // locally before acting so an unknown pack is a no-op ack, not an error loop.
    let pack_id = metadata.get("pack_id").and_then(|p| p.as_str());
    let pack_valid = pack_id.map(|p| pack(p).is_some()).unwrap_or(false);
    let amount_cents = session
        .get("amount_total")
        .and_then(|a| a.as_i64())
        .unwrap_or(0);
    let currency = session
        .get("currency")
        .and_then(|c| c.as_str())
        .unwrap_or("usd")
        .to_string();

    let (Some(uid_str), Some(pack_id), true) =
        (user_id_str, pack_id, pack_valid && !event_id.is_empty())
    else {
        // Nothing actionable, but acknowledge so Stripe stops retrying.
        return StatusCode::OK.into_response();
    };
    let user_id = match uuid::Uuid::parse_str(uid_str) {
        Ok(u) => u,
        Err(_) => return StatusCode::OK.into_response(),
    };

    let client = match get_wallet_client() {
        Some(c) => c,
        None => return service_unavailable(),
    };
    match client
        .store_apply_topup(
            user_id,
            event_id.to_string(),
            session_id.map(|s| s.to_string()),
            pack_id.to_string(),
            amount_cents,
            currency,
        )
        .await
    {
        Ok(_) => StatusCode::OK.into_response(),
        // Permanent failures — bad pack/amount/currency, or a contradictory
        // replay. These never succeed on retry, so ack (200) rather than let
        // Stripe retry for days and eventually disable the endpoint.
        Err(
            e @ (kbve::wallet::WalletError::InvalidArgument(_)
            | kbve::wallet::WalletError::NullArgument(_)
            | kbve::wallet::WalletError::ReplayMismatch),
        ) => {
            tracing::warn!("topup apply rejected (permanent): {:?}", e);
            StatusCode::OK.into_response()
        }
        Err(e) => {
            tracing::error!("topup apply failed (transient): {:?}", e);
            // 500 makes Stripe retry; the apply is idempotent on event id.
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "topup apply failed"})),
            )
                .into_response()
        }
    }
}
