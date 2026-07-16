//! Marketplace HTTP surface.
//!
//! Browse routes (`GET /api/v1/market/listings*`) are anon-callable and hit
//! the read pool via `proxy_market_*_readonly`. Authenticated routes resolve
//! the caller via `auth_user_id` and delegate to `WalletClient::market_*`,
//! which sets `request.jwt.claims` inside the txn so `auth.uid()` resolves
//! on the SQL side and the proxy authorizes by seller/bidder ownership.

use axum::{
    Json,
    extract::{Path, Query},
    http::HeaderMap,
    response::{IntoResponse, Response},
};
use chrono::{DateTime, Utc};
use kbve::wallet::{
    MarketBuyNowRequest, MarketCancelListingRequest, MarketCreateListingRequest,
    MarketPlaceBidRequest,
};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use super::wallet::{resolve_user, service_unavailable, wallet_error_response};
use crate::db::get_wallet_client;

const DEFAULT_PAGE_LIMIT: i32 = 25;
const MAX_PAGE_LIMIT: i32 = 100;

#[derive(Serialize, ToSchema)]
pub(crate) struct MarketListingDto {
    pub listing_id: i64,
    pub seller_account: Uuid,
    pub item_ref: serde_json::Value,
    pub currency: String,
    pub buy_now_price: Option<i64>,
    pub min_bid: Option<i64>,
    pub current_bid: Option<i64>,
    pub expires_at: String,
    pub created_at: String,
}

#[derive(Serialize, ToSchema)]
pub(crate) struct MarketListingDetailDto {
    pub listing_id: i64,
    pub seller_account: Uuid,
    pub item_ref: serde_json::Value,
    pub currency: String,
    pub buy_now_price: Option<i64>,
    pub min_bid: Option<i64>,
    pub current_bid: Option<i64>,
    pub current_bid_id: Option<i64>,
    pub listing_status: String,
    pub expires_at: String,
    pub created_at: String,
    pub updated_at: String,
    pub settled_at: Option<String>,
    /// JSONB array of up to 50 most recent bids. Bidder UUIDs, ledger ids,
    /// and settled_at are redacted by the SQL proxy.
    pub bids: serde_json::Value,
}

#[derive(Serialize, ToSchema)]
pub(crate) struct MarketMyListingDto {
    pub listing_id: i64,
    pub item_ref: serde_json::Value,
    pub currency: String,
    pub buy_now_price: Option<i64>,
    pub min_bid: Option<i64>,
    pub current_bid: Option<i64>,
    pub current_bid_account: Option<Uuid>,
    pub buyer_account: Option<Uuid>,
    pub listing_status: String,
    pub expires_at: String,
    pub created_at: String,
    pub settled_at: Option<String>,
}

#[derive(Serialize, ToSchema)]
pub(crate) struct MarketMyBidDto {
    pub bid_id: i64,
    pub listing_id: i64,
    pub amount: i64,
    pub bid_status: String,
    pub placed_at: String,
    pub settled_at: Option<String>,
    pub escrow_ledger_id: i64,
    pub refund_ledger_id: Option<i64>,
}

#[derive(Deserialize, ToSchema)]
pub(crate) struct ListingsQuery {
    /// Page size. Clamped to [1, 100]. Default 25.
    pub limit: Option<i32>,
    /// Keyset cursor: previous page's last `created_at` (RFC3339).
    pub before_created_at: Option<DateTime<Utc>>,
    /// Keyset cursor: previous page's last `listing_id`.
    pub before_id: Option<i64>,
}

#[derive(Deserialize, ToSchema)]
pub(crate) struct BidsQuery {
    /// Page size. Clamped to [1, 100]. Default 25.
    pub limit: Option<i32>,
    /// Keyset cursor: previous page's last `placed_at` (RFC3339).
    pub before_placed_at: Option<DateTime<Utc>>,
    /// Keyset cursor: previous page's last `bid_id`.
    pub before_id: Option<i64>,
}

#[derive(Deserialize, ToSchema)]
pub(crate) struct CreateListingBody {
    /// inventory.item id the seller owns in `held` state.
    pub src_item_id: Uuid,
    /// None / src.qty = whole row; smaller = split.
    #[serde(default)]
    pub qty: Option<i64>,
    pub buy_now_price: Option<i64>,
    pub min_bid: Option<i64>,
    pub expires_at: DateTime<Utc>,
    /// Caller-supplied. Replays return the original listing_id.
    pub idempotency_key: Uuid,
}

#[derive(Deserialize, ToSchema)]
pub(crate) struct PlaceBidBody {
    pub amount: i64,
    pub idempotency_key: Uuid,
}

#[derive(Deserialize, ToSchema)]
pub(crate) struct BuyNowBody {
    pub idempotency_key: Uuid,
}

#[derive(Deserialize, ToSchema)]
pub(crate) struct CancelListingBody {
    pub reason: Option<String>,
}

#[derive(Serialize, ToSchema)]
pub(crate) struct MarketIdDto {
    /// listing_id (create) / bid_id (bid) / ledger_id (buy-now).
    pub id: i64,
}

fn clamp_limit(raw: Option<i32>) -> i32 {
    raw.unwrap_or(DEFAULT_PAGE_LIMIT).clamp(1, MAX_PAGE_LIMIT)
}

/// `GET /api/v1/market/listings` — paged active listings, public/anon.
#[utoipa::path(
    get,
    path = "/api/v1/market/listings",
    tag = "market",
    params(
        ("limit" = Option<i32>, Query, description = "Page size (1-100, default 25)"),
        ("before_created_at" = Option<String>, Query, description = "Keyset cursor: previous page's last created_at (RFC3339)"),
        ("before_id" = Option<i64>, Query, description = "Keyset cursor: previous page's last listing_id"),
    ),
    responses(
        (status = 200, description = "Active listings page", body = [MarketListingDto]),
        (status = 503, description = "Wallet service unavailable"),
    ),
)]
pub(crate) async fn list_active(Query(q): Query<ListingsQuery>) -> Response {
    let client = match get_wallet_client() {
        Some(c) => c,
        None => return service_unavailable(),
    };
    match client
        .market_list_active(clamp_limit(q.limit), q.before_created_at, q.before_id)
        .await
    {
        Ok(rows) => Json(
            rows.into_iter()
                .map(|r| MarketListingDto {
                    listing_id: r.listing_id,
                    seller_account: r.seller_account,
                    item_ref: r.item_ref,
                    currency: r.currency.as_pg().to_string(),
                    buy_now_price: r.buy_now_price,
                    min_bid: r.min_bid,
                    current_bid: r.current_bid,
                    expires_at: r.expires_at.to_rfc3339(),
                    created_at: r.created_at.to_rfc3339(),
                })
                .collect::<Vec<_>>(),
        )
        .into_response(),
        Err(e) => wallet_error_response(e),
    }
}

/// `GET /api/v1/market/listings/:id` — listing detail + up to 50 recent bids.
#[utoipa::path(
    get,
    path = "/api/v1/market/listings/{listing_id}",
    tag = "market",
    params(
        ("listing_id" = i64, Path, description = "Listing id")
    ),
    responses(
        (status = 200, description = "Listing detail", body = MarketListingDetailDto),
        (status = 404, description = "Listing not found"),
        (status = 503, description = "Wallet service unavailable"),
    ),
)]
pub(crate) async fn listing_detail(Path(listing_id): Path<i64>) -> Response {
    let client = match get_wallet_client() {
        Some(c) => c,
        None => return service_unavailable(),
    };
    match client.market_listing_detail(listing_id).await {
        Ok(d) => Json(MarketListingDetailDto {
            listing_id: d.listing_id,
            seller_account: d.seller_account,
            item_ref: d.item_ref,
            currency: d.currency.as_pg().to_string(),
            buy_now_price: d.buy_now_price,
            min_bid: d.min_bid,
            current_bid: d.current_bid,
            current_bid_id: d.current_bid_id,
            listing_status: d.listing_status.as_pg().to_string(),
            expires_at: d.expires_at.to_rfc3339(),
            created_at: d.created_at.to_rfc3339(),
            updated_at: d.updated_at.to_rfc3339(),
            settled_at: d.settled_at.map(|t| t.to_rfc3339()),
            bids: d.bids,
        })
        .into_response(),
        Err(e) => wallet_error_response(e),
    }
}

/// `GET /api/v1/market/me/listings` — caller's listings (seller scope).
#[utoipa::path(
    get,
    path = "/api/v1/market/me/listings",
    tag = "market",
    params(
        ("limit" = Option<i32>, Query, description = "Page size (1-100, default 25)"),
        ("before_created_at" = Option<String>, Query, description = "Keyset cursor: previous page's last created_at (RFC3339)"),
        ("before_id" = Option<i64>, Query, description = "Keyset cursor: previous page's last listing_id"),
    ),
    responses(
        (status = 200, description = "Caller's listings", body = [MarketMyListingDto]),
        (status = 401, description = "Missing / invalid bearer token"),
        (status = 503, description = "Wallet service unavailable"),
    ),
    security(("bearerAuth" = [])),
)]
pub(crate) async fn me_listings(headers: HeaderMap, Query(q): Query<ListingsQuery>) -> Response {
    let user_id = match resolve_user(&headers).await {
        Ok(id) => id,
        Err(resp) => return resp,
    };
    let client = match get_wallet_client() {
        Some(c) => c,
        None => return service_unavailable(),
    };
    match client
        .market_my_listings(
            user_id,
            clamp_limit(q.limit),
            q.before_created_at,
            q.before_id,
        )
        .await
    {
        Ok(rows) => Json(
            rows.into_iter()
                .map(|r| MarketMyListingDto {
                    listing_id: r.listing_id,
                    item_ref: r.item_ref,
                    currency: r.currency.as_pg().to_string(),
                    buy_now_price: r.buy_now_price,
                    min_bid: r.min_bid,
                    current_bid: r.current_bid,
                    current_bid_account: r.current_bid_account,
                    buyer_account: r.buyer_account,
                    listing_status: r.listing_status.as_pg().to_string(),
                    expires_at: r.expires_at.to_rfc3339(),
                    created_at: r.created_at.to_rfc3339(),
                    settled_at: r.settled_at.map(|t| t.to_rfc3339()),
                })
                .collect::<Vec<_>>(),
        )
        .into_response(),
        Err(e) => wallet_error_response(e),
    }
}

/// `GET /api/v1/market/me/bids` — caller's bids across listings.
#[utoipa::path(
    get,
    path = "/api/v1/market/me/bids",
    tag = "market",
    params(
        ("limit" = Option<i32>, Query, description = "Page size (1-100, default 25)"),
        ("before_placed_at" = Option<String>, Query, description = "Keyset cursor: previous page's last placed_at (RFC3339)"),
        ("before_id" = Option<i64>, Query, description = "Keyset cursor: previous page's last bid_id"),
    ),
    responses(
        (status = 200, description = "Caller's bids", body = [MarketMyBidDto]),
        (status = 401, description = "Missing / invalid bearer token"),
        (status = 503, description = "Wallet service unavailable"),
    ),
    security(("bearerAuth" = [])),
)]
pub(crate) async fn me_bids(headers: HeaderMap, Query(q): Query<BidsQuery>) -> Response {
    let user_id = match resolve_user(&headers).await {
        Ok(id) => id,
        Err(resp) => return resp,
    };
    let client = match get_wallet_client() {
        Some(c) => c,
        None => return service_unavailable(),
    };
    match client
        .market_my_bids(
            user_id,
            clamp_limit(q.limit),
            q.before_placed_at,
            q.before_id,
        )
        .await
    {
        Ok(rows) => Json(
            rows.into_iter()
                .map(|r| MarketMyBidDto {
                    bid_id: r.bid_id,
                    listing_id: r.listing_id,
                    amount: r.amount,
                    bid_status: r.bid_status.as_pg().to_string(),
                    placed_at: r.placed_at.to_rfc3339(),
                    settled_at: r.settled_at.map(|t| t.to_rfc3339()),
                    escrow_ledger_id: r.escrow_ledger_id,
                    refund_ledger_id: r.refund_ledger_id,
                })
                .collect::<Vec<_>>(),
        )
        .into_response(),
        Err(e) => wallet_error_response(e),
    }
}

fn reject_non_positive(field: &str) -> Response {
    (
        axum::http::StatusCode::BAD_REQUEST,
        Json(serde_json::json!({
            "error": "invalid_argument",
            "message": format!("{field} must be a positive integer"),
        })),
    )
        .into_response()
}

/// `POST /api/v1/market/listings` — create a listing. Returns the new
/// listing_id. Idempotent on `idempotency_key` — replays return the same id.
#[utoipa::path(
    post,
    path = "/api/v1/market/listings",
    tag = "market",
    request_body = CreateListingBody,
    responses(
        (status = 200, description = "Listing created", body = MarketIdDto),
        (status = 400, description = "Invalid payload (price/expiry/ref)"),
        (status = 401, description = "Missing / invalid bearer token"),
        (status = 409, description = "Idempotency replay mismatch"),
        (status = 503, description = "Wallet service unavailable"),
    ),
    security(("bearerAuth" = [])),
)]
pub(crate) async fn create_listing(
    headers: HeaderMap,
    Json(body): Json<CreateListingBody>,
) -> Response {
    let user_id = match resolve_user(&headers).await {
        Ok(id) => id,
        Err(resp) => return resp,
    };
    if let Some(q) = body.qty {
        if q <= 0 {
            return reject_non_positive("qty");
        }
    }
    // Prices are optional but must be positive when present; the SQL guards
    // this too, but a negative price must never reach escrow arithmetic.
    for (field, val) in [
        ("buy_now_price", body.buy_now_price),
        ("min_bid", body.min_bid),
    ] {
        if matches!(val, Some(v) if v <= 0) {
            return reject_non_positive(field);
        }
    }
    let client = match get_wallet_client() {
        Some(c) => c,
        None => return service_unavailable(),
    };
    let req = MarketCreateListingRequest {
        src_item_id: body.src_item_id,
        qty: body.qty,
        buy_now_price: body.buy_now_price,
        min_bid: body.min_bid,
        expires_at: body.expires_at,
        idempotency_key: body.idempotency_key,
    };
    match client.market_create_listing(user_id, req).await {
        Ok(id) => Json(MarketIdDto { id }).into_response(),
        Err(e) => wallet_error_response(e),
    }
}

/// `POST /api/v1/market/listings/:id/bid` — place a bid. Returns the new
/// bid_id. Bid funds are debited and held in escrow.
#[utoipa::path(
    post,
    path = "/api/v1/market/listings/{listing_id}/bid",
    tag = "market",
    params(
        ("listing_id" = i64, Path, description = "Listing id")
    ),
    request_body = PlaceBidBody,
    responses(
        (status = 200, description = "Bid placed", body = MarketIdDto),
        (status = 400, description = "Invalid bid (amount below min_bid / current_bid)"),
        (status = 401, description = "Missing / invalid bearer token"),
        (status = 402, description = "Insufficient funds for escrow"),
        (status = 403, description = "Cannot bid on own listing / listing not active"),
        (status = 404, description = "Listing not found"),
        (status = 409, description = "Idempotency replay mismatch"),
        (status = 503, description = "Wallet service unavailable"),
    ),
    security(("bearerAuth" = [])),
)]
pub(crate) async fn place_bid(
    headers: HeaderMap,
    Path(listing_id): Path<i64>,
    Json(body): Json<PlaceBidBody>,
) -> Response {
    let user_id = match resolve_user(&headers).await {
        Ok(id) => id,
        Err(resp) => return resp,
    };
    if body.amount <= 0 {
        return reject_non_positive("amount");
    }
    let client = match get_wallet_client() {
        Some(c) => c,
        None => return service_unavailable(),
    };
    let req = MarketPlaceBidRequest {
        listing_id,
        amount: body.amount,
        idempotency_key: body.idempotency_key,
    };
    match client.market_place_bid(user_id, req).await {
        Ok(id) => Json(MarketIdDto { id }).into_response(),
        Err(e) => wallet_error_response(e),
    }
}

/// `POST /api/v1/market/listings/:id/buy-now` — buy a listing at its
/// `buy_now_price`. Returns the buyer ledger_id.
#[utoipa::path(
    post,
    path = "/api/v1/market/listings/{listing_id}/buy-now",
    tag = "market",
    params(
        ("listing_id" = i64, Path, description = "Listing id")
    ),
    request_body = BuyNowBody,
    responses(
        (status = 200, description = "Listing purchased", body = MarketIdDto),
        (status = 400, description = "Listing has no buy_now_price"),
        (status = 401, description = "Missing / invalid bearer token"),
        (status = 402, description = "Insufficient funds"),
        (status = 403, description = "Cannot buy own listing / listing not active"),
        (status = 404, description = "Listing not found"),
        (status = 409, description = "Idempotency replay mismatch"),
        (status = 503, description = "Wallet service unavailable"),
    ),
    security(("bearerAuth" = [])),
)]
pub(crate) async fn buy_now(
    headers: HeaderMap,
    Path(listing_id): Path<i64>,
    Json(body): Json<BuyNowBody>,
) -> Response {
    let user_id = match resolve_user(&headers).await {
        Ok(id) => id,
        Err(resp) => return resp,
    };
    let client = match get_wallet_client() {
        Some(c) => c,
        None => return service_unavailable(),
    };
    let req = MarketBuyNowRequest {
        listing_id,
        idempotency_key: body.idempotency_key,
    };
    match client.market_buy_now(user_id, req).await {
        Ok(id) => Json(MarketIdDto { id }).into_response(),
        Err(e) => wallet_error_response(e),
    }
}

/// `POST /api/v1/market/listings/:id/cancel` — cancel an active listing.
/// Seller-only. Refunds the current high bidder's escrow.
#[utoipa::path(
    post,
    path = "/api/v1/market/listings/{listing_id}/cancel",
    tag = "market",
    params(
        ("listing_id" = i64, Path, description = "Listing id")
    ),
    request_body = CancelListingBody,
    responses(
        (status = 204, description = "Listing cancelled"),
        (status = 401, description = "Missing / invalid bearer token"),
        (status = 403, description = "Not the seller / listing not active"),
        (status = 404, description = "Listing not found"),
        (status = 503, description = "Wallet service unavailable"),
    ),
    security(("bearerAuth" = [])),
)]
pub(crate) async fn cancel_listing(
    headers: HeaderMap,
    Path(listing_id): Path<i64>,
    Json(body): Json<CancelListingBody>,
) -> Response {
    let user_id = match resolve_user(&headers).await {
        Ok(id) => id,
        Err(resp) => return resp,
    };
    let client = match get_wallet_client() {
        Some(c) => c,
        None => return service_unavailable(),
    };
    let req = MarketCancelListingRequest {
        listing_id,
        reason: body.reason,
    };
    match client.market_cancel_listing(user_id, req).await {
        Ok(()) => axum::http::StatusCode::NO_CONTENT.into_response(),
        Err(e) => wallet_error_response(e),
    }
}
