//! Store HTTP surface.
//!
//! `GET /api/v1/store/products` is anon-callable (catalog). The authenticated
//! routes resolve the caller via `resolve_user` and delegate to
//! `WalletClient::store_*`, which sets `request.jwt.claims` inside the txn so
//! `auth.uid()` resolves SQL-side. A purchase debits credits authoritatively
//! and mints an inventory.item; the ownership check makes re-buys idempotent.

use axum::{
    Json,
    extract::Path,
    http::HeaderMap,
    response::{IntoResponse, Response},
};
use kbve::wallet::StoreBuyRequest;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use super::wallet::{resolve_user, service_unavailable, wallet_error_response};
use crate::db::get_wallet_client;

#[derive(Serialize, ToSchema)]
pub(crate) struct StoreProductDto {
    pub product_id: Uuid,
    pub slug: String,
    pub title: String,
    pub description: Option<String>,
    pub price: i64,
    pub currency: String,
    pub asset_ref: serde_json::Value,
    pub created_at: String,
}

#[derive(Serialize, ToSchema)]
pub(crate) struct StoreEntitlementDto {
    pub item_id: Uuid,
    pub slug: String,
    pub product_id: Uuid,
    pub title: Option<String>,
    pub granted_at: String,
}

#[derive(Deserialize, ToSchema)]
pub(crate) struct StoreBuyBody {
    /// Caller-supplied. Replays return the original inventory item id.
    pub idempotency_key: Uuid,
}

#[derive(Serialize, ToSchema)]
pub(crate) struct StoreItemDto {
    /// The minted (or already-owned) inventory.item id.
    pub item_id: Uuid,
}

/// `GET /api/v1/store/products` — active catalog, public/anon.
#[utoipa::path(
    get,
    path = "/api/v1/store/products",
    tag = "store",
    responses(
        (status = 200, description = "Active store products", body = [StoreProductDto]),
        (status = 503, description = "Wallet service unavailable"),
    ),
)]
pub(crate) async fn list_products() -> Response {
    let client = match get_wallet_client() {
        Some(c) => c,
        None => return service_unavailable(),
    };
    match client.store_catalog().await {
        Ok(rows) => Json(
            rows.into_iter()
                .map(|r| StoreProductDto {
                    product_id: r.product_id,
                    slug: r.slug,
                    title: r.title,
                    description: r.description,
                    price: r.price,
                    currency: r.currency.as_pg().to_string(),
                    asset_ref: r.asset_ref,
                    created_at: r.created_at.to_rfc3339(),
                })
                .collect::<Vec<_>>(),
        )
        .into_response(),
        Err(e) => wallet_error_response(e),
    }
}

/// `GET /api/v1/store/me/entitlements` — caller's owned products.
#[utoipa::path(
    get,
    path = "/api/v1/store/me/entitlements",
    tag = "store",
    responses(
        (status = 200, description = "Caller's owned products", body = [StoreEntitlementDto]),
        (status = 401, description = "Missing / invalid bearer token"),
        (status = 503, description = "Wallet service unavailable"),
    ),
    security(("bearerAuth" = [])),
)]
pub(crate) async fn my_entitlements(headers: HeaderMap) -> Response {
    let user_id = match resolve_user(&headers).await {
        Ok(id) => id,
        Err(resp) => return resp,
    };
    let client = match get_wallet_client() {
        Some(c) => c,
        None => return service_unavailable(),
    };
    match client.store_my_entitlements(user_id).await {
        Ok(rows) => Json(
            rows.into_iter()
                .map(|r| StoreEntitlementDto {
                    item_id: r.item_id,
                    slug: r.slug,
                    product_id: r.product_id,
                    title: r.title,
                    granted_at: r.granted_at.to_rfc3339(),
                })
                .collect::<Vec<_>>(),
        )
        .into_response(),
        Err(e) => wallet_error_response(e),
    }
}

/// `POST /api/v1/store/products/:slug/buy` — spend credits, mint the item.
#[utoipa::path(
    post,
    path = "/api/v1/store/products/{slug}/buy",
    tag = "store",
    params(
        ("slug" = String, Path, description = "Product slug")
    ),
    request_body = StoreBuyBody,
    responses(
        (status = 200, description = "Purchased / already owned", body = StoreItemDto),
        (status = 401, description = "Missing / invalid bearer token"),
        (status = 402, description = "Insufficient credits"),
        (status = 404, description = "Product or wallet account not found"),
        (status = 409, description = "Idempotency key reused with a different payload"),
        (status = 503, description = "Wallet service unavailable"),
    ),
    security(("bearerAuth" = [])),
)]
pub(crate) async fn buy(
    headers: HeaderMap,
    Path(slug): Path<String>,
    Json(body): Json<StoreBuyBody>,
) -> Response {
    let user_id = match resolve_user(&headers).await {
        Ok(id) => id,
        Err(resp) => return resp,
    };
    let client = match get_wallet_client() {
        Some(c) => c,
        None => return service_unavailable(),
    };
    let req = StoreBuyRequest {
        slug,
        idempotency_key: body.idempotency_key,
    };
    match client.store_buy(user_id, req).await {
        Ok(item_id) => Json(StoreItemDto { item_id }).into_response(),
        Err(e) => wallet_error_response(e),
    }
}
