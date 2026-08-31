use chrono::{DateTime, Utc};
use diesel::QueryableByName;
use diesel::result::OptionalExtension;
use diesel::sql_query;
use diesel::sql_types::{BigInt, Bool, Integer, Jsonb, Nullable, SmallInt, Text, Timestamptz};
use diesel_async::{AsyncConnection, AsyncPgConnection, RunQueryDsl};
use uuid::Uuid;

use super::client::{WalletClient, set_user_claims};
use super::error::{Result, WalletError};
use super::types::*;

#[derive(QueryableByName)]
struct LedgerIdRow {
    #[diesel(sql_type = BigInt)]
    id: i64,
}

#[derive(QueryableByName)]
struct RedeemRow {
    #[diesel(sql_type = Bool)]
    success: bool,
    #[diesel(sql_type = Text)]
    reward_kind: String,
    #[diesel(sql_type = Jsonb)]
    reward_payload: serde_json::Value,
    #[diesel(sql_type = BigInt)]
    ledger_id: i64,
}

#[derive(QueryableByName)]
struct VerifyBalanceRowDb {
    #[diesel(sql_type = diesel::sql_types::Uuid)]
    account_id: Uuid,
    #[diesel(sql_type = BigInt)]
    stored_credits: i64,
    #[diesel(sql_type = BigInt)]
    ledger_credits: i64,
    #[diesel(sql_type = BigInt)]
    stored_khash: i64,
    #[diesel(sql_type = BigInt)]
    ledger_khash: i64,
    #[diesel(sql_type = Bool)]
    ok: bool,
}

#[derive(QueryableByName)]
struct RevokedRow {
    #[diesel(sql_type = Bool)]
    revoked: bool,
}

impl WalletClient {
    pub async fn credit(&self, req: CreditRequest) -> Result<i64> {
        let mut conn = self.write().await?;
        credit_async(&mut conn, req).await
    }

    pub async fn debit(&self, req: DebitRequest) -> Result<i64> {
        let mut conn = self.write().await?;
        debit_async(&mut conn, req).await
    }

    pub async fn transfer(&self, req: TransferRequest) -> Result<()> {
        let mut conn = self.write().await?;
        transfer_async(&mut conn, req).await
    }

    pub async fn service_account_for_user(&self, user_id: Uuid) -> Result<Uuid> {
        let mut conn = self.write().await?;
        let inner: &mut AsyncPgConnection = &mut conn;
        inner
            .transaction::<Uuid, WalletError, _>(async |conn| {
                set_user_claims(conn, user_id).await?;
                #[derive(QueryableByName)]
                struct AccountRow {
                    #[diesel(sql_type = diesel::sql_types::Uuid)]
                    account_id: Uuid,
                }
                let r: AccountRow =
                    sql_query("SELECT wallet.proxy_ensure_user_account() AS account_id")
                        .get_result(conn)
                        .await
                        .map_err(WalletError::from_diesel)?;
                Ok(r.account_id)
            })
            .await
    }

    /// Resolve a Discord snowflake to its linked KBVE `user_id`, or `None`
    /// when no `auth.identities` discord row exists. Read-only; delegates to
    /// the service_role-owned `tracker.find_claim_identity_by_discord_id`.
    pub async fn user_for_discord_id(&self, discord_id: &str) -> Result<Option<Uuid>> {
        let mut conn = self.read().await?;
        #[derive(QueryableByName)]
        struct UserRow {
            #[diesel(sql_type = diesel::sql_types::Uuid)]
            user_id: Uuid,
        }
        let row: Option<UserRow> =
            sql_query("SELECT user_id FROM tracker.find_claim_identity_by_discord_id($1)")
                .bind::<Text, _>(discord_id)
                .get_result(&mut conn)
                .await
                .optional()
                .map_err(WalletError::from_diesel)?;
        Ok(row.map(|r| r.user_id))
    }

    /// Look up an existing `kind='user'` wallet account for a Supabase user,
    /// WITHOUT creating one. Returns `None` when the user has never had a
    /// wallet — a debit against a non-existent balance is a no-funds case, not
    /// an onboarding trigger (unlike [`Self::service_account_for_user`]).
    pub async fn account_for_user_readonly(&self, user_id: Uuid) -> Result<Option<Uuid>> {
        let mut conn = self.read().await?;
        #[derive(QueryableByName)]
        struct AccountRow {
            #[diesel(sql_type = diesel::sql_types::Uuid)]
            account_id: Uuid,
        }
        let row: Option<AccountRow> = sql_query(
            "SELECT id AS account_id FROM wallet.account \
             WHERE kind = 'user' AND user_id = $1 LIMIT 1",
        )
        .bind::<diesel::sql_types::Uuid, _>(user_id)
        .get_result(&mut conn)
        .await
        .optional()
        .map_err(WalletError::from_diesel)?;
        Ok(row.map(|r| r.account_id))
    }

    pub async fn redeem_coupon(
        &self,
        coupon_id: i64,
        idempotency_key: Uuid,
    ) -> Result<RedeemResult> {
        let mut conn = self.write().await?;
        redeem_async(&mut conn, coupon_id, idempotency_key).await
    }

    pub async fn revoke_coupon(&self, coupon_id: i64, reason: Option<String>) -> Result<bool> {
        let mut conn = self.write().await?;
        revoke_async(&mut conn, coupon_id, reason).await
    }

    pub async fn verify_balance(&self, account_id: Uuid) -> Result<VerifyBalanceRow> {
        let mut conn = self.read().await?;
        verify_async(&mut conn, account_id).await
    }

    pub async fn firecracker_active_hold_total(&self, account_id: Uuid) -> Result<i64> {
        let mut conn = self.read().await?;
        firecracker_active_hold_total_async(&mut conn, account_id).await
    }

    pub async fn firecracker_place_hold(
        &self,
        req: FirecrackerPlaceHoldRequest,
    ) -> Result<FirecrackerHoldRow> {
        let mut conn = self.write().await?;
        firecracker_place_hold_async(&mut conn, req).await
    }

    pub async fn firecracker_settle(
        &self,
        req: FirecrackerSettleRequest,
    ) -> Result<FirecrackerSettleResult> {
        let mut conn = self.write().await?;
        firecracker_settle_async(&mut conn, req).await
    }

    pub async fn firecracker_update_watermark(
        &self,
        vm_id: &str,
        watermark: i64,
    ) -> Result<FirecrackerHoldRow> {
        let mut conn = self.write().await?;
        firecracker_update_watermark_async(&mut conn, vm_id, watermark).await
    }

    pub async fn firecracker_record_deployment(
        &self,
        req: FirecrackerRecordDeploymentRequest,
    ) -> Result<FirecrackerDeploymentRow> {
        let mut conn = self.write().await?;
        firecracker_record_deployment_async(&mut conn, req).await
    }

    pub async fn firecracker_mark_destroyed(
        &self,
        req: FirecrackerMarkDestroyedRequest,
    ) -> Result<FirecrackerDeploymentRow> {
        let mut conn = self.write().await?;
        firecracker_mark_destroyed_async(&mut conn, req).await
    }

    pub async fn firecracker_my_deployments(
        &self,
        account_id: Uuid,
        limit: i32,
        offset: i32,
        live_only: bool,
    ) -> Result<Vec<FirecrackerDeploymentRow>> {
        let mut conn = self.read().await?;
        firecracker_my_deployments_async(&mut conn, account_id, limit, offset, live_only).await
    }

    pub async fn firecracker_deployment_stats(
        &self,
        account_id: Uuid,
    ) -> Result<FirecrackerDeploymentStats> {
        let mut conn = self.read().await?;
        firecracker_deployment_stats_async(&mut conn, account_id).await
    }
}

async fn credit_async(conn: &mut AsyncPgConnection, req: CreditRequest) -> Result<i64> {
    let row: LedgerIdRow = sql_query(
        "SELECT wallet.service_credit($1, $2::wallet.currency_kind, $3, \
         $4::wallet.source_kind, $5, $6, $7, $8) AS id",
    )
    .bind::<diesel::sql_types::Uuid, _>(req.account_id)
    .bind::<Text, _>(req.currency.as_pg())
    .bind::<BigInt, _>(req.amount)
    .bind::<Text, _>(req.source_kind.as_pg())
    .bind::<Nullable<Text>, _>(req.reason)
    .bind::<Nullable<Text>, _>(req.ref_type)
    .bind::<Nullable<BigInt>, _>(req.ref_id)
    .bind::<diesel::sql_types::Uuid, _>(req.idempotency_key)
    .get_result(conn)
    .await
    .map_err(WalletError::from_diesel)?;
    Ok(row.id)
}

async fn debit_async(conn: &mut AsyncPgConnection, req: DebitRequest) -> Result<i64> {
    let row: LedgerIdRow = sql_query(
        "SELECT wallet.service_debit($1, $2::wallet.currency_kind, $3, \
         $4::wallet.source_kind, $5, $6, $7, $8) AS id",
    )
    .bind::<diesel::sql_types::Uuid, _>(req.account_id)
    .bind::<Text, _>(req.currency.as_pg())
    .bind::<BigInt, _>(req.amount)
    .bind::<Text, _>(req.source_kind.as_pg())
    .bind::<Nullable<Text>, _>(req.reason)
    .bind::<Nullable<Text>, _>(req.ref_type)
    .bind::<Nullable<BigInt>, _>(req.ref_id)
    .bind::<diesel::sql_types::Uuid, _>(req.idempotency_key)
    .get_result(conn)
    .await
    .map_err(WalletError::from_diesel)?;
    Ok(row.id)
}

async fn transfer_async(conn: &mut AsyncPgConnection, req: TransferRequest) -> Result<()> {
    sql_query(
        "SELECT wallet.service_transfer($1, $2, $3::wallet.currency_kind, $4, \
         $5::wallet.source_kind, $6, $7, $8, $9)",
    )
    .bind::<diesel::sql_types::Uuid, _>(req.from_account)
    .bind::<diesel::sql_types::Uuid, _>(req.to_account)
    .bind::<Text, _>(req.currency.as_pg())
    .bind::<BigInt, _>(req.amount)
    .bind::<Text, _>(req.source_kind.as_pg())
    .bind::<Nullable<Text>, _>(req.reason)
    .bind::<Nullable<Text>, _>(req.ref_type)
    .bind::<Nullable<BigInt>, _>(req.ref_id)
    .bind::<diesel::sql_types::Uuid, _>(req.idempotency_key)
    .execute(conn)
    .await
    .map_err(WalletError::from_diesel)?;
    Ok(())
}

async fn redeem_async(
    conn: &mut AsyncPgConnection,
    coupon_id: i64,
    idempotency_key: Uuid,
) -> Result<RedeemResult> {
    let row: RedeemRow = sql_query(
        "SELECT success, reward_kind::text AS reward_kind, reward_payload, ledger_id \
         FROM wallet.service_redeem_coupon($1, $2)",
    )
    .bind::<BigInt, _>(coupon_id)
    .bind::<diesel::sql_types::Uuid, _>(idempotency_key)
    .get_result(conn)
    .await
    .map_err(WalletError::from_diesel)?;

    let reward_kind = RewardKind::from_pg(&row.reward_kind).ok_or_else(|| {
        WalletError::InvalidArgument(format!("unknown reward_kind: {}", row.reward_kind))
    })?;
    Ok(RedeemResult {
        success: row.success,
        reward_kind,
        reward_payload: row.reward_payload,
        ledger_id: row.ledger_id,
    })
}

async fn revoke_async(
    conn: &mut AsyncPgConnection,
    coupon_id: i64,
    reason: Option<String>,
) -> Result<bool> {
    let row: RevokedRow = sql_query("SELECT wallet.service_revoke_coupon($1, $2) AS revoked")
        .bind::<BigInt, _>(coupon_id)
        .bind::<Nullable<Text>, _>(reason)
        .get_result(conn)
        .await
        .map_err(WalletError::from_diesel)?;
    Ok(row.revoked)
}

async fn verify_async(conn: &mut AsyncPgConnection, account_id: Uuid) -> Result<VerifyBalanceRow> {
    let row: VerifyBalanceRowDb = sql_query(
        "SELECT account_id, stored_credits, ledger_credits, \
                stored_khash, ledger_khash, ok \
         FROM wallet.service_verify_balance($1)",
    )
    .bind::<diesel::sql_types::Uuid, _>(account_id)
    .get_result(conn)
    .await
    .map_err(WalletError::from_diesel)?;
    Ok(VerifyBalanceRow {
        account_id: row.account_id,
        stored_credits: row.stored_credits,
        ledger_credits: row.ledger_credits,
        stored_khash: row.stored_khash,
        ledger_khash: row.ledger_khash,
        ok: row.ok,
    })
}

#[derive(QueryableByName)]
struct FirecrackerActiveHoldRow {
    #[diesel(sql_type = BigInt)]
    total: i64,
}

#[derive(QueryableByName)]
struct FirecrackerHoldRowDb {
    #[diesel(sql_type = Text)]
    vm_id: String,
    #[diesel(sql_type = diesel::sql_types::Uuid)]
    account_id: Uuid,
    #[diesel(sql_type = BigInt)]
    amount: i64,
    #[diesel(sql_type = BigInt)]
    watermark: i64,
    #[diesel(sql_type = Timestamptz)]
    created_at: DateTime<Utc>,
    #[diesel(sql_type = Timestamptz)]
    updated_at: DateTime<Utc>,
}

impl From<FirecrackerHoldRowDb> for FirecrackerHoldRow {
    fn from(r: FirecrackerHoldRowDb) -> Self {
        Self {
            vm_id: r.vm_id,
            account_id: r.account_id,
            amount: r.amount,
            watermark: r.watermark,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }
    }
}

#[derive(QueryableByName)]
struct FirecrackerSettleResultDb {
    #[diesel(sql_type = Text)]
    status: String,
    #[diesel(sql_type = Nullable<BigInt>)]
    ledger_id: Option<i64>,
    #[diesel(sql_type = Nullable<diesel::sql_types::Uuid>)]
    account_id: Option<Uuid>,
    #[diesel(sql_type = BigInt)]
    reserved_amount: i64,
    #[diesel(sql_type = BigInt)]
    debited_amount: i64,
    #[diesel(sql_type = BigInt)]
    released_amount: i64,
}

async fn firecracker_active_hold_total_async(
    conn: &mut AsyncPgConnection,
    account_id: Uuid,
) -> Result<i64> {
    let row: FirecrackerActiveHoldRow =
        sql_query("SELECT wallet.firecracker_active_hold_total($1) AS total")
            .bind::<diesel::sql_types::Uuid, _>(account_id)
            .get_result(conn)
            .await
            .map_err(WalletError::from_diesel)?;
    Ok(row.total)
}

async fn firecracker_place_hold_async(
    conn: &mut AsyncPgConnection,
    req: FirecrackerPlaceHoldRequest,
) -> Result<FirecrackerHoldRow> {
    let row: FirecrackerHoldRowDb = sql_query(
        "SELECT vm_id, account_id, amount, watermark, created_at, updated_at \
         FROM (SELECT wallet.firecracker_place_hold($1, $2, $3) AS h) s, \
              LATERAL (SELECT (s.h).*) t",
    )
    .bind::<diesel::sql_types::Uuid, _>(req.account_id)
    .bind::<Text, _>(req.vm_id)
    .bind::<BigInt, _>(req.amount)
    .get_result(conn)
    .await
    .map_err(WalletError::from_diesel)?;
    Ok(row.into())
}

async fn firecracker_settle_async(
    conn: &mut AsyncPgConnection,
    req: FirecrackerSettleRequest,
) -> Result<FirecrackerSettleResult> {
    let row: FirecrackerSettleResultDb = sql_query(
        "SELECT status, ledger_id, account_id, reserved_amount, debited_amount, released_amount \
         FROM wallet.firecracker_settle($1, $2, $3, $4)",
    )
    .bind::<Text, _>(req.vm_id)
    .bind::<BigInt, _>(req.final_amount)
    .bind::<diesel::sql_types::Uuid, _>(req.idempotency_key)
    .bind::<Nullable<Text>, _>(req.reason)
    .get_result(conn)
    .await
    .map_err(WalletError::from_diesel)?;
    let status = FirecrackerSettleStatus::from_pg(&row.status).ok_or_else(|| {
        WalletError::InvalidArgument(format!("unknown settle status: {}", row.status))
    })?;
    Ok(FirecrackerSettleResult {
        status,
        ledger_id: row.ledger_id,
        account_id: row.account_id,
        reserved_amount: row.reserved_amount,
        debited_amount: row.debited_amount,
        released_amount: row.released_amount,
    })
}

async fn firecracker_update_watermark_async(
    conn: &mut AsyncPgConnection,
    vm_id: &str,
    watermark: i64,
) -> Result<FirecrackerHoldRow> {
    let row: FirecrackerHoldRowDb = sql_query(
        "SELECT vm_id, account_id, amount, watermark, created_at, updated_at \
         FROM (SELECT wallet.firecracker_update_watermark($1, $2) AS h) s, \
              LATERAL (SELECT (s.h).*) t",
    )
    .bind::<Text, _>(vm_id)
    .bind::<BigInt, _>(watermark)
    .get_result(conn)
    .await
    .map_err(WalletError::from_diesel)?;
    Ok(row.into())
}

#[derive(QueryableByName)]
struct FirecrackerDeploymentRowDb {
    #[diesel(sql_type = BigInt)]
    id: i64,
    #[diesel(sql_type = Text)]
    vm_id: String,
    #[diesel(sql_type = diesel::sql_types::Uuid)]
    account_id: Uuid,
    #[diesel(sql_type = Text)]
    rootfs: String,
    #[diesel(sql_type = Text)]
    entrypoint: String,
    #[diesel(sql_type = Integer)]
    http_port: i32,
    #[diesel(sql_type = Text)]
    visibility: String,
    #[diesel(sql_type = SmallInt)]
    vcpu_count: i16,
    #[diesel(sql_type = Integer)]
    mem_size_mib: i32,
    #[diesel(sql_type = Integer)]
    idle_ttl_secs: i32,
    #[diesel(sql_type = Jsonb)]
    spec: serde_json::Value,
    #[diesel(sql_type = Timestamptz)]
    created_at: DateTime<Utc>,
    #[diesel(sql_type = Nullable<Timestamptz>)]
    destroyed_at: Option<DateTime<Utc>>,
    #[diesel(sql_type = Nullable<Text>)]
    destroy_reason: Option<String>,
    #[diesel(sql_type = Nullable<BigInt>)]
    settled_ledger_id: Option<i64>,
    #[diesel(sql_type = Nullable<BigInt>)]
    credits_spent: Option<i64>,
}

impl TryFrom<FirecrackerDeploymentRowDb> for FirecrackerDeploymentRow {
    type Error = WalletError;

    fn try_from(r: FirecrackerDeploymentRowDb) -> Result<Self> {
        let visibility =
            FirecrackerDeploymentVisibility::from_pg(&r.visibility).ok_or_else(|| {
                WalletError::InvalidArgument(format!("unknown visibility: {}", r.visibility))
            })?;
        let destroy_reason = match r.destroy_reason {
            Some(reason) => Some(FirecrackerDestroyReason::from_pg(&reason).ok_or_else(|| {
                WalletError::InvalidArgument(format!("unknown destroy_reason: {reason}"))
            })?),
            None => None,
        };
        Ok(Self {
            id: r.id,
            vm_id: r.vm_id,
            account_id: r.account_id,
            rootfs: r.rootfs,
            entrypoint: r.entrypoint,
            http_port: r.http_port,
            visibility,
            vcpu_count: r.vcpu_count,
            mem_size_mib: r.mem_size_mib,
            idle_ttl_secs: r.idle_ttl_secs,
            spec: r.spec,
            created_at: r.created_at,
            destroyed_at: r.destroyed_at,
            destroy_reason,
            settled_ledger_id: r.settled_ledger_id,
            credits_spent: r.credits_spent,
        })
    }
}

const FC_DEPLOYMENT_COLUMNS: &str = "id, vm_id, account_id, rootfs, entrypoint, http_port, \
    visibility, vcpu_count, mem_size_mib, idle_ttl_secs, spec, created_at, destroyed_at, \
    destroy_reason, settled_ledger_id, credits_spent";

async fn firecracker_record_deployment_async(
    conn: &mut AsyncPgConnection,
    req: FirecrackerRecordDeploymentRequest,
) -> Result<FirecrackerDeploymentRow> {
    let sql = format!(
        "SELECT {cols} \
         FROM (SELECT wallet.firecracker_record_deployment(\
                $1, $2, $3, $4, $5, $6, $7::smallint, $8, $9, $10) AS d) s, \
              LATERAL (SELECT (s.d).*) t",
        cols = FC_DEPLOYMENT_COLUMNS
    );
    let row: FirecrackerDeploymentRowDb = sql_query(sql)
        .bind::<Text, _>(req.vm_id)
        .bind::<diesel::sql_types::Uuid, _>(req.account_id)
        .bind::<Text, _>(req.rootfs)
        .bind::<Text, _>(req.entrypoint)
        .bind::<Integer, _>(req.http_port)
        .bind::<Text, _>(req.visibility.as_pg())
        .bind::<SmallInt, _>(req.vcpu_count)
        .bind::<Integer, _>(req.mem_size_mib)
        .bind::<Integer, _>(req.idle_ttl_secs)
        .bind::<Jsonb, _>(req.spec)
        .get_result(conn)
        .await
        .map_err(WalletError::from_diesel)?;
    row.try_into()
}

async fn firecracker_mark_destroyed_async(
    conn: &mut AsyncPgConnection,
    req: FirecrackerMarkDestroyedRequest,
) -> Result<FirecrackerDeploymentRow> {
    let sql = format!(
        "SELECT {cols} \
         FROM (SELECT wallet.firecracker_mark_destroyed($1, $2, $3, $4) AS d) s, \
              LATERAL (SELECT (s.d).*) t",
        cols = FC_DEPLOYMENT_COLUMNS
    );
    let row: FirecrackerDeploymentRowDb = sql_query(sql)
        .bind::<Text, _>(req.vm_id)
        .bind::<Text, _>(req.destroy_reason.as_pg())
        .bind::<Nullable<BigInt>, _>(req.settled_ledger_id)
        .bind::<Nullable<BigInt>, _>(req.credits_spent)
        .get_result(conn)
        .await
        .map_err(WalletError::from_diesel)?;
    row.try_into()
}

async fn firecracker_my_deployments_async(
    conn: &mut AsyncPgConnection,
    account_id: Uuid,
    limit: i32,
    offset: i32,
    live_only: bool,
) -> Result<Vec<FirecrackerDeploymentRow>> {
    let rows: Vec<FirecrackerDeploymentRowDb> =
        sql_query("SELECT * FROM wallet.firecracker_my_deployments($1, $2, $3, $4)")
            .bind::<diesel::sql_types::Uuid, _>(account_id)
            .bind::<Integer, _>(limit)
            .bind::<Integer, _>(offset)
            .bind::<Bool, _>(live_only)
            .get_results(conn)
            .await
            .map_err(WalletError::from_diesel)?;
    rows.into_iter()
        .map(FirecrackerDeploymentRow::try_from)
        .collect()
}

#[derive(QueryableByName)]
struct FirecrackerDeploymentStatsDb {
    #[diesel(sql_type = BigInt)]
    total_deployments: i64,
    #[diesel(sql_type = BigInt)]
    live_deployments: i64,
    #[diesel(sql_type = BigInt)]
    total_credits_spent: i64,
    #[diesel(sql_type = Nullable<Timestamptz>)]
    earliest_deployment_at: Option<DateTime<Utc>>,
    #[diesel(sql_type = Nullable<Timestamptz>)]
    latest_deployment_at: Option<DateTime<Utc>>,
}

async fn firecracker_deployment_stats_async(
    conn: &mut AsyncPgConnection,
    account_id: Uuid,
) -> Result<FirecrackerDeploymentStats> {
    let row: FirecrackerDeploymentStatsDb =
        sql_query("SELECT * FROM wallet.firecracker_deployment_stats($1)")
            .bind::<diesel::sql_types::Uuid, _>(account_id)
            .get_result(conn)
            .await
            .map_err(WalletError::from_diesel)?;
    Ok(FirecrackerDeploymentStats {
        total_deployments: row.total_deployments,
        live_deployments: row.live_deployments,
        total_credits_spent: row.total_credits_spent,
        earliest_deployment_at: row.earliest_deployment_at,
        latest_deployment_at: row.latest_deployment_at,
    })
}
