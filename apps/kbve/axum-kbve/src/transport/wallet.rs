//! Wallet HTTP surface — user-facing `/api/v1/wallet/me/*` routes.
//!
//! Service routes (`/api/v1/wallet/service/*`) are deferred to a follow-up;
//! the dashboard's Claim 1000 KHash button only needs the user proxy path.
//!
//! Each handler:
//!   1. Extracts the Supabase user_id via the shared `auth_user_id` helper.
//!   2. Looks up the global `WalletClient` (skip with 503 if disabled).
//!   3. Calls the matching `WalletClient::user_*` op (sets request.jwt.claims
//!      inside the txn so `auth.uid()` resolves correctly).
//!   4. Maps `WalletError` to HTTP status + JSON error body.

use axum::{
    Json,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use kbve::wallet::WalletError;
use serde::{Deserialize, Serialize};
use serde_json::json;
use utoipa::ToSchema;
use uuid::Uuid;

use super::https::auth_user_id;
use crate::db::get_wallet_client;

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

#[derive(Serialize, ToSchema)]
pub(crate) struct BalanceDto {
    pub account_id: Uuid,
    pub credits: i64,
    pub khash: i64,
    pub updated_at: String,
}

#[derive(Serialize, ToSchema)]
pub(crate) struct CouponDto {
    pub coupon_id: i64,
    pub template_code: String,
    pub template_label: String,
    pub reward_kind: String,
    pub reward_payload: serde_json::Value,
    pub status: String,
    pub granted_at: String,
    pub expires_at: Option<String>,
    pub redeemed_at: Option<String>,
}

#[derive(Deserialize, ToSchema)]
pub(crate) struct RedeemCouponBody {
    pub coupon_id: i64,
    /// Caller-supplied UUID. Retries with the same key replay the same
    /// redemption and return the original ledger_id.
    pub idempotency_key: Uuid,
}

#[derive(Serialize, ToSchema)]
pub(crate) struct RedeemCouponDto {
    pub success: bool,
    pub reward_kind: String,
    pub reward_payload: serde_json::Value,
    pub ledger_id: i64,
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// `GET /api/v1/wallet/me/balance` — returns the caller's wallet balance.
/// Lazily provisions the wallet account + welcome coupon on first call.
#[utoipa::path(
    get,
    path = "/api/v1/wallet/me/balance",
    tag = "wallet",
    responses(
        (status = 200, description = "Caller's balance", body = BalanceDto),
        (status = 401, description = "Missing / invalid bearer token"),
        (status = 503, description = "Wallet service unavailable"),
    ),
    security(("bearerAuth" = [])),
)]
pub(crate) async fn me_balance(headers: HeaderMap) -> Response {
    let user_id = match resolve_user(&headers).await {
        Ok(id) => id,
        Err(resp) => return resp,
    };

    let client = match get_wallet_client() {
        Some(c) => c,
        None => return service_unavailable(),
    };

    match client.user_balance(user_id).await {
        Ok(b) => Json(BalanceDto {
            account_id: b.account_id,
            credits: b.credits,
            khash: b.khash,
            updated_at: b.updated_at.to_rfc3339(),
        })
        .into_response(),
        Err(e) => wallet_error_response(e),
    }
}

/// `GET /api/v1/wallet/me/coupons` — returns the caller's coupons
/// (unredeemed + history).
#[utoipa::path(
    get,
    path = "/api/v1/wallet/me/coupons",
    tag = "wallet",
    responses(
        (status = 200, description = "Caller's coupons", body = [CouponDto]),
        (status = 401, description = "Missing / invalid bearer token"),
        (status = 503, description = "Wallet service unavailable"),
    ),
    security(("bearerAuth" = [])),
)]
pub(crate) async fn me_coupons(headers: HeaderMap) -> Response {
    let user_id = match resolve_user(&headers).await {
        Ok(id) => id,
        Err(resp) => return resp,
    };

    let client = match get_wallet_client() {
        Some(c) => c,
        None => return service_unavailable(),
    };

    match client.user_coupons(user_id).await {
        Ok(rows) => Json(
            rows.into_iter()
                .map(|c| CouponDto {
                    coupon_id: c.coupon_id,
                    template_code: c.template_code,
                    template_label: c.template_label,
                    reward_kind: c.reward_kind.as_pg().to_string(),
                    reward_payload: c.reward_payload,
                    status: c.status.as_pg().to_string(),
                    granted_at: c.granted_at.to_rfc3339(),
                    expires_at: c.expires_at.map(|t| t.to_rfc3339()),
                    redeemed_at: c.redeemed_at.map(|t| t.to_rfc3339()),
                })
                .collect::<Vec<_>>(),
        )
        .into_response(),
        Err(e) => wallet_error_response(e),
    }
}

/// `POST /api/v1/wallet/me/redeem-coupon` — redeem one of the caller's coupons.
/// Ownership-checked + idempotent at the coupon layer.
#[utoipa::path(
    post,
    path = "/api/v1/wallet/me/redeem-coupon",
    tag = "wallet",
    request_body = RedeemCouponBody,
    responses(
        (status = 200, description = "Redemption result", body = RedeemCouponDto),
        (status = 400, description = "Invalid argument"),
        (status = 401, description = "Missing / invalid bearer token"),
        (status = 403, description = "Coupon not redeemable / expired / revoked"),
        (status = 404, description = "Coupon not found / not owned by caller"),
        (status = 409, description = "Idempotency replay mismatch"),
        (status = 501, description = "Reward kind not yet implemented"),
        (status = 503, description = "Wallet service unavailable"),
    ),
    security(("bearerAuth" = [])),
)]
pub(crate) async fn me_redeem_coupon(
    headers: HeaderMap,
    Json(body): Json<RedeemCouponBody>,
) -> Response {
    let user_id = match resolve_user(&headers).await {
        Ok(id) => id,
        Err(resp) => return resp,
    };

    let client = match get_wallet_client() {
        Some(c) => c,
        None => return service_unavailable(),
    };

    match client
        .user_redeem_coupon(user_id, body.coupon_id, body.idempotency_key)
        .await
    {
        Ok(r) => Json(RedeemCouponDto {
            success: r.success,
            reward_kind: r.reward_kind.as_pg().to_string(),
            reward_payload: r.reward_payload,
            ledger_id: r.ledger_id,
        })
        .into_response(),
        Err(e) => wallet_error_response(e),
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async fn resolve_user(headers: &HeaderMap) -> Result<Uuid, Response> {
    let s = auth_user_id(headers).await?;
    Uuid::parse_str(&s).map_err(|_| {
        (
            StatusCode::UNAUTHORIZED,
            Json(json!({"error": "JWT sub is not a valid UUID"})),
        )
            .into_response()
    })
}

fn service_unavailable() -> Response {
    (
        StatusCode::SERVICE_UNAVAILABLE,
        Json(json!({"error": "Wallet service unavailable"})),
    )
        .into_response()
}

fn wallet_error_response(err: WalletError) -> Response {
    let (status, code) = match &err {
        WalletError::InsufficientFunds => (StatusCode::PAYMENT_REQUIRED, "insufficient_funds"),
        WalletError::ReplayMismatch => (StatusCode::CONFLICT, "replay_mismatch"),
        WalletError::Overflow => (StatusCode::UNPROCESSABLE_ENTITY, "overflow"),
        WalletError::NotAuthorized => (StatusCode::FORBIDDEN, "not_authorized"),
        WalletError::NotAuthenticated => (StatusCode::UNAUTHORIZED, "not_authenticated"),
        WalletError::NullArgument(_) => (StatusCode::UNPROCESSABLE_ENTITY, "null_argument"),
        WalletError::InvalidArgument(_) => (StatusCode::BAD_REQUEST, "invalid_argument"),
        WalletError::NotFound(_) => (StatusCode::NOT_FOUND, "not_found"),
        WalletError::CouponNotRedeemable(_) => (StatusCode::FORBIDDEN, "coupon_not_redeemable"),
        WalletError::CouponExpired => (StatusCode::FORBIDDEN, "coupon_expired"),
        WalletError::Unimplemented(_) => (StatusCode::NOT_IMPLEMENTED, "unimplemented"),
        WalletError::Pool(_) | WalletError::Join(_) | WalletError::Db(_) => {
            // Log the raw error server-side, send a generic message to the client.
            tracing::error!(error = %err, "wallet upstream failure");
            (StatusCode::INTERNAL_SERVER_ERROR, "internal")
        }
    };

    (
        status,
        Json(json!({
            "error": code,
            "message": err.to_string(),
        })),
    )
        .into_response()
}
