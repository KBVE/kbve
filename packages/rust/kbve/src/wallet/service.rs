use chrono::{DateTime, Utc};
use diesel::QueryableByName;
use diesel::sql_query;
use diesel::sql_types::{BigInt, Bool, Jsonb, Nullable, Text, Timestamptz};
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
        let inner: &mut AsyncPgConnection = &mut *conn;
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
