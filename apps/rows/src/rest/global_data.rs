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
        .layer(middleware::from_fn(require_customer_guid))
        .with_state(hs)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SetGlobalDataDto {
    global_data_key: String,
    global_data_value: String,
}

async fn set_global_data(
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

async fn get_global_data(
    State(hs): State<HandlerState>,
    headers: HeaderMap,
    Path(key): Path<String>,
) -> ApiResult<Option<crate::models::GlobalData>> {
    let customer_guid = extract_customer_guid(&headers);
    let data = hs.svc.get_global_data(customer_guid, &key).await?;
    Ok(Json(data))
}
