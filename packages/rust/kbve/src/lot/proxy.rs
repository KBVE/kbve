//! User-facing lot/schematic RPCs.
//!
//! All call `public.proxy_*` SECURITY DEFINER wrappers that resolve the
//! caller via `auth.uid()`. The connection enters a transaction with
//! `request.jwt.claims` set so RLS / auth.uid()-based ownership checks
//! succeed.

use chrono::{DateTime, Utc};
use diesel::QueryableByName;
use diesel::sql_query;
use diesel::sql_types::{BigInt, Bool, Integer, Nullable, SmallInt, Text};
use diesel_async::{AsyncConnection, AsyncPgConnection, RunQueryDsl};
use uuid::Uuid;

use crate::wallet::client::{WalletClient, set_user_claims};

use super::error::{LotError, Result};
use super::types::*;

#[derive(QueryableByName)]
struct SchematicRowDb {
    #[diesel(sql_type = Text)]
    schematic_id: String,
    #[diesel(sql_type = Text)]
    name: String,
    #[diesel(sql_type = Text)]
    category: String,
    #[diesel(sql_type = SmallInt)]
    tier: i16,
    #[diesel(sql_type = SmallInt)]
    dims_x: i16,
    #[diesel(sql_type = SmallInt)]
    dims_y: i16,
    #[diesel(sql_type = SmallInt)]
    dims_z: i16,
    #[diesel(sql_type = BigInt)]
    price_credits: i64,
    #[diesel(sql_type = BigInt)]
    price_khash: i64,
}

#[derive(QueryableByName)]
struct VacantLotRowDb {
    #[diesel(sql_type = Text)]
    lot_id: String,
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
    #[diesel(sql_type = BigInt)]
    price_credits: i64,
    #[diesel(sql_type = BigInt)]
    price_khash: i64,
}

#[derive(QueryableByName)]
struct OwnedLotRowDb {
    #[diesel(sql_type = Text)]
    lot_id: String,
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
    #[diesel(sql_type = SmallInt)]
    state: i16,
    #[diesel(sql_type = Nullable<Text>)]
    current_schematic_id: Option<String>,
    #[diesel(sql_type = BigInt)]
    price_credits: i64,
    #[diesel(sql_type = BigInt)]
    price_khash: i64,
}

#[derive(QueryableByName)]
struct ViewportLotRowDb {
    #[diesel(sql_type = Text)]
    lot_id: String,
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
    #[diesel(sql_type = Bool)]
    is_owned: bool,
    #[diesel(sql_type = Bool)]
    is_owned_by_me: bool,
    #[diesel(sql_type = SmallInt)]
    state: i16,
    #[diesel(sql_type = Nullable<Text>)]
    current_schematic_id: Option<String>,
}

#[derive(QueryableByName)]
struct PurchaseLotRowDb {
    #[diesel(sql_type = Text)]
    purchase_id: String,
}

#[derive(QueryableByName)]
struct BuildIdRowDb {
    #[diesel(sql_type = Text)]
    build_id: String,
}

// ===========================================================================
// LotClient — thin facade over [`WalletClient`] that exposes the lot RPCs.
// ===========================================================================

/// Thin wrapper around a shared [`WalletClient`] pool. Held by the axum
/// transport layer so handlers can call lot RPCs without dragging the
/// wallet API into their signatures.
#[derive(Clone)]
pub struct LotClient {
    inner: WalletClient,
}

impl LotClient {
    pub fn new(inner: WalletClient) -> Self {
        Self { inner }
    }

    pub fn wallet(&self) -> &WalletClient {
        &self.inner
    }

    // ---------------- catalog ----------------

    pub async fn list_schematics(&self, category: Option<String>) -> Result<Vec<SchematicRow>> {
        let mut conn = self.inner.read().await.map_err(LotError::Wallet)?;
        list_schematics_async(&mut conn, category).await
    }

    // ---------------- vacant / my / viewport ----------------

    pub async fn list_vacant_lots(
        &self,
        user_id: Uuid,
        world: String,
        limit: i32,
        cursor: LotChunkCursor,
    ) -> Result<Vec<VacantLotRow>> {
        let mut conn = self.inner.read().await.map_err(LotError::Wallet)?;
        let inner: &mut AsyncPgConnection = &mut *conn;
        inner
            .transaction::<Vec<VacantLotRow>, LotError, _>(async |c| {
                set_user_claims(c, user_id)
                    .await
                    .map_err(LotError::Wallet)?;
                list_vacant_async(c, &world, limit, &cursor).await
            })
            .await
    }

    pub async fn list_my_active_lots(
        &self,
        user_id: Uuid,
        world: String,
        limit: i32,
        cursor: LotChunkCursor,
    ) -> Result<Vec<OwnedLotRow>> {
        let mut conn = self.inner.read().await.map_err(LotError::Wallet)?;
        let inner: &mut AsyncPgConnection = &mut *conn;
        inner
            .transaction::<Vec<OwnedLotRow>, LotError, _>(async |c| {
                set_user_claims(c, user_id)
                    .await
                    .map_err(LotError::Wallet)?;
                list_owned_async(
                    c,
                    "public.proxy_list_my_active_lots",
                    &world,
                    limit,
                    &cursor,
                )
                .await
            })
            .await
    }

    pub async fn list_my_transitional_lots(
        &self,
        user_id: Uuid,
        world: String,
        limit: i32,
        cursor: LotChunkCursor,
    ) -> Result<Vec<OwnedLotRow>> {
        let mut conn = self.inner.read().await.map_err(LotError::Wallet)?;
        let inner: &mut AsyncPgConnection = &mut *conn;
        inner
            .transaction::<Vec<OwnedLotRow>, LotError, _>(async |c| {
                set_user_claims(c, user_id)
                    .await
                    .map_err(LotError::Wallet)?;
                list_owned_async(
                    c,
                    "public.proxy_list_my_transitional_lots",
                    &world,
                    limit,
                    &cursor,
                )
                .await
            })
            .await
    }

    /// Viewport map RPC. `state_filter` optionally narrows to a single
    /// `mc.lot_state` value; pass `None` for everything in the box.
    pub async fn list_lots_in_viewport(
        &self,
        user_id: Uuid,
        world: String,
        min_chunk_x: i32,
        max_chunk_x: i32,
        min_chunk_z: i32,
        max_chunk_z: i32,
        state_filter: Option<LotState>,
        limit: i32,
    ) -> Result<Vec<ViewportLotRow>> {
        let mut conn = self.inner.read().await.map_err(LotError::Wallet)?;
        let inner: &mut AsyncPgConnection = &mut *conn;
        inner
            .transaction::<Vec<ViewportLotRow>, LotError, _>(async |c| {
                set_user_claims(c, user_id)
                    .await
                    .map_err(LotError::Wallet)?;
                list_viewport_async(
                    c,
                    &world,
                    min_chunk_x,
                    max_chunk_x,
                    min_chunk_z,
                    max_chunk_z,
                    state_filter,
                    limit,
                )
                .await
            })
            .await
    }

    // ---------------- mutate (purchase / queue) ----------------

    pub async fn purchase_lot(
        &self,
        user_id: Uuid,
        lot_id: String,
        idempotency_key: Uuid,
    ) -> Result<String> {
        let mut conn = self.inner.write().await.map_err(LotError::Wallet)?;
        let inner: &mut AsyncPgConnection = &mut *conn;
        inner
            .transaction::<String, LotError, _>(async |c| {
                set_user_claims(c, user_id)
                    .await
                    .map_err(LotError::Wallet)?;
                let r: PurchaseLotRowDb =
                    sql_query("SELECT public.proxy_purchase_lot($1, $2) AS purchase_id")
                        .bind::<Text, _>(lot_id)
                        .bind::<diesel::sql_types::Uuid, _>(idempotency_key)
                        .get_result(c)
                        .await
                        .map_err(LotError::from_diesel)?;
                Ok(r.purchase_id)
            })
            .await
    }

    pub async fn queue_build_on_lot(
        &self,
        user_id: Uuid,
        lot_id: String,
        schematic_id: String,
        idempotency_key: Uuid,
    ) -> Result<String> {
        let mut conn = self.inner.write().await.map_err(LotError::Wallet)?;
        let inner: &mut AsyncPgConnection = &mut *conn;
        inner
            .transaction::<String, LotError, _>(async |c| {
                set_user_claims(c, user_id)
                    .await
                    .map_err(LotError::Wallet)?;
                let r: BuildIdRowDb =
                    sql_query("SELECT public.proxy_queue_build_on_lot($1, $2, $3) AS build_id")
                        .bind::<Text, _>(lot_id)
                        .bind::<Text, _>(schematic_id)
                        .bind::<diesel::sql_types::Uuid, _>(idempotency_key)
                        .get_result(c)
                        .await
                        .map_err(LotError::from_diesel)?;
                Ok(r.build_id)
            })
            .await
    }

    pub async fn queue_demolish_lot(
        &self,
        user_id: Uuid,
        lot_id: String,
        idempotency_key: Uuid,
    ) -> Result<String> {
        let mut conn = self.inner.write().await.map_err(LotError::Wallet)?;
        let inner: &mut AsyncPgConnection = &mut *conn;
        inner
            .transaction::<String, LotError, _>(async |c| {
                set_user_claims(c, user_id)
                    .await
                    .map_err(LotError::Wallet)?;
                let r: BuildIdRowDb =
                    sql_query("SELECT public.proxy_queue_demolish_lot($1, $2) AS build_id")
                        .bind::<Text, _>(lot_id)
                        .bind::<diesel::sql_types::Uuid, _>(idempotency_key)
                        .get_result(c)
                        .await
                        .map_err(LotError::from_diesel)?;
                Ok(r.build_id)
            })
            .await
    }
}

// ---------------------------------------------------------------------------
// Connection-level helpers (free functions so service.rs can reuse them).
// ---------------------------------------------------------------------------

async fn list_schematics_async(
    conn: &mut AsyncPgConnection,
    category: Option<String>,
) -> Result<Vec<SchematicRow>> {
    let rows: Vec<SchematicRowDb> = sql_query(
        "SELECT schematic_id, name, category, tier::SMALLINT, dims_x, dims_y, dims_z, \
                price_credits, price_khash \
         FROM public.proxy_list_schematics($1)",
    )
    .bind::<Nullable<Text>, _>(category)
    .get_results(conn)
    .await
    .map_err(LotError::from_diesel)?;
    Ok(rows
        .into_iter()
        .map(|r| SchematicRow {
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
        .collect())
}

async fn list_vacant_async(
    conn: &mut AsyncPgConnection,
    world: &str,
    limit: i32,
    cursor: &LotChunkCursor,
) -> Result<Vec<VacantLotRow>> {
    let rows: Vec<VacantLotRowDb> = sql_query(
        "SELECT lot_id, chunk_x_min, chunk_x_max, chunk_z_min, chunk_z_max, \
                block_x_min, block_x_max, block_z_min, block_z_max, \
                chunk_area, anchor_y, price_credits, price_khash \
         FROM public.proxy_list_vacant_lots($1, $2, $3, $4, $5)",
    )
    .bind::<Text, _>(world)
    .bind::<Integer, _>(limit)
    .bind::<Nullable<Integer>, _>(cursor.after_chunk_x)
    .bind::<Nullable<Integer>, _>(cursor.after_chunk_z)
    .bind::<Nullable<Text>, _>(cursor.after_lot_id.clone())
    .get_results(conn)
    .await
    .map_err(LotError::from_diesel)?;
    Ok(rows
        .into_iter()
        .map(|r| VacantLotRow {
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
        })
        .collect())
}

async fn list_owned_async(
    conn: &mut AsyncPgConnection,
    fn_name: &str,
    world: &str,
    limit: i32,
    cursor: &LotChunkCursor,
) -> Result<Vec<OwnedLotRow>> {
    let query = format!(
        "SELECT lot_id, chunk_x_min, chunk_x_max, chunk_z_min, chunk_z_max, \
                block_x_min, block_x_max, block_z_min, block_z_max, \
                chunk_area, anchor_y, state, current_schematic_id, \
                price_credits, price_khash \
         FROM {fn_name}($1, $2, $3, $4, $5)"
    );
    let rows: Vec<OwnedLotRowDb> = sql_query(query)
        .bind::<Text, _>(world)
        .bind::<Integer, _>(limit)
        .bind::<Nullable<Integer>, _>(cursor.after_chunk_x)
        .bind::<Nullable<Integer>, _>(cursor.after_chunk_z)
        .bind::<Nullable<Text>, _>(cursor.after_lot_id.clone())
        .get_results(conn)
        .await
        .map_err(LotError::from_diesel)?;
    rows.into_iter()
        .map(|r| {
            let state = LotState::from_pg(r.state).ok_or_else(|| {
                LotError::InvalidArgument(format!("unknown lot_state: {}", r.state))
            })?;
            Ok(OwnedLotRow {
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
                state,
                current_schematic_id: r.current_schematic_id,
                price_credits: r.price_credits,
                price_khash: r.price_khash,
            })
        })
        .collect()
}

async fn list_viewport_async(
    conn: &mut AsyncPgConnection,
    world: &str,
    min_chunk_x: i32,
    max_chunk_x: i32,
    min_chunk_z: i32,
    max_chunk_z: i32,
    state_filter: Option<LotState>,
    limit: i32,
) -> Result<Vec<ViewportLotRow>> {
    let state_arg: Option<i16> = state_filter.map(|s| s as i16);
    let rows: Vec<ViewportLotRowDb> = sql_query(
        "SELECT lot_id, chunk_x_min, chunk_x_max, chunk_z_min, chunk_z_max, \
                block_x_min, block_x_max, block_z_min, block_z_max, \
                anchor_y, is_owned, is_owned_by_me, state, current_schematic_id \
         FROM public.proxy_list_lots_in_viewport($1, $2, $3, $4, $5, $6, $7)",
    )
    .bind::<Text, _>(world)
    .bind::<Integer, _>(min_chunk_x)
    .bind::<Integer, _>(max_chunk_x)
    .bind::<Integer, _>(min_chunk_z)
    .bind::<Integer, _>(max_chunk_z)
    .bind::<Nullable<SmallInt>, _>(state_arg)
    .bind::<Integer, _>(limit)
    .get_results(conn)
    .await
    .map_err(LotError::from_diesel)?;
    rows.into_iter()
        .map(|r| {
            let state = LotState::from_pg(r.state).ok_or_else(|| {
                LotError::InvalidArgument(format!("unknown lot_state: {}", r.state))
            })?;
            Ok(ViewportLotRow {
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
                state,
                current_schematic_id: r.current_schematic_id,
            })
        })
        .collect()
}

#[allow(dead_code)]
fn ts_to_string(ts: DateTime<Utc>) -> String {
    ts.to_rfc3339()
}
