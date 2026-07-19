//! Print-on-demand fulfillment adapter (Printful/Printify-style). Submitting an
//! order posts it to the POD provider and records the external id on
//! store.order.pod_ref; a shipment webhook advances the order to 'shipped'.
//! No new order states — POD rides the Phase 2 status pipeline.
//!
//! Degrades to 503 when unconfigured, so builds/e2e stay green without a
//! provider account:
//!   POD_API_KEY        — provider API auth (enables submit)
//!   POD_API_BASE       — provider base url (default Printful)
//!   POD_WEBHOOK_SECRET — shared secret for the shipment webhook

use axum::{
    Json,
    body::Bytes,
    extract::Path,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use serde::Serialize;
use serde_json::json;
use utoipa::ToSchema;

use super::store::require_staff;
use super::wallet::service_unavailable;
use crate::db::get_wallet_client;

#[derive(Serialize, ToSchema)]
pub(crate) struct PodSubmitDto {
    pub order_id: i64,
    pub external_id: String,
}

/// `POST /api/v1/store/staff/orders/:order_id/submit-pod` — submit to provider.
#[utoipa::path(
    post,
    path = "/api/v1/store/staff/orders/{order_id}/submit-pod",
    tag = "store",
    params(("order_id" = i64, Path, description = "Order id")),
    responses(
        (status = 200, description = "Submitted to POD provider", body = PodSubmitDto),
        (status = 403, description = "Staff permissions required"),
        (status = 404, description = "Order not found"),
        (status = 502, description = "POD provider error"),
        (status = 503, description = "POD not configured"),
    ),
    security(("bearerAuth" = [])),
)]
pub(crate) async fn submit_pod(headers: HeaderMap, Path(order_id): Path<i64>) -> Response {
    if let Err(resp) = require_staff(&headers).await {
        return resp;
    }
    let api_key = match std::env::var("POD_API_KEY") {
        Ok(k) if !k.is_empty() => k,
        _ => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({"error": "pod not configured"})),
            )
                .into_response();
        }
    };
    let api_base =
        std::env::var("POD_API_BASE").unwrap_or_else(|_| "https://api.printful.com".to_string());

    let client = match get_wallet_client() {
        Some(c) => c,
        None => return service_unavailable(),
    };
    let order = match client
        .store_order_for_pod(order_id, Some("axum-pod-submit".to_string()))
        .await
    {
        Ok(Some(o)) => o,
        Ok(None) => {
            return (StatusCode::NOT_FOUND, Json(json!({"error": "not_found"}))).into_response();
        }
        Err(e) => {
            tracing::error!("pod order fetch failed: {:?}", e);
            return service_unavailable();
        }
    };

    // Lease token from the claim — required to acknowledge the submission. A
    // worker whose lease expired and was reclaimed holds a stale token and its
    // ack is rejected, so it cannot double-write this order.
    let claim_token = match order
        .get("claim_token")
        .and_then(|v| v.as_str())
        .and_then(|s| uuid::Uuid::parse_str(s).ok())
    {
        Some(t) => t,
        None => {
            tracing::error!("pod claim missing claim_token for order {order_id}");
            return service_unavailable();
        }
    };

    // Generic provider payload: external id maps back to our order; item by
    // sku + qty; recipient from the stored shipping address. Providers accept
    // supersets of this; exact variant→provider mapping is provider-specific.
    let addr = order.get("shipping_address").cloned().unwrap_or(json!({}));
    let payload = json!({
        "external_id": order_id.to_string(),
        "recipient": {
            "name": addr.get("name"),
            "address1": addr.get("line1"),
            "address2": addr.get("line2"),
            "city": addr.get("city"),
            "state_code": addr.get("region"),
            "zip": addr.get("postal"),
            "country_code": addr.get("country"),
        },
        "items": [{
            "sku": order.get("sku"),
            "quantity": order.get("qty"),
        }],
    });

    let http = reqwest::Client::new();
    let resp = http
        .post(format!("{api_base}/orders"))
        .bearer_auth(&api_key)
        .json(&payload)
        .send()
        .await;

    let body = match resp {
        Ok(r) if r.status().is_success() => r.json::<serde_json::Value>().await.ok(),
        Ok(r) => {
            tracing::error!("pod submit failed: {}", r.status());
            return (StatusCode::BAD_GATEWAY, Json(json!({"error": "pod submit failed"})))
                .into_response();
        }
        Err(e) => {
            tracing::error!("pod submit request error: {}", e);
            return (StatusCode::BAD_GATEWAY, Json(json!({"error": "pod request error"})))
                .into_response();
        }
    };

    // Provider order id lives at result.id (Printful) or id (Printify).
    let external_id = body
        .as_ref()
        .and_then(|b| {
            b.get("result")
                .and_then(|r| r.get("id"))
                .or_else(|| b.get("id"))
        })
        .map(|v| v.to_string())
        .unwrap_or_else(|| format!("pod-{order_id}"));

    let pod_ref = json!({
        "provider": "printful",
        "external_order_id": external_id,
        "submitted": true,
    });
    if let Err(e) = client
        .store_ack_pod_submission(order_id, claim_token, pod_ref)
        .await
    {
        tracing::error!("ack pod submission failed: {:?}", e);
        return service_unavailable();
    }
    // Best-effort advance paid → processing.
    let _ = client
        .store_advance_order(kbve::wallet::StoreAdvanceOrder {
            order_id,
            to_status: "processing".to_string(),
            tracking: json!({}),
            note: Some("submitted to POD".to_string()),
        })
        .await;

    Json(PodSubmitDto {
        order_id,
        external_id,
    })
    .into_response()
}

/// `POST /api/v1/store/pod/webhook` — POD shipment webhook. Advances the mapped
/// order to 'shipped' with tracking. Not in OpenAPI (raw body, provider-shaped).
pub(crate) async fn webhook(headers: HeaderMap, body: Bytes) -> Response {
    let secret = match std::env::var("POD_WEBHOOK_SECRET") {
        Ok(s) if !s.is_empty() => s,
        _ => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({"error": "pod webhook not configured"})),
            )
                .into_response();
        }
    };
    let provided = headers
        .get("x-pod-secret")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if provided.is_empty()
        || provided.len() != secret.len()
        || provided
            .bytes()
            .zip(secret.bytes())
            .fold(0u8, |acc, (a, b)| acc | (a ^ b))
            != 0
    {
        return (StatusCode::UNAUTHORIZED, Json(json!({"error": "bad secret"}))).into_response();
    }

    let event: serde_json::Value = match serde_json::from_slice(&body) {
        Ok(v) => v,
        Err(_) => {
            return (StatusCode::BAD_REQUEST, Json(json!({"error": "bad payload"})))
                .into_response();
        }
    };

    // Only act on shipment events. Provider event shape varies; look for a
    // shipped/package_shipped type and our external_id.
    let event_type = event
        .get("type")
        .and_then(|t| t.as_str())
        .unwrap_or("")
        .to_lowercase();
    if !event_type.contains("ship") {
        return StatusCode::OK.into_response();
    }

    let data = event.get("data").cloned().unwrap_or(json!({}));
    let external_id = data
        .get("order")
        .and_then(|o| o.get("external_id"))
        .or_else(|| data.get("external_id"))
        .and_then(|v| v.as_str());
    let order_id: Option<i64> = external_id.and_then(|s| s.parse().ok());
    let Some(order_id) = order_id else {
        return StatusCode::OK.into_response();
    };

    let tracking = json!({
        "carrier": data.get("shipment").and_then(|s| s.get("carrier")),
        "number": data.get("shipment").and_then(|s| s.get("tracking_number")),
        "url": data.get("shipment").and_then(|s| s.get("tracking_url")),
    });

    let provider_event_id = event
        .get("id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| format!("pod-evt-{order_id}"));
    let provider_external_id = data
        .get("order")
        .and_then(|o| o.get("id"))
        .or_else(|| data.get("id"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    // PII-reduced audit payload: identifiers + type + tracking ONLY — never the
    // recipient name/address from the raw provider body (RLS doesn't protect
    // backups/exports).
    let safe_payload = json!({
        "type": event_type,
        "event_id": provider_event_id.clone(),
        "external_order_id": provider_external_id.clone(),
        "tracking": tracking.clone(),
    });

    let client = match get_wallet_client() {
        Some(c) => c,
        None => return service_unavailable(),
    };

    // One atomic call: record the receipt + advance the order to shipped in a
    // single txn (dedupe by provider event id). Errors are acked so the provider
    // stops retrying; a contradictory replay is logged.
    match client
        .store_apply_pod_shipment(
            "printful".to_string(),
            provider_event_id,
            provider_external_id,
            Some(order_id),
            tracking,
            safe_payload,
        )
        .await
    {
        Ok(_) => StatusCode::OK.into_response(),
        Err(e) => {
            tracing::warn!("pod shipment apply: {:?}", e);
            StatusCode::OK.into_response()
        }
    }
}
