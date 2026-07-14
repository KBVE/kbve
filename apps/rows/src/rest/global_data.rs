//! Global key/value store routes (`/api/GlobalData/*`). Tenant-gated by `require_customer_guid`.

use super::HandlerState;
use crate::error::{ApiResult, SuccessResponse};
use crate::middleware::{extract_customer_guid, require_customer_guid};
use axum::{
    Json, Router,
    extract::{Path, State},
    http::HeaderMap,
    middleware,
    routing::{get, post},
};
use serde::Deserialize;
use utoipa::ToSchema;

pub(super) fn global_data_routes(hs: HandlerState) -> Router {
    Router::new()
        .route(
            "/api/GlobalData/AddOrUpdateGlobalDataItem",
            post(set_global_data),
        )
        .route(
            "/api/GlobalData/GetGlobalDataItem/{globalDataKey}",
            get(get_global_data),
        )
        .layer(middleware::from_fn_with_state(
            hs.clone(),
            require_customer_guid,
        ))
        .with_state(hs)
}

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SetGlobalDataDto {
    global_data_key: String,
    global_data_value: String,
}

/// Upserts a global key/value item for the tenant.
#[utoipa::path(post, path = "/api/GlobalData/AddOrUpdateGlobalDataItem", tag = "global",
    request_body = inline(SetGlobalDataDto),
    responses((status = 200, description = "Upsert result", body = SuccessResponse))
)]
pub(crate) async fn set_global_data(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
    Json(body): Json<SetGlobalDataDto>,
) -> Json<SuccessResponse> {
    let customer_guid = extract_customer_guid(&headers);
    match hs
        .svc
        .set_global_data(
            customer_guid,
            &body.global_data_key,
            &body.global_data_value,
        )
        .await
    {
        Ok(()) => Json(SuccessResponse::ok()),
        Err(e) => Json(SuccessResponse::err(e.to_string())),
    }
}

/// Fetches a global item by key, or `null` if it doesn't exist.
#[utoipa::path(get, path = "/api/GlobalData/GetGlobalDataItem/{globalDataKey}", tag = "global",
    params(("globalDataKey" = String, Path, description = "Global data key")),
    responses((status = 200, description = "Global item (nullable)", body = crate::models::GlobalData))
)]
pub(crate) async fn get_global_data(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
    Path(key): Path<String>,
) -> ApiResult<Option<crate::models::GlobalData>> {
    let customer_guid = extract_customer_guid(&headers);
    let data = hs.svc.get_global_data(customer_guid, &key).await?;
    Ok(Json(data))
}
