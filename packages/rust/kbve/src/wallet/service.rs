use diesel::QueryableByName;
use diesel::sql_query;
use diesel::sql_types::{BigInt, Bool, Jsonb, Nullable, Text};
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
