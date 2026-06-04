//! MC lot/schematic HTTP surface.
//!
//! Three auth tiers:
//!   * `/api/v1/mc/lots/*`           — authenticated user JWT; the caller
//!                                     acts on their own lots.
//!   * `/api/v1/mc/lots/staff/*`     — authenticated user JWT + `forum.is_staff`
//!                                     check; admin/ops surface.
//!   * `/api/v1/mc/lots/service/*`   — `service_role` JWT; MC worker mod +
//!                                     internal queue janitors.

use axum::{
    Json,
    extract::{Path, Query},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use kbve::lot::{FailedBuildCursor, LotChunkCursor, LotError, LotState};
use serde::{Deserialize, Serialize};
use serde_json::json;
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

use super::https::auth_user_id;
use super::wallet::{require_service_role, resolve_user};
use crate::db::{get_forum_service, get_lot_client};

#[derive(Serialize, ToSchema)]
pub(crate) struct SchematicDto {
    pub schematic_id: String,
    pub name: String,
    pub category: String,
    pub tier: i16,
    pub dims_x: i16,
    pub dims_y: i16,
    pub dims_z: i16,
    pub price_credits: i64,
    pub price_khash: i64,
}

#[derive(Serialize, ToSchema)]
pub(crate) struct VacantLotDto {
    pub lot_id: String,
    pub chunk_x_min: i32,
    pub chunk_x_max: i32,
    pub chunk_z_min: i32,
    pub chunk_z_max: i32,
    pub block_x_min: i32,
    pub block_x_max: i32,
    pub block_z_min: i32,
    pub block_z_max: i32,
    pub chunk_area: i32,
    pub anchor_y: i16,
    pub price_credits: i64,
    pub price_khash: i64,
}

#[derive(Serialize, ToSchema)]
pub(crate) struct OwnedLotDto {
    pub lot_id: String,
    pub chunk_x_min: i32,
    pub chunk_x_max: i32,
    pub chunk_z_min: i32,
    pub chunk_z_max: i32,
    pub block_x_min: i32,
    pub block_x_max: i32,
    pub block_z_min: i32,
    pub block_z_max: i32,
    pub chunk_area: i32,
    pub anchor_y: i16,
    pub state: i16,
    pub current_schematic_id: Option<String>,
    pub price_credits: i64,
    pub price_khash: i64,
}

#[derive(Serialize, ToSchema)]
pub(crate) struct ViewportLotDto {
    pub lot_id: String,
    pub chunk_x_min: i32,
    pub chunk_x_max: i32,
    pub chunk_z_min: i32,
    pub chunk_z_max: i32,
    pub block_x_min: i32,
    pub block_x_max: i32,
    pub block_z_min: i32,
    pub block_z_max: i32,
    pub anchor_y: i16,
    pub is_owned: bool,
    pub is_owned_by_me: bool,
    pub state: i16,
    pub current_schematic_id: Option<String>,
}

#[derive(Serialize, ToSchema)]
pub(crate) struct ServiceLotDto {
    pub lot_id: String,
    pub world: String,
    pub chunk_x_min: i32,
    pub chunk_x_max: i32,
    pub chunk_z_min: i32,
    pub chunk_z_max: i32,
    pub block_x_min: i32,
    pub block_x_max: i32,
    pub block_z_min: i32,
    pub block_z_max: i32,
    pub chunk_area: i32,
    pub anchor_y: i16,
    pub owner_user_id: Option<Uuid>,
    pub current_schematic_id: Option<String>,
    pub state: i16,
    pub price_credits: i64,
    pub price_khash: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize, ToSchema)]
pub(crate) struct ClaimedBuildDto {
    pub build_id: String,
    pub lot_id: String,
    pub actor_user_id: Uuid,
    pub action_kind: i16,
    pub schematic_id: Option<String>,
    pub queued_at: String,
    pub world: String,
    pub chunk_x_min: i32,
    pub chunk_x_max: i32,
    pub chunk_z_min: i32,
    pub chunk_z_max: i32,
    pub block_x_min: i32,
    pub block_x_max: i32,
    pub block_z_min: i32,
    pub block_z_max: i32,
    pub anchor_y: i16,
    pub resource_path: Option<String>,
    pub dims_x: Option<i16>,
    pub dims_y: Option<i16>,
    pub dims_z: Option<i16>,
}

#[derive(Serialize, ToSchema)]
pub(crate) struct FailedBuildDto {
    pub build_id: String,
    pub lot_id: String,
    pub actor_user_id: Uuid,
    pub action_kind: i16,
    pub schematic_id: Option<String>,
    pub apply_error: Option<String>,
    pub failed_at: String,
    pub attempt_count: i32,
}

#[derive(Serialize, ToSchema)]
pub(crate) struct ReleasedLotDto {
    pub lot_id: String,
    pub prior_state: i16,
}

#[derive(Serialize, ToSchema)]
pub(crate) struct RepairedLotDto {
    pub lot_id: String,
    pub prior_state: i16,
    pub new_state: i16,
    pub latest_build_id: Option<String>,
    pub latest_apply_state: Option<i16>,
    pub latest_failed_at: Option<String>,
    pub latest_apply_error: Option<String>,
}

#[derive(Serialize, ToSchema)]
pub(crate) struct RequeueSummaryDto {
    pub requeued_count: i32,
    pub exhausted_count: i32,
}

#[derive(Serialize, ToSchema)]
pub(crate) struct PurchaseLotDto {
    pub purchase_id: String,
}

#[derive(Serialize, ToSchema)]
pub(crate) struct BuildIdDto {
    pub build_id: String,
}

#[derive(Serialize, ToSchema)]
pub(crate) struct OkDto {
    pub ok: bool,
}

fn default_world() -> String {
    "minecraft:overworld".to_string()
}

fn default_lot_list_limit() -> i32 {
    256
}

#[derive(Deserialize, ToSchema, IntoParams)]
pub(crate) struct ListSchematicsQuery {
    pub category: Option<String>,
}

#[derive(Deserialize, ToSchema, IntoParams)]
pub(crate) struct ListLotsQuery {
    #[serde(default = "default_world")]
    pub world: String,
    #[serde(default = "default_lot_list_limit")]
    pub limit: i32,
    pub after_chunk_x: Option<i32>,
    pub after_chunk_z: Option<i32>,
    pub after_lot_id: Option<String>,
}

impl ListLotsQuery {
    fn cursor(&self) -> LotChunkCursor {
        LotChunkCursor {
            after_chunk_x: self.after_chunk_x,
            after_chunk_z: self.after_chunk_z,
            after_lot_id: self.after_lot_id.clone(),
        }
    }
}

#[derive(Deserialize, ToSchema, IntoParams)]
pub(crate) struct ViewportQuery {
    #[serde(default = "default_world")]
    pub world: String,
    pub min_chunk_x: i32,
    pub max_chunk_x: i32,
    pub min_chunk_z: i32,
    pub max_chunk_z: i32,
    pub state: Option<i16>,
    #[serde(default = "default_viewport_limit")]
    pub limit: i32,
}

fn default_viewport_limit() -> i32 {
    1000
}

#[derive(Deserialize, ToSchema)]
pub(crate) struct PurchaseLotBody {
    pub lot_id: String,
    pub idempotency_key: Uuid,
}

#[derive(Deserialize, ToSchema)]
pub(crate) struct QueueBuildBody {
    pub lot_id: String,
    pub schematic_id: String,
    pub idempotency_key: Uuid,
}

#[derive(Deserialize, ToSchema)]
pub(crate) struct QueueDemolishBody {
    pub lot_id: String,
    pub idempotency_key: Uuid,
}

#[derive(Deserialize, ToSchema)]
pub(crate) struct ServiceClaimBody {
    pub worker_id: String,
    #[serde(default = "default_claim_limit")]
    pub limit: i32,
}

fn default_claim_limit() -> i32 {
    32
}

#[derive(Deserialize, ToSchema)]
pub(crate) struct ServiceMarkAppliedBody {
    pub build_id: String,
    pub worker_id: String,
}

#[derive(Deserialize, ToSchema)]
pub(crate) struct ServiceMarkFailedBody {
    pub build_id: String,
    pub worker_id: String,
    pub error: String,
}

#[derive(Deserialize, ToSchema, IntoParams)]
pub(crate) struct ServiceRequeueStaleQuery {
    #[serde(default = "default_stale_seconds")]
    pub older_than_seconds: i32,
    #[serde(default = "default_requeue_limit")]
    pub limit: i32,
}

fn default_stale_seconds() -> i32 {
    300
}
fn default_requeue_limit() -> i32 {
    128
}

#[derive(Deserialize, ToSchema)]
pub(crate) struct StaffRetryBody {
    pub build_id: String,
    #[serde(default)]
    pub reset_attempts: bool,
}

#[derive(Deserialize, ToSchema)]
pub(crate) struct StaffReleaseUserBody {
    pub user_id: Uuid,
    #[serde(default)]
    pub force: bool,
}

#[derive(Deserialize, ToSchema, IntoParams)]
pub(crate) struct StaffRepairQuery {
    #[serde(default = "default_dry_run")]
    pub dry_run: bool,
}

fn default_dry_run() -> bool {
    true
}

#[derive(Deserialize, ToSchema, IntoParams)]
pub(crate) struct StaffListFailedQuery {
    #[serde(default = "default_failed_limit")]
    pub limit: i32,
    pub after_failed_at: Option<String>,
    pub after_build_id: Option<String>,
}

fn default_failed_limit() -> i32 {
    100
}

fn lot_service_unavailable() -> Response {
    (
        StatusCode::SERVICE_UNAVAILABLE,
        Json(json!({"error": "Lot service unavailable"})),
    )
        .into_response()
}

fn lot_error_response(err: LotError) -> Response {
    let (status, code) = match &err {
        LotError::NotAuthenticated => (StatusCode::UNAUTHORIZED, "not_authenticated"),
        LotError::NotAuthorized => (StatusCode::FORBIDDEN, "not_authorized"),
        LotError::LotNotFound => (StatusCode::NOT_FOUND, "lot_not_found"),
        LotError::SchematicNotFound => (StatusCode::NOT_FOUND, "schematic_not_found"),
        LotError::BuildNotFound => (StatusCode::NOT_FOUND, "build_not_found"),
        LotError::LotNotVacant => (StatusCode::CONFLICT, "lot_not_vacant"),
        LotError::LotNotOwned => (StatusCode::FORBIDDEN, "lot_not_owned"),
        LotError::ActiveJobConflict => (StatusCode::CONFLICT, "active_job_conflict"),
        LotError::ChunkOverlap => (StatusCode::CONFLICT, "chunk_overlap"),
        LotError::ReplayMismatch => (StatusCode::CONFLICT, "replay_mismatch"),
        LotError::InsufficientFunds => (StatusCode::PAYMENT_REQUIRED, "insufficient_funds"),
        LotError::InvalidArgument(_) => (StatusCode::BAD_REQUEST, "invalid_argument"),
        LotError::NullArgument(_) => (StatusCode::UNPROCESSABLE_ENTITY, "null_argument"),
        LotError::Wallet(_) | LotError::Pool(_) | LotError::Db(_) => {
            tracing::error!(error = %err, "lot upstream failure");
            (StatusCode::INTERNAL_SERVER_ERROR, "internal")
        }
    };
    (
        status,
        Json(json!({"error": code, "message": err.to_string()})),
    )
        .into_response()
}

async fn require_staff(headers: &HeaderMap) -> Result<String, Response> {
    let user_id = auth_user_id(headers).await?;
    let svc = get_forum_service().ok_or_else(|| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({"error": "Staff check service unavailable"})),
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

/// `GET /api/v1/mc/lots/schematics` — public catalog.
#[utoipa::path(
    get,
    path = "/api/v1/mc/lots/schematics",
    tag = "mc-lot",
    params(("category" = Option<String>, Query, description = "Optional category filter")),
    responses(
        (status = 200, description = "Enabled schematics", body = [SchematicDto]),
        (status = 503, description = "Lot service unavailable"),
    ),
)]
pub(crate) async fn list_schematics(Query(q): Query<ListSchematicsQuery>) -> Response {
    let client = match get_lot_client() {
        Some(c) => c,
        None => return lot_service_unavailable(),
    };
    match client.list_schematics(q.category).await {
        Ok(rows) => Json(
            rows.into_iter()
                .map(|r| SchematicDto {
                    schematic_id: r.schematic_id,
                    name: r.name,
                    category: r.category,
                    tier: r.tier,
                    dims_x: r.dims_x,
                    dims_y: r.dims_y,
                    dims_z: r.dims_z,
                    price_credits: r.price_credits,
                    price_khash: r.price_khash,
                })
                .collect::<Vec<_>>(),
        )
        .into_response(),
        Err(e) => lot_error_response(e),
    }
}

/// `GET /api/v1/mc/lots/vacant` — paginated vacant lots in a world.
#[utoipa::path(
    get,
    path = "/api/v1/mc/lots/vacant",
    tag = "mc-lot",
    params(ListLotsQuery),
    responses(
        (status = 200, description = "Vacant lots", body = [VacantLotDto]),
        (status = 401, description = "Missing / invalid bearer token"),
        (status = 503, description = "Lot service unavailable"),
    ),
    security(("bearerAuth" = [])),
)]
pub(crate) async fn list_vacant(headers: HeaderMap, Query(q): Query<ListLotsQuery>) -> Response {
    let user_id = match resolve_user(&headers).await {
        Ok(id) => id,
        Err(resp) => return resp,
    };
    let client = match get_lot_client() {
        Some(c) => c,
        None => return lot_service_unavailable(),
    };
    match client
        .list_vacant_lots(user_id, q.world.clone(), q.limit, q.cursor())
        .await
    {
        Ok(rows) => Json(rows.into_iter().map(vacant_to_dto).collect::<Vec<_>>()).into_response(),
        Err(e) => lot_error_response(e),
    }
}

/// `GET /api/v1/mc/lots/me/active` — caller-owned lots in `state IN (1, 2)`.
#[utoipa::path(
    get,
    path = "/api/v1/mc/lots/me/active",
    tag = "mc-lot",
    params(ListLotsQuery),
    responses(
        (status = 200, description = "Owned lots (active)", body = [OwnedLotDto]),
        (status = 401, description = "Missing / invalid bearer token"),
        (status = 503, description = "Lot service unavailable"),
    ),
    security(("bearerAuth" = [])),
)]
pub(crate) async fn list_my_active(headers: HeaderMap, Query(q): Query<ListLotsQuery>) -> Response {
    let user_id = match resolve_user(&headers).await {
        Ok(id) => id,
        Err(resp) => return resp,
    };
    let client = match get_lot_client() {
        Some(c) => c,
        None => return lot_service_unavailable(),
    };
    match client
        .list_my_active_lots(user_id, q.world.clone(), q.limit, q.cursor())
        .await
    {
        Ok(rows) => Json(rows.into_iter().map(owned_to_dto).collect::<Vec<_>>()).into_response(),
        Err(e) => lot_error_response(e),
    }
}

/// `GET /api/v1/mc/lots/me/transitional` — caller-owned lots in `state IN (3, 4)`.
#[utoipa::path(
    get,
    path = "/api/v1/mc/lots/me/transitional",
    tag = "mc-lot",
    params(ListLotsQuery),
    responses(
        (status = 200, description = "Owned lots (transitional)", body = [OwnedLotDto]),
        (status = 401, description = "Missing / invalid bearer token"),
        (status = 503, description = "Lot service unavailable"),
    ),
    security(("bearerAuth" = [])),
)]
pub(crate) async fn list_my_transitional(
    headers: HeaderMap,
    Query(q): Query<ListLotsQuery>,
) -> Response {
    let user_id = match resolve_user(&headers).await {
        Ok(id) => id,
        Err(resp) => return resp,
    };
    let client = match get_lot_client() {
        Some(c) => c,
        None => return lot_service_unavailable(),
    };
    match client
        .list_my_transitional_lots(user_id, q.world.clone(), q.limit, q.cursor())
        .await
    {
        Ok(rows) => Json(rows.into_iter().map(owned_to_dto).collect::<Vec<_>>()).into_response(),
        Err(e) => lot_error_response(e),
    }
}

/// `GET /api/v1/mc/lots/viewport` — bounding-box map RPC.
#[utoipa::path(
    get,
    path = "/api/v1/mc/lots/viewport",
    tag = "mc-lot",
    params(ViewportQuery),
    responses(
        (status = 200, description = "Lots intersecting the viewport", body = [ViewportLotDto]),
        (status = 401, description = "Missing / invalid bearer token"),
        (status = 503, description = "Lot service unavailable"),
    ),
    security(("bearerAuth" = [])),
)]
pub(crate) async fn list_viewport(headers: HeaderMap, Query(q): Query<ViewportQuery>) -> Response {
    let user_id = match resolve_user(&headers).await {
        Ok(id) => id,
        Err(resp) => return resp,
    };
    let client = match get_lot_client() {
        Some(c) => c,
        None => return lot_service_unavailable(),
    };
    let state_filter = match q.state {
        Some(v) => match LotState::from_pg(v) {
            Some(s) => Some(s),
            None => {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({"error": "invalid state filter"})),
                )
                    .into_response();
            }
        },
        None => None,
    };
    match client
        .list_lots_in_viewport(
            user_id,
            q.world.clone(),
            q.min_chunk_x,
            q.max_chunk_x,
            q.min_chunk_z,
            q.max_chunk_z,
            state_filter,
            q.limit,
        )
        .await
    {
        Ok(rows) => Json(rows.into_iter().map(viewport_to_dto).collect::<Vec<_>>()).into_response(),
        Err(e) => lot_error_response(e),
    }
}

/// `POST /api/v1/mc/lots/me/purchase` — buy a vacant lot.
#[utoipa::path(
    post,
    path = "/api/v1/mc/lots/me/purchase",
    tag = "mc-lot",
    request_body = PurchaseLotBody,
    responses(
        (status = 200, description = "Purchase recorded", body = PurchaseLotDto),
        (status = 401, description = "Missing / invalid bearer token"),
        (status = 402, description = "Insufficient funds"),
        (status = 404, description = "Lot not found"),
        (status = 409, description = "Lot not vacant / replay mismatch"),
        (status = 503, description = "Lot service unavailable"),
    ),
    security(("bearerAuth" = [])),
)]
pub(crate) async fn me_purchase(headers: HeaderMap, Json(body): Json<PurchaseLotBody>) -> Response {
    let user_id = match resolve_user(&headers).await {
        Ok(id) => id,
        Err(resp) => return resp,
    };
    let client = match get_lot_client() {
        Some(c) => c,
        None => return lot_service_unavailable(),
    };
    match client
        .purchase_lot(user_id, body.lot_id, body.idempotency_key)
        .await
    {
        Ok(purchase_id) => Json(PurchaseLotDto { purchase_id }).into_response(),
        Err(e) => lot_error_response(e),
    }
}

/// `POST /api/v1/mc/lots/me/queue-build` — queue a schematic build on the caller's lot.
#[utoipa::path(
    post,
    path = "/api/v1/mc/lots/me/queue-build",
    tag = "mc-lot",
    request_body = QueueBuildBody,
    responses(
        (status = 200, description = "Build job queued", body = BuildIdDto),
        (status = 401, description = "Missing / invalid bearer token"),
        (status = 403, description = "Lot not owned"),
        (status = 404, description = "Lot / schematic not found"),
        (status = 409, description = "Active job conflict / replay mismatch"),
        (status = 503, description = "Lot service unavailable"),
    ),
    security(("bearerAuth" = [])),
)]
pub(crate) async fn me_queue_build(
    headers: HeaderMap,
    Json(body): Json<QueueBuildBody>,
) -> Response {
    let user_id = match resolve_user(&headers).await {
        Ok(id) => id,
        Err(resp) => return resp,
    };
    let client = match get_lot_client() {
        Some(c) => c,
        None => return lot_service_unavailable(),
    };
    match client
        .queue_build_on_lot(
            user_id,
            body.lot_id,
            body.schematic_id,
            body.idempotency_key,
        )
        .await
    {
        Ok(build_id) => Json(BuildIdDto { build_id }).into_response(),
        Err(e) => lot_error_response(e),
    }
}

/// `POST /api/v1/mc/lots/me/queue-demolish` — queue a demolish of a built lot.
#[utoipa::path(
    post,
    path = "/api/v1/mc/lots/me/queue-demolish",
    tag = "mc-lot",
    request_body = QueueDemolishBody,
    responses(
        (status = 200, description = "Demolish job queued", body = BuildIdDto),
        (status = 401, description = "Missing / invalid bearer token"),
        (status = 403, description = "Lot not owned"),
        (status = 404, description = "Lot not found"),
        (status = 409, description = "Active job conflict / replay mismatch"),
        (status = 503, description = "Lot service unavailable"),
    ),
    security(("bearerAuth" = [])),
)]
pub(crate) async fn me_queue_demolish(
    headers: HeaderMap,
    Json(body): Json<QueueDemolishBody>,
) -> Response {
    let user_id = match resolve_user(&headers).await {
        Ok(id) => id,
        Err(resp) => return resp,
    };
    let client = match get_lot_client() {
        Some(c) => c,
        None => return lot_service_unavailable(),
    };
    match client
        .queue_demolish_lot(user_id, body.lot_id, body.idempotency_key)
        .await
    {
        Ok(build_id) => Json(BuildIdDto { build_id }).into_response(),
        Err(e) => lot_error_response(e),
    }
}

/// `GET /api/v1/mc/lots/staff/{lot_id}` — raw admin view (owner UUID + timestamps).
#[utoipa::path(
    get,
    path = "/api/v1/mc/lots/staff/{lot_id}",
    tag = "mc-lot-staff",
    params(("lot_id" = String, Path, description = "Lot ID")),
    responses(
        (status = 200, description = "Raw lot row", body = ServiceLotDto),
        (status = 401, description = "Missing / invalid bearer token"),
        (status = 403, description = "Caller is not staff"),
        (status = 404, description = "Lot not found"),
        (status = 503, description = "Lot service unavailable"),
    ),
    security(("bearerAuth" = [])),
)]
pub(crate) async fn staff_get_lot(headers: HeaderMap, Path(lot_id): Path<String>) -> Response {
    if let Err(resp) = require_staff(&headers).await {
        return resp;
    }
    let client = match get_lot_client() {
        Some(c) => c,
        None => return lot_service_unavailable(),
    };
    match client.service_get_lot(lot_id).await {
        Ok(Some(r)) => Json(service_lot_to_dto(r)).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "lot_not_found"})),
        )
            .into_response(),
        Err(e) => lot_error_response(e),
    }
}

/// `GET /api/v1/mc/lots/staff/failed` — keyset list of failed build jobs.
#[utoipa::path(
    get,
    path = "/api/v1/mc/lots/staff/failed",
    tag = "mc-lot-staff",
    params(StaffListFailedQuery),
    responses(
        (status = 200, description = "Failed builds", body = [FailedBuildDto]),
        (status = 401, description = "Missing / invalid bearer token"),
        (status = 403, description = "Caller is not staff"),
        (status = 503, description = "Lot service unavailable"),
    ),
    security(("bearerAuth" = [])),
)]
pub(crate) async fn staff_list_failed(
    headers: HeaderMap,
    Query(q): Query<StaffListFailedQuery>,
) -> Response {
    if let Err(resp) = require_staff(&headers).await {
        return resp;
    }
    let client = match get_lot_client() {
        Some(c) => c,
        None => return lot_service_unavailable(),
    };
    let after_failed_at = match q.after_failed_at.as_deref().map(parse_rfc3339).transpose() {
        Ok(v) => v,
        Err(e) => return e,
    };
    let cursor = FailedBuildCursor {
        after_failed_at,
        after_build_id: q.after_build_id,
    };
    match client.service_list_failed_builds(q.limit, cursor).await {
        Ok(rows) => Json(rows.into_iter().map(failed_to_dto).collect::<Vec<_>>()).into_response(),
        Err(e) => lot_error_response(e),
    }
}

/// `POST /api/v1/mc/lots/staff/retry` — re-queue a failed job.
#[utoipa::path(
    post,
    path = "/api/v1/mc/lots/staff/retry",
    tag = "mc-lot-staff",
    request_body = StaffRetryBody,
    responses(
        (status = 200, description = "Retry attempted", body = OkDto),
        (status = 401, description = "Missing / invalid bearer token"),
        (status = 403, description = "Caller is not staff"),
        (status = 404, description = "Build not found"),
        (status = 409, description = "Active job conflict / drift"),
        (status = 503, description = "Lot service unavailable"),
    ),
    security(("bearerAuth" = [])),
)]
pub(crate) async fn staff_retry(headers: HeaderMap, Json(body): Json<StaffRetryBody>) -> Response {
    if let Err(resp) = require_staff(&headers).await {
        return resp;
    }
    let client = match get_lot_client() {
        Some(c) => c,
        None => return lot_service_unavailable(),
    };
    match client
        .service_retry_failed_build(body.build_id, body.reset_attempts)
        .await
    {
        Ok(ok) => Json(OkDto { ok }).into_response(),
        Err(e) => lot_error_response(e),
    }
}

/// `POST /api/v1/mc/lots/staff/release-user` — release all lots owned by a user.
#[utoipa::path(
    post,
    path = "/api/v1/mc/lots/staff/release-user",
    tag = "mc-lot-staff",
    request_body = StaffReleaseUserBody,
    responses(
        (status = 200, description = "Released lots", body = [ReleasedLotDto]),
        (status = 401, description = "Missing / invalid bearer token"),
        (status = 403, description = "Caller is not staff"),
        (status = 409, description = "User has active build jobs; pass force = true"),
        (status = 503, description = "Lot service unavailable"),
    ),
    security(("bearerAuth" = [])),
)]
pub(crate) async fn staff_release_user(
    headers: HeaderMap,
    Json(body): Json<StaffReleaseUserBody>,
) -> Response {
    if let Err(resp) = require_staff(&headers).await {
        return resp;
    }
    let client = match get_lot_client() {
        Some(c) => c,
        None => return lot_service_unavailable(),
    };
    match client
        .service_release_user_lots(body.user_id, body.force)
        .await
    {
        Ok(rows) => Json(
            rows.into_iter()
                .map(|r| ReleasedLotDto {
                    lot_id: r.lot_id,
                    prior_state: r.prior_state as i16,
                })
                .collect::<Vec<_>>(),
        )
        .into_response(),
        Err(e) => lot_error_response(e),
    }
}

/// `POST /api/v1/mc/lots/staff/repair-orphan` — snap orphaned transitional lots back.
#[utoipa::path(
    post,
    path = "/api/v1/mc/lots/staff/repair-orphan",
    tag = "mc-lot-staff",
    params(StaffRepairQuery),
    responses(
        (status = 200, description = "Repair candidates / actions", body = [RepairedLotDto]),
        (status = 401, description = "Missing / invalid bearer token"),
        (status = 403, description = "Caller is not staff"),
        (status = 503, description = "Lot service unavailable"),
    ),
    security(("bearerAuth" = [])),
)]
pub(crate) async fn staff_repair_orphan(
    headers: HeaderMap,
    Query(q): Query<StaffRepairQuery>,
) -> Response {
    if let Err(resp) = require_staff(&headers).await {
        return resp;
    }
    let client = match get_lot_client() {
        Some(c) => c,
        None => return lot_service_unavailable(),
    };
    match client.service_repair_orphan_transitional(q.dry_run).await {
        Ok(rows) => Json(rows.into_iter().map(repaired_to_dto).collect::<Vec<_>>()).into_response(),
        Err(e) => lot_error_response(e),
    }
}

/// `POST /api/v1/mc/lots/service/claim` — worker claim batch.
#[utoipa::path(
    post,
    path = "/api/v1/mc/lots/service/claim",
    tag = "mc-lot-service",
    request_body = ServiceClaimBody,
    responses(
        (status = 200, description = "Claimed jobs", body = [ClaimedBuildDto]),
        (status = 401, description = "Missing / invalid bearer token"),
        (status = 403, description = "service_role required"),
        (status = 503, description = "Lot service unavailable"),
    ),
    security(("bearerAuth" = [])),
)]
pub(crate) async fn service_claim(
    headers: HeaderMap,
    Json(body): Json<ServiceClaimBody>,
) -> Response {
    if let Err(resp) = require_service_role(&headers).await {
        return resp;
    }
    let client = match get_lot_client() {
        Some(c) => c,
        None => return lot_service_unavailable(),
    };
    match client
        .service_claim_pending_builds(body.worker_id, body.limit)
        .await
    {
        Ok(rows) => Json(rows.into_iter().map(claimed_to_dto).collect::<Vec<_>>()).into_response(),
        Err(e) => lot_error_response(e),
    }
}

/// `POST /api/v1/mc/lots/service/mark-applied` — worker success ACK.
#[utoipa::path(
    post,
    path = "/api/v1/mc/lots/service/mark-applied",
    tag = "mc-lot-service",
    request_body = ServiceMarkAppliedBody,
    responses(
        (status = 200, description = "ACK applied", body = OkDto),
        (status = 401, description = "Missing / invalid bearer token"),
        (status = 403, description = "service_role required"),
        (status = 503, description = "Lot service unavailable"),
    ),
    security(("bearerAuth" = [])),
)]
pub(crate) async fn service_mark_applied(
    headers: HeaderMap,
    Json(body): Json<ServiceMarkAppliedBody>,
) -> Response {
    if let Err(resp) = require_service_role(&headers).await {
        return resp;
    }
    let client = match get_lot_client() {
        Some(c) => c,
        None => return lot_service_unavailable(),
    };
    match client
        .service_mark_build_applied(body.build_id, body.worker_id)
        .await
    {
        Ok(ok) => Json(OkDto { ok }).into_response(),
        Err(e) => lot_error_response(e),
    }
}

/// `POST /api/v1/mc/lots/service/mark-failed` — worker failure ACK.
#[utoipa::path(
    post,
    path = "/api/v1/mc/lots/service/mark-failed",
    tag = "mc-lot-service",
    request_body = ServiceMarkFailedBody,
    responses(
        (status = 200, description = "ACK applied", body = OkDto),
        (status = 401, description = "Missing / invalid bearer token"),
        (status = 403, description = "service_role required"),
        (status = 503, description = "Lot service unavailable"),
    ),
    security(("bearerAuth" = [])),
)]
pub(crate) async fn service_mark_failed(
    headers: HeaderMap,
    Json(body): Json<ServiceMarkFailedBody>,
) -> Response {
    if let Err(resp) = require_service_role(&headers).await {
        return resp;
    }
    let client = match get_lot_client() {
        Some(c) => c,
        None => return lot_service_unavailable(),
    };
    match client
        .service_mark_build_failed(body.build_id, body.worker_id, body.error)
        .await
    {
        Ok(ok) => Json(OkDto { ok }).into_response(),
        Err(e) => lot_error_response(e),
    }
}

/// `POST /api/v1/mc/lots/service/requeue-stale` — janitor recovery of orphaned claims.
#[utoipa::path(
    post,
    path = "/api/v1/mc/lots/service/requeue-stale",
    tag = "mc-lot-service",
    params(ServiceRequeueStaleQuery),
    responses(
        (status = 200, description = "Requeue/exhaust counts", body = RequeueSummaryDto),
        (status = 401, description = "Missing / invalid bearer token"),
        (status = 403, description = "service_role required"),
        (status = 503, description = "Lot service unavailable"),
    ),
    security(("bearerAuth" = [])),
)]
pub(crate) async fn service_requeue_stale(
    headers: HeaderMap,
    Query(q): Query<ServiceRequeueStaleQuery>,
) -> Response {
    if let Err(resp) = require_service_role(&headers).await {
        return resp;
    }
    let client = match get_lot_client() {
        Some(c) => c,
        None => return lot_service_unavailable(),
    };
    match client
        .service_requeue_stale_claims(q.older_than_seconds, q.limit)
        .await
    {
        Ok(s) => Json(RequeueSummaryDto {
            requeued_count: s.requeued_count,
            exhausted_count: s.exhausted_count,
        })
        .into_response(),
        Err(e) => lot_error_response(e),
    }
}

fn vacant_to_dto(r: kbve::lot::VacantLotRow) -> VacantLotDto {
    VacantLotDto {
        lot_id: r.lot_id,
        chunk_x_min: r.chunk_x_min,
        chunk_x_max: r.chunk_x_max,
        chunk_z_min: r.chunk_z_min,
        chunk_z_max: r.chunk_z_max,
        block_x_min: r.block_x_min,
        block_x_max: r.block_x_max,
        block_z_min: r.block_z_min,
        block_z_max: r.block_z_max,
        chunk_area: r.chunk_area,
        anchor_y: r.anchor_y,
        price_credits: r.price_credits,
        price_khash: r.price_khash,
    }
}

fn owned_to_dto(r: kbve::lot::OwnedLotRow) -> OwnedLotDto {
    OwnedLotDto {
        lot_id: r.lot_id,
        chunk_x_min: r.chunk_x_min,
        chunk_x_max: r.chunk_x_max,
        chunk_z_min: r.chunk_z_min,
        chunk_z_max: r.chunk_z_max,
        block_x_min: r.block_x_min,
        block_x_max: r.block_x_max,
        block_z_min: r.block_z_min,
        block_z_max: r.block_z_max,
        chunk_area: r.chunk_area,
        anchor_y: r.anchor_y,
        state: r.state as i16,
        current_schematic_id: r.current_schematic_id,
        price_credits: r.price_credits,
        price_khash: r.price_khash,
    }
}

fn viewport_to_dto(r: kbve::lot::ViewportLotRow) -> ViewportLotDto {
    ViewportLotDto {
        lot_id: r.lot_id,
        chunk_x_min: r.chunk_x_min,
        chunk_x_max: r.chunk_x_max,
        chunk_z_min: r.chunk_z_min,
        chunk_z_max: r.chunk_z_max,
        block_x_min: r.block_x_min,
        block_x_max: r.block_x_max,
        block_z_min: r.block_z_min,
        block_z_max: r.block_z_max,
        anchor_y: r.anchor_y,
        is_owned: r.is_owned,
        is_owned_by_me: r.is_owned_by_me,
        state: r.state as i16,
        current_schematic_id: r.current_schematic_id,
    }
}

fn service_lot_to_dto(r: kbve::lot::ServiceLotRow) -> ServiceLotDto {
    ServiceLotDto {
        lot_id: r.lot_id,
        world: r.world,
        chunk_x_min: r.chunk_x_min,
        chunk_x_max: r.chunk_x_max,
        chunk_z_min: r.chunk_z_min,
        chunk_z_max: r.chunk_z_max,
        block_x_min: r.block_x_min,
        block_x_max: r.block_x_max,
        block_z_min: r.block_z_min,
        block_z_max: r.block_z_max,
        chunk_area: r.chunk_area,
        anchor_y: r.anchor_y,
        owner_user_id: r.owner_user_id,
        current_schematic_id: r.current_schematic_id,
        state: r.state as i16,
        price_credits: r.price_credits,
        price_khash: r.price_khash,
        created_at: r.created_at.to_rfc3339(),
        updated_at: r.updated_at.to_rfc3339(),
    }
}

fn claimed_to_dto(r: kbve::lot::ClaimedBuildRow) -> ClaimedBuildDto {
    ClaimedBuildDto {
        build_id: r.build_id,
        lot_id: r.lot_id,
        actor_user_id: r.actor_user_id,
        action_kind: r.action_kind as i16,
        schematic_id: r.schematic_id,
        queued_at: r.queued_at.to_rfc3339(),
        world: r.world,
        chunk_x_min: r.chunk_x_min,
        chunk_x_max: r.chunk_x_max,
        chunk_z_min: r.chunk_z_min,
        chunk_z_max: r.chunk_z_max,
        block_x_min: r.block_x_min,
        block_x_max: r.block_x_max,
        block_z_min: r.block_z_min,
        block_z_max: r.block_z_max,
        anchor_y: r.anchor_y,
        resource_path: r.resource_path,
        dims_x: r.dims_x,
        dims_y: r.dims_y,
        dims_z: r.dims_z,
    }
}

fn failed_to_dto(r: kbve::lot::FailedBuildRow) -> FailedBuildDto {
    FailedBuildDto {
        build_id: r.build_id,
        lot_id: r.lot_id,
        actor_user_id: r.actor_user_id,
        action_kind: r.action_kind as i16,
        schematic_id: r.schematic_id,
        apply_error: r.apply_error,
        failed_at: r.failed_at.to_rfc3339(),
        attempt_count: r.attempt_count,
    }
}

fn repaired_to_dto(r: kbve::lot::RepairedLotRow) -> RepairedLotDto {
    RepairedLotDto {
        lot_id: r.lot_id,
        prior_state: r.prior_state as i16,
        new_state: r.new_state as i16,
        latest_build_id: r.latest_build_id,
        latest_apply_state: r.latest_apply_state.map(|s| s as i16),
        latest_failed_at: r.latest_failed_at.map(|t| t.to_rfc3339()),
        latest_apply_error: r.latest_apply_error,
    }
}

fn parse_rfc3339(s: &str) -> Result<chrono::DateTime<chrono::Utc>, Response> {
    chrono::DateTime::parse_from_rfc3339(s)
        .map(|dt| dt.with_timezone(&chrono::Utc))
        .map_err(|e| {
            (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "invalid_after_failed_at", "message": e.to_string()})),
            )
                .into_response()
        })
}
