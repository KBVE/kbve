//! Service-role lot RPCs.
//!
//! These call the `public.proxy_service_*` wrappers that gate on
//! `auth.role() = 'service_role'`. The handler layer is responsible for
//! ensuring the request reaches Postgres under a service-role JWT.

use chrono::{DateTime, Utc};
use diesel::QueryableByName;
use diesel::sql_query;
use diesel::sql_types::{BigInt, Bool, Integer, Nullable, SmallInt, Text, Timestamptz};
use diesel_async::RunQueryDsl;
use uuid::Uuid;

use super::error::{LotError, Result};
use super::proxy::LotClient;
use super::types::*;

#[derive(QueryableByName)]
struct ServiceLotRowDb {
    #[diesel(sql_type = Text)]
    lot_id: String,
    #[diesel(sql_type = Text)]
    world: String,
    #[diesel(sql_type = Integer)]
    chunk_x_min: i32,
    #[diesel(sql_type = Integer)]
    chunk_x_max: i32,
    #[diesel(sql_type = Integer)]
    chunk_z_min: i32,
    #[diesel(sql_type = Integer)]
    chunk_z_max: i32,
    #[diesel(sql_type = Integer)]
    block_x_min: i32,
    #[diesel(sql_type = Integer)]
    block_x_max: i32,
    #[diesel(sql_type = Integer)]
    block_z_min: i32,
    #[diesel(sql_type = Integer)]
    block_z_max: i32,
    #[diesel(sql_type = Integer)]
    chunk_area: i32,
    #[diesel(sql_type = SmallInt)]
    anchor_y: i16,
    #[diesel(sql_type = Nullable<diesel::sql_types::Uuid>)]
    owner_user_id: Option<Uuid>,
    #[diesel(sql_type = Nullable<Text>)]
    current_schematic_id: Option<String>,
    #[diesel(sql_type = SmallInt)]
    state: i16,
    #[diesel(sql_type = BigInt)]
    price_credits: i64,
    #[diesel(sql_type = BigInt)]
    price_khash: i64,
    #[diesel(sql_type = Timestamptz)]
    created_at: DateTime<Utc>,
    #[diesel(sql_type = Timestamptz)]
    updated_at: DateTime<Utc>,
}

#[derive(QueryableByName)]
struct ClaimedBuildRowDb {
    #[diesel(sql_type = Text)]
    build_id: String,
    #[diesel(sql_type = Text)]
    lot_id: String,
    #[diesel(sql_type = diesel::sql_types::Uuid)]
    actor_user_id: Uuid,
    #[diesel(sql_type = SmallInt)]
    action_kind: i16,
    #[diesel(sql_type = Nullable<Text>)]
    schematic_id: Option<String>,
    #[diesel(sql_type = Timestamptz)]
    queued_at: DateTime<Utc>,
    #[diesel(sql_type = Text)]
    world: String,
    #[diesel(sql_type = Integer)]
    chunk_x_min: i32,
    #[diesel(sql_type = Integer)]
    chunk_x_max: i32,
    #[diesel(sql_type = Integer)]
    chunk_z_min: i32,
    #[diesel(sql_type = Integer)]
    chunk_z_max: i32,
    #[diesel(sql_type = Integer)]
    block_x_min: i32,
    #[diesel(sql_type = Integer)]
    block_x_max: i32,
    #[diesel(sql_type = Integer)]
    block_z_min: i32,
    #[diesel(sql_type = Integer)]
    block_z_max: i32,
    #[diesel(sql_type = SmallInt)]
    anchor_y: i16,
    #[diesel(sql_type = Nullable<Text>)]
    resource_path: Option<String>,
    #[diesel(sql_type = Nullable<SmallInt>)]
    dims_x: Option<i16>,
    #[diesel(sql_type = Nullable<SmallInt>)]
    dims_y: Option<i16>,
    #[diesel(sql_type = Nullable<SmallInt>)]
    dims_z: Option<i16>,
}

#[derive(QueryableByName)]
struct RequeueSummaryDb {
    #[diesel(sql_type = Integer)]
    requeued_count: i32,
    #[diesel(sql_type = Integer)]
    exhausted_count: i32,
}

#[derive(QueryableByName)]
struct BoolRow {
    #[diesel(sql_type = Bool)]
    ok: bool,
}

#[derive(QueryableByName)]
struct FailedBuildRowDb {
    #[diesel(sql_type = Text)]
    build_id: String,
    #[diesel(sql_type = Text)]
    lot_id: String,
    #[diesel(sql_type = diesel::sql_types::Uuid)]
    actor_user_id: Uuid,
    #[diesel(sql_type = SmallInt)]
    action_kind: i16,
    #[diesel(sql_type = Nullable<Text>)]
    schematic_id: Option<String>,
    #[diesel(sql_type = Nullable<Text>)]
    apply_error: Option<String>,
    #[diesel(sql_type = Timestamptz)]
    failed_at: DateTime<Utc>,
    #[diesel(sql_type = Integer)]
    attempt_count: i32,
}

#[derive(QueryableByName)]
struct ReleasedLotRowDb {
    #[diesel(sql_type = Text)]
    lot_id: String,
    #[diesel(sql_type = SmallInt)]
    prior_state: i16,
}

#[derive(QueryableByName)]
struct RepairedLotRowDb {
    #[diesel(sql_type = Text)]
    lot_id: String,
    #[diesel(sql_type = SmallInt)]
    prior_state: i16,
    #[diesel(sql_type = SmallInt)]
    new_state: i16,
    #[diesel(sql_type = Nullable<Text>)]
    latest_build_id: Option<String>,
    #[diesel(sql_type = Nullable<SmallInt>)]
    latest_apply_state: Option<i16>,
    #[diesel(sql_type = Nullable<Timestamptz>)]
    latest_failed_at: Option<DateTime<Utc>>,
    #[diesel(sql_type = Nullable<Text>)]
    latest_apply_error: Option<String>,
}

impl LotClient {
    // -------- service: get one lot (raw shape) --------

    pub async fn service_get_lot(&self, lot_id: String) -> Result<Option<ServiceLotRow>> {
        let mut conn = self.wallet().read().await.map_err(LotError::Wallet)?;
        let row_opt: Option<ServiceLotRowDb> = sql_query(
            "SELECT lot_id, world, chunk_x_min, chunk_x_max, chunk_z_min, chunk_z_max, \
                    block_x_min, block_x_max, block_z_min, block_z_max, \
                    chunk_area, anchor_y, owner_user_id, current_schematic_id, \
                    state, price_credits, price_khash, created_at, updated_at \
             FROM public.proxy_service_get_lot($1)",
        )
        .bind::<Text, _>(lot_id)
        .get_results::<ServiceLotRowDb>(&mut *conn)
        .await
        .map_err(LotError::from_diesel)?
        .into_iter()
        .next();
        row_opt
            .map(|r| {
                let state = LotState::from_pg(r.state).ok_or_else(|| {
                    LotError::InvalidArgument(format!("unknown lot_state: {}", r.state))
                })?;
                Ok(ServiceLotRow {
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
                    state,
                    price_credits: r.price_credits,
                    price_khash: r.price_khash,
                    created_at: r.created_at,
                    updated_at: r.updated_at,
                })
            })
            .transpose()
    }

    // -------- worker: claim, mark applied/failed --------

    pub async fn service_claim_pending_builds(
        &self,
        worker_id: String,
        limit: i32,
    ) -> Result<Vec<ClaimedBuildRow>> {
        let mut conn = self.wallet().write().await.map_err(LotError::Wallet)?;
        let rows: Vec<ClaimedBuildRowDb> = sql_query(
            "SELECT build_id, lot_id, actor_user_id, action_kind, schematic_id, queued_at, \
                    world, chunk_x_min, chunk_x_max, chunk_z_min, chunk_z_max, \
                    block_x_min, block_x_max, block_z_min, block_z_max, anchor_y, \
                    resource_path, dims_x, dims_y, dims_z \
             FROM public.proxy_service_claim_pending_builds($1, $2)",
        )
        .bind::<Text, _>(worker_id)
        .bind::<Integer, _>(limit)
        .get_results(&mut *conn)
        .await
        .map_err(LotError::from_diesel)?;
        rows.into_iter()
            .map(|r| {
                let action_kind = BuildActionKind::from_pg(r.action_kind).ok_or_else(|| {
                    LotError::InvalidArgument(format!("unknown action_kind: {}", r.action_kind))
                })?;
                Ok(ClaimedBuildRow {
                    build_id: r.build_id,
                    lot_id: r.lot_id,
                    actor_user_id: r.actor_user_id,
                    action_kind,
                    schematic_id: r.schematic_id,
                    queued_at: r.queued_at,
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
                })
            })
            .collect()
    }

    pub async fn service_mark_build_applied(
        &self,
        build_id: String,
        worker_id: String,
    ) -> Result<bool> {
        let mut conn = self.wallet().write().await.map_err(LotError::Wallet)?;
        let row: BoolRow =
            sql_query("SELECT public.proxy_service_mark_build_applied($1, $2) AS ok")
                .bind::<Text, _>(build_id)
                .bind::<Text, _>(worker_id)
                .get_result(&mut *conn)
                .await
                .map_err(LotError::from_diesel)?;
        Ok(row.ok)
    }

    pub async fn service_mark_build_failed(
        &self,
        build_id: String,
        worker_id: String,
        error: String,
    ) -> Result<bool> {
        let mut conn = self.wallet().write().await.map_err(LotError::Wallet)?;
        let row: BoolRow =
            sql_query("SELECT public.proxy_service_mark_build_failed($1, $2, $3) AS ok")
                .bind::<Text, _>(build_id)
                .bind::<Text, _>(worker_id)
                .bind::<Text, _>(error)
                .get_result(&mut *conn)
                .await
                .map_err(LotError::from_diesel)?;
        Ok(row.ok)
    }

    pub async fn service_requeue_stale_claims(
        &self,
        older_than_seconds: i32,
        limit: i32,
    ) -> Result<RequeueStaleSummary> {
        let mut conn = self.wallet().write().await.map_err(LotError::Wallet)?;
        let row: RequeueSummaryDb = sql_query(
            "SELECT requeued_count, exhausted_count \
             FROM public.proxy_service_requeue_stale_claims($1, $2)",
        )
        .bind::<Integer, _>(older_than_seconds)
        .bind::<Integer, _>(limit)
        .get_result(&mut *conn)
        .await
        .map_err(LotError::from_diesel)?;
        Ok(RequeueStaleSummary {
            requeued_count: row.requeued_count,
            exhausted_count: row.exhausted_count,
        })
    }

    // -------- admin: retry, list failed, release, repair --------

    pub async fn service_retry_failed_build(
        &self,
        build_id: String,
        reset_attempts: bool,
    ) -> Result<bool> {
        let mut conn = self.wallet().write().await.map_err(LotError::Wallet)?;
        let row: BoolRow =
            sql_query("SELECT public.proxy_service_retry_failed_build($1, $2) AS ok")
                .bind::<Text, _>(build_id)
                .bind::<Bool, _>(reset_attempts)
                .get_result(&mut *conn)
                .await
                .map_err(LotError::from_diesel)?;
        Ok(row.ok)
    }

    pub async fn service_list_failed_builds(
        &self,
        limit: i32,
        cursor: FailedBuildCursor,
    ) -> Result<Vec<FailedBuildRow>> {
        let mut conn = self.wallet().read().await.map_err(LotError::Wallet)?;
        let rows: Vec<FailedBuildRowDb> = sql_query(
            "SELECT build_id, lot_id, actor_user_id, action_kind, schematic_id, \
                    apply_error, failed_at, attempt_count \
             FROM public.proxy_service_list_failed_builds($1, $2, $3)",
        )
        .bind::<Integer, _>(limit)
        .bind::<Nullable<Timestamptz>, _>(cursor.after_failed_at)
        .bind::<Nullable<Text>, _>(cursor.after_build_id)
        .get_results(&mut *conn)
        .await
        .map_err(LotError::from_diesel)?;
        rows.into_iter()
            .map(|r| {
                let action_kind = BuildActionKind::from_pg(r.action_kind).ok_or_else(|| {
                    LotError::InvalidArgument(format!("unknown action_kind: {}", r.action_kind))
                })?;
                Ok(FailedBuildRow {
                    build_id: r.build_id,
                    lot_id: r.lot_id,
                    actor_user_id: r.actor_user_id,
                    action_kind,
                    schematic_id: r.schematic_id,
                    apply_error: r.apply_error,
                    failed_at: r.failed_at,
                    attempt_count: r.attempt_count,
                })
            })
            .collect()
    }

    pub async fn service_release_user_lots(
        &self,
        user_id: Uuid,
        force: bool,
    ) -> Result<Vec<ReleasedLotRow>> {
        let mut conn = self.wallet().write().await.map_err(LotError::Wallet)?;
        let rows: Vec<ReleasedLotRowDb> = sql_query(
            "SELECT lot_id, prior_state \
             FROM public.proxy_service_release_user_lots($1, $2)",
        )
        .bind::<diesel::sql_types::Uuid, _>(user_id)
        .bind::<Bool, _>(force)
        .get_results(&mut *conn)
        .await
        .map_err(LotError::from_diesel)?;
        rows.into_iter()
            .map(|r| {
                let prior_state = LotState::from_pg(r.prior_state).ok_or_else(|| {
                    LotError::InvalidArgument(format!("unknown lot_state: {}", r.prior_state))
                })?;
                Ok(ReleasedLotRow {
                    lot_id: r.lot_id,
                    prior_state,
                })
            })
            .collect()
    }

    pub async fn service_repair_orphan_transitional(
        &self,
        dry_run: bool,
    ) -> Result<Vec<RepairedLotRow>> {
        let mut conn = self.wallet().write().await.map_err(LotError::Wallet)?;
        let rows: Vec<RepairedLotRowDb> = sql_query(
            "SELECT lot_id, prior_state, new_state, latest_build_id, \
                    latest_apply_state, latest_failed_at, latest_apply_error \
             FROM public.proxy_service_repair_orphan_transitional($1)",
        )
        .bind::<Bool, _>(dry_run)
        .get_results(&mut *conn)
        .await
        .map_err(LotError::from_diesel)?;
        rows.into_iter()
            .map(|r| {
                let prior_state = LotState::from_pg(r.prior_state).ok_or_else(|| {
                    LotError::InvalidArgument(format!("unknown lot_state: {}", r.prior_state))
                })?;
                let new_state = LotState::from_pg(r.new_state).ok_or_else(|| {
                    LotError::InvalidArgument(format!("unknown lot_state: {}", r.new_state))
                })?;
                let latest_apply_state = r
                    .latest_apply_state
                    .map(|v| {
                        BuildApplyState::from_pg(v).ok_or_else(|| {
                            LotError::InvalidArgument(format!("unknown build_apply_state: {v}"))
                        })
                    })
                    .transpose()?;
                Ok(RepairedLotRow {
                    lot_id: r.lot_id,
                    prior_state,
                    new_state,
                    latest_build_id: r.latest_build_id,
                    latest_apply_state,
                    latest_failed_at: r.latest_failed_at,
                    latest_apply_error: r.latest_apply_error,
                })
            })
            .collect()
    }
}
