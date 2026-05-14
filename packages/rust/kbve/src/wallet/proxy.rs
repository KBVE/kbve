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
struct BalanceRowDb {
    #[diesel(sql_type = diesel::sql_types::Uuid)]
    account_id: Uuid,
    #[diesel(sql_type = BigInt)]
    credits: i64,
    #[diesel(sql_type = BigInt)]
    khash: i64,
    #[diesel(sql_type = Timestamptz)]
    updated_at: DateTime<Utc>,
}

#[derive(QueryableByName)]
struct CouponSummaryDb {
    #[diesel(sql_type = BigInt)]
    coupon_id: i64,
    #[diesel(sql_type = Text)]
    template_code: String,
    #[diesel(sql_type = Text)]
    template_label: String,
    #[diesel(sql_type = Text)]
    reward_kind: String,
    #[diesel(sql_type = Jsonb)]
    reward_payload: serde_json::Value,
    #[diesel(sql_type = Text)]
    status: String,
    #[diesel(sql_type = Timestamptz)]
    granted_at: DateTime<Utc>,
    #[diesel(sql_type = Nullable<Timestamptz>)]
    expires_at: Option<DateTime<Utc>>,
    #[diesel(sql_type = Nullable<Timestamptz>)]
    redeemed_at: Option<DateTime<Utc>>,
}

#[derive(QueryableByName)]
struct RedeemRowDb {
    #[diesel(sql_type = Bool)]
    success: bool,
    #[diesel(sql_type = Text)]
    reward_kind: String,
    #[diesel(sql_type = Jsonb)]
    reward_payload: serde_json::Value,
    #[diesel(sql_type = BigInt)]
    ledger_id: i64,
}

impl WalletClient {
    /// Reads the caller's balance from the read-only pool. On
    /// `AccountMissing` (SQLSTATE WLT01), falls back to the rw pool's
    /// provisioning proxy, which is the historic write-path lazy
    /// provisioning. Both reads + writes are observable in the diesel
    /// pool metrics, so the rate of fallback indicates how often a user
    /// signup escaped the auth.users trigger or hit replica lag.
    pub async fn user_balance(&self, user_id: Uuid) -> Result<BalanceRow> {
        match self.read_user_balance(user_id).await {
            Ok(row) => Ok(row),
            Err(WalletError::AccountMissing) => self.write_user_balance(user_id).await,
            Err(e) => Err(e),
        }
    }

    async fn read_user_balance(&self, user_id: Uuid) -> Result<BalanceRow> {
        let mut conn = self.read().await?;
        let inner: &mut AsyncPgConnection = &mut *conn;
        inner
            .transaction::<BalanceRow, WalletError, _>(async |conn| {
                set_user_claims(conn, user_id).await?;
                balance_async_readonly(conn).await
            })
            .await
    }

    async fn write_user_balance(&self, user_id: Uuid) -> Result<BalanceRow> {
        let mut conn = self.write().await?;
        let inner: &mut AsyncPgConnection = &mut *conn;
        inner
            .transaction::<BalanceRow, WalletError, _>(async |conn| {
                set_user_claims(conn, user_id).await?;
                balance_async(conn).await
            })
            .await
    }

    pub async fn user_coupons(&self, user_id: Uuid) -> Result<Vec<CouponSummary>> {
        match self.read_user_coupons(user_id).await {
            Ok(rows) => Ok(rows),
            Err(WalletError::AccountMissing) => self.write_user_coupons(user_id).await,
            Err(e) => Err(e),
        }
    }

    async fn read_user_coupons(&self, user_id: Uuid) -> Result<Vec<CouponSummary>> {
        let mut conn = self.read().await?;
        let inner: &mut AsyncPgConnection = &mut *conn;
        inner
            .transaction::<Vec<CouponSummary>, WalletError, _>(async |conn| {
                set_user_claims(conn, user_id).await?;
                coupons_async_readonly(conn).await
            })
            .await
    }

    async fn write_user_coupons(&self, user_id: Uuid) -> Result<Vec<CouponSummary>> {
        let mut conn = self.write().await?;
        let inner: &mut AsyncPgConnection = &mut *conn;
        inner
            .transaction::<Vec<CouponSummary>, WalletError, _>(async |conn| {
                set_user_claims(conn, user_id).await?;
                coupons_async(conn).await
            })
            .await
    }

    pub async fn user_redeem_coupon(
        &self,
        user_id: Uuid,
        coupon_id: i64,
        idempotency_key: Uuid,
    ) -> Result<RedeemResult> {
        let mut conn = self.write().await?;
        let inner: &mut AsyncPgConnection = &mut *conn;
        inner
            .transaction::<RedeemResult, WalletError, _>(async |conn| {
                set_user_claims(conn, user_id).await?;
                redeem_async(conn, coupon_id, idempotency_key).await
            })
            .await
    }
}

async fn balance_async(conn: &mut AsyncPgConnection) -> Result<BalanceRow> {
    let row: BalanceRowDb = sql_query(
        "SELECT account_id, credits, khash, updated_at \
         FROM public.proxy_wallet_get_balance()",
    )
    .get_result(conn)
    .await
    .map_err(WalletError::from_diesel)?;

    Ok(BalanceRow {
        account_id: row.account_id,
        credits: row.credits,
        khash: row.khash,
        updated_at: row.updated_at,
    })
}

async fn balance_async_readonly(conn: &mut AsyncPgConnection) -> Result<BalanceRow> {
    let row: BalanceRowDb = sql_query(
        "SELECT account_id, credits, khash, updated_at \
         FROM public.proxy_wallet_get_balance_readonly()",
    )
    .get_result(conn)
    .await
    .map_err(WalletError::from_diesel)?;

    Ok(BalanceRow {
        account_id: row.account_id,
        credits: row.credits,
        khash: row.khash,
        updated_at: row.updated_at,
    })
}

async fn coupons_async(conn: &mut AsyncPgConnection) -> Result<Vec<CouponSummary>> {
    coupons_async_inner(conn, "public.proxy_wallet_list_coupons()").await
}

async fn coupons_async_readonly(conn: &mut AsyncPgConnection) -> Result<Vec<CouponSummary>> {
    coupons_async_inner(conn, "public.proxy_wallet_list_coupons_readonly()").await
}

async fn coupons_async_inner(
    conn: &mut AsyncPgConnection,
    fn_call: &str,
) -> Result<Vec<CouponSummary>> {
    let query = format!(
        "SELECT coupon_id, template_code, template_label, \
                reward_kind::text AS reward_kind, reward_payload, \
                status::text AS status, granted_at, expires_at, redeemed_at \
         FROM {fn_call}"
    );
    let rows: Vec<CouponSummaryDb> = sql_query(query)
        .get_results(conn)
        .await
        .map_err(WalletError::from_diesel)?;

    rows.into_iter()
        .map(|r| {
            let reward_kind = RewardKind::from_pg(&r.reward_kind).ok_or_else(|| {
                WalletError::InvalidArgument(format!("unknown reward_kind: {}", r.reward_kind))
            })?;
            let status = CouponStatus::from_pg(&r.status).ok_or_else(|| {
                WalletError::InvalidArgument(format!("unknown coupon status: {}", r.status))
            })?;
            Ok(CouponSummary {
                coupon_id: r.coupon_id,
                template_code: r.template_code,
                template_label: r.template_label,
                reward_kind,
                reward_payload: r.reward_payload,
                status,
                granted_at: r.granted_at,
                expires_at: r.expires_at,
                redeemed_at: r.redeemed_at,
            })
        })
        .collect()
}

async fn redeem_async(
    conn: &mut AsyncPgConnection,
    coupon_id: i64,
    idempotency_key: Uuid,
) -> Result<RedeemResult> {
    let row: RedeemRowDb = sql_query(
        "SELECT success, reward_kind::text AS reward_kind, reward_payload, ledger_id \
         FROM public.proxy_wallet_redeem_coupon($1, $2)",
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
