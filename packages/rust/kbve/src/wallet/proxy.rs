//! Authenticated-user wallet operations.
//!
//! Mirrors the `public.proxy_wallet_*` functions. Each call sets
//! `request.jwt.claims` for the session so `auth.uid()` resolves to the
//! caller's user id; this lets the SECURITY DEFINER proxy land in the right
//! account.
//!
//! Note: the connection role still authenticates as `service_role` (or
//! superuser) — we are not switching roles, just shimming the JWT claim
//! that the proxy functions read with `auth.uid()`.

use chrono::{DateTime, Utc};
use diesel::prelude::*;
use diesel::sql_query;
use diesel::sql_types::{BigInt, Bool, Jsonb, Nullable, Text, Timestamptz};
use uuid::Uuid;

use super::client::{WalletClient, WalletConn};
use super::error::{Result, WalletError};
use super::types::*;

// ---------------------------------------------------------------------------
// QueryableByName rows
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// User-facing proxy operations
// ---------------------------------------------------------------------------

impl WalletClient {
    /// `public.proxy_wallet_get_balance()` — returns the caller's balance.
    /// Lazily provisions the account + welcome coupon on first call.
    pub async fn user_balance(&self, user_id: Uuid) -> Result<BalanceRow> {
        self.run_as_user(user_id, |conn| balance_blocking(conn))
            .await
    }

    /// `public.proxy_wallet_list_coupons()` — returns the caller's coupons.
    pub async fn user_coupons(&self, user_id: Uuid) -> Result<Vec<CouponSummary>> {
        self.run_as_user(user_id, |conn| coupons_blocking(conn))
            .await
    }

    /// `public.proxy_wallet_redeem_coupon(coupon_id, idempotency_key)` —
    /// auth-checked ownership + idempotent at the coupon layer.
    pub async fn user_redeem_coupon(
        &self,
        user_id: Uuid,
        coupon_id: i64,
        idempotency_key: Uuid,
    ) -> Result<RedeemResult> {
        self.run_as_user(user_id, move |conn| {
            redeem_blocking(conn, coupon_id, idempotency_key)
        })
        .await
    }
}

// ---------------------------------------------------------------------------
// Blocking implementations
// ---------------------------------------------------------------------------

fn balance_blocking(conn: &mut WalletConn) -> Result<BalanceRow> {
    let row: BalanceRowDb = sql_query(
        "SELECT account_id, credits, khash, updated_at \
         FROM public.proxy_wallet_get_balance()",
    )
    .get_result(conn)
    .map_err(WalletError::from_diesel)?;

    Ok(BalanceRow {
        account_id: row.account_id,
        credits: row.credits,
        khash: row.khash,
        updated_at: row.updated_at,
    })
}

fn coupons_blocking(conn: &mut WalletConn) -> Result<Vec<CouponSummary>> {
    let rows: Vec<CouponSummaryDb> = sql_query(
        "SELECT coupon_id, template_code, template_label, \
                reward_kind::text AS reward_kind, reward_payload, \
                status::text AS status, granted_at, expires_at, redeemed_at \
         FROM public.proxy_wallet_list_coupons()",
    )
    .get_results(conn)
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

fn redeem_blocking(
    conn: &mut WalletConn,
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
