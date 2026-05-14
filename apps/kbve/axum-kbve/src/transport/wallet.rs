//! Wallet HTTP surface.
//!
//! User routes (`/api/v1/wallet/me/*`) resolve the caller via `auth_user_id`;
//! service routes require a `service_role` JWT. Each handler delegates to
//! `WalletClient`, which sets `request.jwt.claims` inside the txn so
//! `auth.uid()` resolves on the SQL side.

use axum::{
    Json,
    extract::Path,
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
};
use kbve::wallet::{
    CreditRequest, CurrencyKind, DebitRequest, SourceKind, TransferRequest, WalletError,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use utoipa::ToSchema;
use uuid::Uuid;

use super::https::auth_user_id;
use crate::auth::{extract_bearer_token, get_jwt_cache};
use crate::db::get_wallet_client;

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

#[derive(Deserialize, ToSchema)]
pub(crate) struct ServiceCreditBody {
    pub account_id: Uuid,
    /// `credits` or `khash`. Non-convertible currencies.
    pub currency: String,
    /// Positive amount in smallest unit (1 credit / 1 khash).
    pub amount: i64,
    /// One of: reward, purchase, refund, admin, coupon, market_buy,
    /// market_sell, market_fee, transfer.
    pub source_kind: String,
    pub reason: Option<String>,
    pub ref_type: Option<String>,
    pub ref_id: Option<i64>,
    /// Caller-supplied. Replay-safe with payload-mismatch detection.
    pub idempotency_key: Uuid,
}

#[derive(Serialize, ToSchema)]
pub(crate) struct ServiceLedgerDto {
    pub ledger_id: i64,
}

/// Variant of [`ServiceCreditBody`] keyed on Supabase `user_id` instead of
/// the wallet `account_id`. Used by service callers (MC mod daily reward,
/// edge functions) that know the user but not their wallet account UUID.
/// The handler resolves the account on first call (creating it + welcome
/// coupon if missing) before delegating to the regular credit path.
#[derive(Deserialize, ToSchema)]
pub(crate) struct ServiceCreditUserBody {
    pub user_id: Uuid,
    pub currency: String,
    pub amount: i64,
    pub source_kind: String,
    pub reason: Option<String>,
    pub ref_type: Option<String>,
    pub ref_id: Option<i64>,
    pub idempotency_key: Uuid,
}

#[derive(Serialize, ToSchema)]
pub(crate) struct ServiceCreditUserDto {
    pub account_id: Uuid,
    pub ledger_id: i64,
}

#[derive(Deserialize, ToSchema)]
pub(crate) struct ServiceTransferBody {
    pub from_account: Uuid,
    pub to_account: Uuid,
    pub currency: String,
    pub amount: i64,
    pub source_kind: String,
    pub reason: Option<String>,
    pub ref_type: Option<String>,
    pub ref_id: Option<i64>,
    pub idempotency_key: Uuid,
}

#[derive(Deserialize, ToSchema)]
pub(crate) struct ServiceRedeemCouponBody {
    pub coupon_id: i64,
    pub idempotency_key: Uuid,
}

#[derive(Deserialize, ToSchema)]
pub(crate) struct ServiceRevokeCouponBody {
    pub coupon_id: i64,
    pub reason: Option<String>,
}

#[derive(Serialize, ToSchema)]
pub(crate) struct ServiceRevokeDto {
    pub revoked: bool,
}

#[derive(Serialize, ToSchema)]
pub(crate) struct ServiceVerifyBalanceDto {
    pub account_id: Uuid,
    pub stored_credits: i64,
    pub ledger_credits: i64,
    pub stored_khash: i64,
    pub ledger_khash: i64,
    pub ok: bool,
}

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

/// Gate service routes: requires a Supabase JWT whose `role` claim is
/// `service_role`. Used by backend callers (MC mod, cron jobs, internal
/// scripts). Anon/authenticated JWTs are rejected.
async fn require_service_role(headers: &HeaderMap) -> Result<(), Response> {
    let auth_header = headers
        .get(header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok())
        .ok_or_else(|| {
            (
                StatusCode::UNAUTHORIZED,
                Json(json!({"error": "Missing Authorization header"})),
            )
                .into_response()
        })?;

    let token = extract_bearer_token(auth_header).ok_or_else(|| {
        (
            StatusCode::UNAUTHORIZED,
            Json(json!({"error": "Invalid bearer token"})),
        )
            .into_response()
    })?;

    let cache = get_jwt_cache().ok_or_else(|| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({"error": "Auth service unavailable"})),
        )
            .into_response()
    })?;

    let info = cache.verify_and_cache(token).await.map_err(|e| {
        tracing::warn!(error = %e, "JWT verify failed on service route");
        (
            StatusCode::UNAUTHORIZED,
            Json(json!({"error": "Invalid or expired token"})),
        )
            .into_response()
    })?;

    if info.role != "service_role" {
        return Err((
            StatusCode::FORBIDDEN,
            Json(json!({"error": "service_role required"})),
        )
            .into_response());
    }
    Ok(())
}

fn parse_currency(s: &str) -> Result<CurrencyKind, Response> {
    CurrencyKind::from_pg(s).ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "invalid currency", "message": format!("unknown currency: {s}")})),
        )
            .into_response()
    })
}

fn parse_source_kind(s: &str) -> Result<SourceKind, Response> {
    SourceKind::from_pg(s).ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "invalid source_kind", "message": format!("unknown source_kind: {s}")})),
        )
            .into_response()
    })
}

fn wallet_error_response(err: WalletError) -> Response {
    let (status, code) = match &err {
        WalletError::InsufficientFunds => (StatusCode::PAYMENT_REQUIRED, "insufficient_funds"),
        WalletError::ReplayMismatch => (StatusCode::CONFLICT, "replay_mismatch"),
        WalletError::Overflow => (StatusCode::UNPROCESSABLE_ENTITY, "overflow"),
        WalletError::NotAuthorized => (StatusCode::FORBIDDEN, "not_authorized"),
        WalletError::NotAuthenticated => (StatusCode::UNAUTHORIZED, "not_authenticated"),
        WalletError::AccountMissing => (StatusCode::NOT_FOUND, "account_missing"),
        WalletError::NullArgument(_) => (StatusCode::UNPROCESSABLE_ENTITY, "null_argument"),
        WalletError::InvalidArgument(_) => (StatusCode::BAD_REQUEST, "invalid_argument"),
        WalletError::NotFound(_) => (StatusCode::NOT_FOUND, "not_found"),
        WalletError::CouponNotRedeemable(_) => (StatusCode::FORBIDDEN, "coupon_not_redeemable"),
        WalletError::CouponExpired => (StatusCode::FORBIDDEN, "coupon_expired"),
        WalletError::Unimplemented(_) => (StatusCode::NOT_IMPLEMENTED, "unimplemented"),
        WalletError::Pool(_) | WalletError::Db(_) => {
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

/// `POST /api/v1/wallet/service/credit` — credit a positive delta to any
/// account. Returns the resulting ledger id. Idempotent: replays with the
/// same `idempotency_key` return the original id; mismatched payloads on
/// the same key raise `409 replay_mismatch`.
#[utoipa::path(
    post,
    path = "/api/v1/wallet/service/credit",
    tag = "wallet",
    request_body = ServiceCreditBody,
    responses(
        (status = 200, description = "Ledger row created", body = ServiceLedgerDto),
        (status = 400, description = "Invalid currency / source_kind / payload"),
        (status = 401, description = "Missing / invalid bearer token"),
        (status = 403, description = "service_role required"),
        (status = 409, description = "Idempotency replay mismatch"),
        (status = 422, description = "Overflow / null argument"),
        (status = 503, description = "Wallet service unavailable"),
    ),
    security(("bearerAuth" = [])),
)]
pub(crate) async fn service_credit(
    headers: HeaderMap,
    Json(body): Json<ServiceCreditBody>,
) -> Response {
    if let Err(resp) = require_service_role(&headers).await {
        return resp;
    }
    let currency = match parse_currency(&body.currency) {
        Ok(c) => c,
        Err(r) => return r,
    };
    let source_kind = match parse_source_kind(&body.source_kind) {
        Ok(s) => s,
        Err(r) => return r,
    };
    let client = match get_wallet_client() {
        Some(c) => c,
        None => return service_unavailable(),
    };
    let req = CreditRequest {
        account_id: body.account_id,
        currency,
        amount: body.amount,
        source_kind,
        reason: body.reason,
        ref_type: body.ref_type,
        ref_id: body.ref_id,
        idempotency_key: body.idempotency_key,
    };
    match client.credit(req).await {
        Ok(ledger_id) => Json(ServiceLedgerDto { ledger_id }).into_response(),
        Err(e) => wallet_error_response(e),
    }
}

/// `POST /api/v1/wallet/service/debit` — deduct from an account. Raises
/// `402 insufficient_funds` if the balance would go negative.
#[utoipa::path(
    post,
    path = "/api/v1/wallet/service/debit",
    tag = "wallet",
    request_body = ServiceCreditBody,
    responses(
        (status = 200, description = "Ledger row created", body = ServiceLedgerDto),
        (status = 400, description = "Invalid currency / source_kind / payload"),
        (status = 401, description = "Missing / invalid bearer token"),
        (status = 402, description = "Insufficient funds"),
        (status = 403, description = "service_role required"),
        (status = 409, description = "Idempotency replay mismatch"),
        (status = 503, description = "Wallet service unavailable"),
    ),
    security(("bearerAuth" = [])),
)]
pub(crate) async fn service_debit(
    headers: HeaderMap,
    Json(body): Json<ServiceCreditBody>,
) -> Response {
    if let Err(resp) = require_service_role(&headers).await {
        return resp;
    }
    let currency = match parse_currency(&body.currency) {
        Ok(c) => c,
        Err(r) => return r,
    };
    let source_kind = match parse_source_kind(&body.source_kind) {
        Ok(s) => s,
        Err(r) => return r,
    };
    let client = match get_wallet_client() {
        Some(c) => c,
        None => return service_unavailable(),
    };
    let req = DebitRequest {
        account_id: body.account_id,
        currency,
        amount: body.amount,
        source_kind,
        reason: body.reason,
        ref_type: body.ref_type,
        ref_id: body.ref_id,
        idempotency_key: body.idempotency_key,
    };
    match client.debit(req).await {
        Ok(ledger_id) => Json(ServiceLedgerDto { ledger_id }).into_response(),
        Err(e) => wallet_error_response(e),
    }
}

/// `POST /api/v1/wallet/service/transfer` — atomic debit + credit. Locks
/// both accounts in canonical UUID order to eliminate the A↔B deadlock vector.
#[utoipa::path(
    post,
    path = "/api/v1/wallet/service/transfer",
    tag = "wallet",
    request_body = ServiceTransferBody,
    responses(
        (status = 204, description = "Transfer committed"),
        (status = 400, description = "Invalid currency / source_kind / payload"),
        (status = 401, description = "Missing / invalid bearer token"),
        (status = 402, description = "Insufficient funds on source"),
        (status = 403, description = "service_role required"),
        (status = 409, description = "Idempotency replay mismatch"),
        (status = 503, description = "Wallet service unavailable"),
    ),
    security(("bearerAuth" = [])),
)]
pub(crate) async fn service_transfer(
    headers: HeaderMap,
    Json(body): Json<ServiceTransferBody>,
) -> Response {
    if let Err(resp) = require_service_role(&headers).await {
        return resp;
    }
    let currency = match parse_currency(&body.currency) {
        Ok(c) => c,
        Err(r) => return r,
    };
    let source_kind = match parse_source_kind(&body.source_kind) {
        Ok(s) => s,
        Err(r) => return r,
    };
    let client = match get_wallet_client() {
        Some(c) => c,
        None => return service_unavailable(),
    };
    let req = TransferRequest {
        from_account: body.from_account,
        to_account: body.to_account,
        currency,
        amount: body.amount,
        source_kind,
        reason: body.reason,
        ref_type: body.ref_type,
        ref_id: body.ref_id,
        idempotency_key: body.idempotency_key,
    };
    match client.transfer(req).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => wallet_error_response(e),
    }
}

/// `POST /api/v1/wallet/service/redeem-coupon` — redeem a coupon on behalf
/// of any account. Service-side variant of the user proxy; useful for
/// admin grants or backend-initiated redemptions.
#[utoipa::path(
    post,
    path = "/api/v1/wallet/service/redeem-coupon",
    tag = "wallet",
    request_body = ServiceRedeemCouponBody,
    responses(
        (status = 200, description = "Redemption result", body = RedeemCouponDto),
        (status = 401, description = "Missing / invalid bearer token"),
        (status = 403, description = "service_role required / coupon not redeemable"),
        (status = 404, description = "Coupon not found"),
        (status = 409, description = "Idempotency replay mismatch"),
        (status = 501, description = "Reward kind not yet implemented"),
        (status = 503, description = "Wallet service unavailable"),
    ),
    security(("bearerAuth" = [])),
)]
pub(crate) async fn service_redeem_coupon(
    headers: HeaderMap,
    Json(body): Json<ServiceRedeemCouponBody>,
) -> Response {
    if let Err(resp) = require_service_role(&headers).await {
        return resp;
    }
    let client = match get_wallet_client() {
        Some(c) => c,
        None => return service_unavailable(),
    };
    match client
        .redeem_coupon(body.coupon_id, body.idempotency_key)
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

/// `POST /api/v1/wallet/service/revoke-coupon` — admin clawback. Cannot
/// revoke a redeemed coupon (funds already out). Idempotent: revoking an
/// already-revoked coupon returns `{revoked: false}` without raising.
#[utoipa::path(
    post,
    path = "/api/v1/wallet/service/revoke-coupon",
    tag = "wallet",
    request_body = ServiceRevokeCouponBody,
    responses(
        (status = 200, description = "Revoke result", body = ServiceRevokeDto),
        (status = 401, description = "Missing / invalid bearer token"),
        (status = 403, description = "service_role required / coupon already redeemed"),
        (status = 404, description = "Coupon not found"),
        (status = 503, description = "Wallet service unavailable"),
    ),
    security(("bearerAuth" = [])),
)]
pub(crate) async fn service_revoke_coupon(
    headers: HeaderMap,
    Json(body): Json<ServiceRevokeCouponBody>,
) -> Response {
    if let Err(resp) = require_service_role(&headers).await {
        return resp;
    }
    let client = match get_wallet_client() {
        Some(c) => c,
        None => return service_unavailable(),
    };
    match client.revoke_coupon(body.coupon_id, body.reason).await {
        Ok(revoked) => Json(ServiceRevokeDto { revoked }).into_response(),
        Err(e) => wallet_error_response(e),
    }
}

/// `GET /api/v1/wallet/service/verify-balance/:account_id` — compare stored
/// balance vs ledger sum per currency. Run periodically or after suspected
/// corruption. `ok=true` means consistent.
#[utoipa::path(
    get,
    path = "/api/v1/wallet/service/verify-balance/{account_id}",
    tag = "wallet",
    params(
        ("account_id" = String, Path, description = "Wallet account UUID")
    ),
    responses(
        (status = 200, description = "Balance vs ledger comparison", body = ServiceVerifyBalanceDto),
        (status = 401, description = "Missing / invalid bearer token"),
        (status = 403, description = "service_role required"),
        (status = 404, description = "Account not found"),
        (status = 503, description = "Wallet service unavailable"),
    ),
    security(("bearerAuth" = [])),
)]
pub(crate) async fn service_verify_balance(
    headers: HeaderMap,
    Path(account_id): Path<Uuid>,
) -> Response {
    if let Err(resp) = require_service_role(&headers).await {
        return resp;
    }
    let client = match get_wallet_client() {
        Some(c) => c,
        None => return service_unavailable(),
    };
    match client.verify_balance(account_id).await {
        Ok(v) => Json(ServiceVerifyBalanceDto {
            account_id: v.account_id,
            stored_credits: v.stored_credits,
            ledger_credits: v.ledger_credits,
            stored_khash: v.stored_khash,
            ledger_khash: v.ledger_khash,
            ok: v.ok,
        })
        .into_response(),
        Err(e) => wallet_error_response(e),
    }
}

/// `POST /api/v1/wallet/service/credit-user` — credit keyed on Supabase
/// user_id rather than wallet account_id. Resolves (or creates) the
/// account first via `wallet.proxy_ensure_user_account`, then runs the
/// regular service_credit path. Idempotent with the same key.
///
/// Designed for the MC mod daily-login flow + edge-function callers that
/// only know a user_id.
#[utoipa::path(
    post,
    path = "/api/v1/wallet/service/credit-user",
    tag = "wallet",
    request_body = ServiceCreditUserBody,
    responses(
        (status = 200, description = "Account resolved + ledger row created", body = ServiceCreditUserDto),
        (status = 400, description = "Invalid currency / source_kind / payload"),
        (status = 401, description = "Missing / invalid bearer token"),
        (status = 403, description = "service_role required"),
        (status = 409, description = "Idempotency replay mismatch"),
        (status = 422, description = "Overflow / null argument"),
        (status = 503, description = "Wallet service unavailable"),
    ),
    security(("bearerAuth" = [])),
)]
pub(crate) async fn service_credit_user(
    headers: HeaderMap,
    Json(body): Json<ServiceCreditUserBody>,
) -> Response {
    if let Err(resp) = require_service_role(&headers).await {
        return resp;
    }
    let currency = match parse_currency(&body.currency) {
        Ok(c) => c,
        Err(r) => return r,
    };
    let source_kind = match parse_source_kind(&body.source_kind) {
        Ok(s) => s,
        Err(r) => return r,
    };
    let client = match get_wallet_client() {
        Some(c) => c,
        None => return service_unavailable(),
    };

    let account_id = match client.service_account_for_user(body.user_id).await {
        Ok(id) => id,
        Err(e) => return wallet_error_response(e),
    };

    let req = CreditRequest {
        account_id,
        currency,
        amount: body.amount,
        source_kind,
        reason: body.reason,
        ref_type: body.ref_type,
        ref_id: body.ref_id,
        idempotency_key: body.idempotency_key,
    };
    match client.credit(req).await {
        Ok(ledger_id) => Json(ServiceCreditUserDto {
            account_id,
            ledger_id,
        })
        .into_response(),
        Err(e) => wallet_error_response(e),
    }
}
