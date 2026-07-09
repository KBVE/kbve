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
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use kbve::wallet::{StoreBuyRequest, StoreUpsertProduct, StoreUpsertVariant};
use serde::{Deserialize, Serialize};
use serde_json::json;
use utoipa::ToSchema;
use uuid::Uuid;

use super::https::auth_user_id;
use super::wallet::{resolve_user, service_unavailable, wallet_error_response};
use crate::db::{get_forum_service, get_wallet_client};

/// Gate a staff-only route. Mirrors transport/mc_lot.rs::require_staff.
async fn require_staff(headers: &HeaderMap) -> Result<String, Response> {
    let user_id = auth_user_id(headers).await?;
    let svc = get_forum_service().ok_or_else(|| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({"error": "staff check service unavailable"})),
        )
            .into_response()
    })?;
    match svc.is_staff(&user_id).await {
        Ok(true) => Ok(user_id),
        Ok(false) => Err((
            StatusCode::FORBIDDEN,
            Json(json!({"error": "staff permissions required"})),
        )
            .into_response()),
        Err(e) => {
            tracing::error!("forum.is_staff lookup failed: {}", e);
            Err((
                StatusCode::BAD_GATEWAY,
                Json(json!({"error": "staff check upstream error"})),
            )
                .into_response())
        }
    }
}

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

#[derive(Serialize, ToSchema)]
pub(crate) struct StoreVariantDto {
    pub variant_id: Uuid,
    pub sku: String,
    pub attributes: serde_json::Value,
    pub price: i64,
    pub stock: Option<i64>,
}

#[derive(Serialize, ToSchema)]
pub(crate) struct StoreProductDetailDto {
    pub product: StoreProductDto,
    pub variants: Vec<StoreVariantDto>,
}

#[derive(Serialize, ToSchema)]
pub(crate) struct StoreIdDto {
    /// product_id (product upsert) / variant_id (variant upsert).
    pub id: Uuid,
}

#[derive(Deserialize, ToSchema)]
pub(crate) struct StaffUpsertProductBody {
    pub slug: String,
    pub title: String,
    pub description: Option<String>,
    pub price: i64,
    #[serde(default = "default_fulfillment")]
    pub fulfillment: String,
    #[serde(default)]
    pub asset_ref: serde_json::Value,
    #[serde(default = "default_status")]
    pub status: String,
}

fn default_fulfillment() -> String {
    "digital".to_string()
}
fn default_status() -> String {
    "active".to_string()
}

#[derive(Deserialize, ToSchema)]
pub(crate) struct StaffStatusBody {
    pub status: String,
}

#[derive(Deserialize, ToSchema)]
pub(crate) struct StaffUpsertVariantBody {
    pub sku: String,
    #[serde(default)]
    pub attributes: serde_json::Value,
    pub price: i64,
    pub stock: Option<i64>,
    #[serde(default = "default_status")]
    pub status: String,
}

fn map_product_dto(p: kbve::wallet::StoreProductRow) -> StoreProductDto {
    StoreProductDto {
        product_id: p.product_id,
        slug: p.slug,
        title: p.title,
        description: p.description,
        price: p.price,
        currency: p.currency.as_pg().to_string(),
        asset_ref: p.asset_ref,
        created_at: p.created_at.to_rfc3339(),
    }
}

/// `GET /api/v1/store/products/:slug` — product detail + active variants.
#[utoipa::path(
    get,
    path = "/api/v1/store/products/{slug}",
    tag = "store",
    params(("slug" = String, Path, description = "Product slug")),
    responses(
        (status = 200, description = "Product detail", body = StoreProductDetailDto),
        (status = 404, description = "Product not found"),
        (status = 503, description = "Wallet service unavailable"),
    ),
)]
pub(crate) async fn product_detail(Path(slug): Path<String>) -> Response {
    let client = match get_wallet_client() {
        Some(c) => c,
        None => return service_unavailable(),
    };
    match client.store_product_detail(slug).await {
        Ok(Some(d)) => Json(StoreProductDetailDto {
            product: map_product_dto(d.product),
            variants: d
                .variants
                .into_iter()
                .map(|v| StoreVariantDto {
                    variant_id: v.variant_id,
                    sku: v.sku,
                    attributes: v.attributes,
                    price: v.price,
                    stock: v.stock,
                })
                .collect(),
        })
        .into_response(),
        Ok(None) => (StatusCode::NOT_FOUND, Json(json!({"error": "not_found"}))).into_response(),
        Err(e) => wallet_error_response(e),
    }
}

/// `POST /api/v1/store/staff/products` — create/update a product (staff).
#[utoipa::path(
    post,
    path = "/api/v1/store/staff/products",
    tag = "store",
    request_body = StaffUpsertProductBody,
    responses(
        (status = 200, description = "Upserted product id", body = StoreIdDto),
        (status = 401, description = "Missing / invalid bearer token"),
        (status = 403, description = "Staff permissions required"),
        (status = 503, description = "Wallet service unavailable"),
    ),
    security(("bearerAuth" = [])),
)]
pub(crate) async fn staff_upsert_product(
    headers: HeaderMap,
    Json(body): Json<StaffUpsertProductBody>,
) -> Response {
    if let Err(resp) = require_staff(&headers).await {
        return resp;
    }
    let client = match get_wallet_client() {
        Some(c) => c,
        None => return service_unavailable(),
    };
    let asset_ref = if body.asset_ref.is_null() {
        serde_json::json!({})
    } else {
        body.asset_ref
    };
    let req = StoreUpsertProduct {
        slug: body.slug,
        title: body.title,
        description: body.description,
        price: body.price,
        fulfillment: body.fulfillment,
        asset_ref,
        status: body.status,
    };
    match client.store_upsert_product(req).await {
        Ok(id) => Json(StoreIdDto { id }).into_response(),
        Err(e) => wallet_error_response(e),
    }
}

/// `POST /api/v1/store/staff/products/:product_id/status` — set status (staff).
#[utoipa::path(
    post,
    path = "/api/v1/store/staff/products/{product_id}/status",
    tag = "store",
    params(("product_id" = String, Path, description = "Product id")),
    request_body = StaffStatusBody,
    responses(
        (status = 204, description = "Status updated"),
        (status = 403, description = "Staff permissions required"),
        (status = 404, description = "Product not found"),
        (status = 503, description = "Wallet service unavailable"),
    ),
    security(("bearerAuth" = [])),
)]
pub(crate) async fn staff_set_product_status(
    headers: HeaderMap,
    Path(product_id): Path<Uuid>,
    Json(body): Json<StaffStatusBody>,
) -> Response {
    if let Err(resp) = require_staff(&headers).await {
        return resp;
    }
    let client = match get_wallet_client() {
        Some(c) => c,
        None => return service_unavailable(),
    };
    match client.store_set_product_status(product_id, body.status).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => wallet_error_response(e),
    }
}

/// `POST /api/v1/store/staff/products/:product_id/variants` — upsert variant.
#[utoipa::path(
    post,
    path = "/api/v1/store/staff/products/{product_id}/variants",
    tag = "store",
    params(("product_id" = String, Path, description = "Product id")),
    request_body = StaffUpsertVariantBody,
    responses(
        (status = 200, description = "Upserted variant id", body = StoreIdDto),
        (status = 403, description = "Staff permissions required"),
        (status = 404, description = "Product not found"),
        (status = 503, description = "Wallet service unavailable"),
    ),
    security(("bearerAuth" = [])),
)]
pub(crate) async fn staff_upsert_variant(
    headers: HeaderMap,
    Path(product_id): Path<Uuid>,
    Json(body): Json<StaffUpsertVariantBody>,
) -> Response {
    if let Err(resp) = require_staff(&headers).await {
        return resp;
    }
    let client = match get_wallet_client() {
        Some(c) => c,
        None => return service_unavailable(),
    };
    let attributes = if body.attributes.is_null() {
        serde_json::json!({})
    } else {
        body.attributes
    };
    let req = StoreUpsertVariant {
        product_id,
        sku: body.sku,
        attributes,
        price: body.price,
        stock: body.stock,
        status: body.status,
    };
    match client.store_upsert_variant(req).await {
        Ok(id) => Json(StoreIdDto { id }).into_response(),
        Err(e) => wallet_error_response(e),
    }
}

/// `POST /api/v1/store/staff/variants/:variant_id/status` — set status (staff).
#[utoipa::path(
    post,
    path = "/api/v1/store/staff/variants/{variant_id}/status",
    tag = "store",
    params(("variant_id" = String, Path, description = "Variant id")),
    request_body = StaffStatusBody,
    responses(
        (status = 204, description = "Status updated"),
        (status = 403, description = "Staff permissions required"),
        (status = 404, description = "Variant not found"),
        (status = 503, description = "Wallet service unavailable"),
    ),
    security(("bearerAuth" = [])),
)]
pub(crate) async fn staff_set_variant_status(
    headers: HeaderMap,
    Path(variant_id): Path<Uuid>,
    Json(body): Json<StaffStatusBody>,
) -> Response {
    if let Err(resp) = require_staff(&headers).await {
        return resp;
    }
    let client = match get_wallet_client() {
        Some(c) => c,
        None => return service_unavailable(),
    };
    match client.store_set_variant_status(variant_id, body.status).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => wallet_error_response(e),
    }
}
