//! Service-side wallet operations.
//!
//! Each fn calls the matching `wallet.service_*` SECURITY DEFINER function
//! via `diesel::sql_query`. Bind params are passed as TEXT for enums (cast
//! server-side) and explicit diesel types for everything else. Errors are
//! normalized through [`WalletError::from_diesel`].

use diesel::prelude::*;
use diesel::sql_query;
use diesel::sql_types::{BigInt, Bool, Jsonb, Nullable, Text};
use uuid::Uuid;

use super::client::{WalletClient, WalletConn};
use super::error::{Result, WalletError};
use super::types::*;

// ---------------------------------------------------------------------------
// QueryableByName rows
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Service operations
// ---------------------------------------------------------------------------

impl WalletClient {
    /// `wallet.service_credit(...)` — positive delta. Returns ledger id.
    pub async fn credit(&self, req: CreditRequest) -> Result<i64> {
        self.run_service(move |conn| credit_blocking(conn, req))
            .await
    }

    /// `wallet.service_debit(...)` — positive p_amount, becomes negative delta.
    /// Raises [`WalletError::InsufficientFunds`] when balance would go negative.
    pub async fn debit(&self, req: DebitRequest) -> Result<i64> {
        self.run_service(move |conn| debit_blocking(conn, req))
            .await
    }

    /// `wallet.service_transfer(...)` — atomic debit + credit with
    /// canonical-order advisory locking.
    pub async fn transfer(&self, req: TransferRequest) -> Result<()> {
        self.run_service(move |conn| transfer_blocking(conn, req))
            .await
    }

    /// `wallet.service_redeem_coupon(coupon_id, idempotency_key)`.
    /// Idempotent at the coupon layer: same key replays return the original
    /// ledger id instead of raising.
    pub async fn redeem_coupon(
        &self,
        coupon_id: i64,
        idempotency_key: Uuid,
    ) -> Result<RedeemResult> {
        self.run_service(move |conn| redeem_blocking(conn, coupon_id, idempotency_key))
            .await
    }

    /// `wallet.service_revoke_coupon(coupon_id, reason)`. Returns false on
    /// already-revoked, raises on redeemed.
    pub async fn revoke_coupon(&self, coupon_id: i64, reason: Option<String>) -> Result<bool> {
        self.run_service(move |conn| revoke_blocking(conn, coupon_id, reason))
            .await
    }

    /// `wallet.service_verify_balance(account_id)` — compares stored balance
    /// against ledger sum per currency. `ok=true` means consistent.
    pub async fn verify_balance(&self, account_id: Uuid) -> Result<VerifyBalanceRow> {
        self.run_service(move |conn| verify_blocking(conn, account_id))
            .await
    }
}

// ---------------------------------------------------------------------------
// Blocking implementations
// ---------------------------------------------------------------------------

fn credit_blocking(conn: &mut WalletConn, req: CreditRequest) -> Result<i64> {
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
    .map_err(WalletError::from_diesel)?;
    Ok(row.id)
}

fn debit_blocking(conn: &mut WalletConn, req: DebitRequest) -> Result<i64> {
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
    .map_err(WalletError::from_diesel)?;
    Ok(row.id)
}

fn transfer_blocking(conn: &mut WalletConn, req: TransferRequest) -> Result<()> {
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
    .map_err(WalletError::from_diesel)?;
    Ok(())
}

fn redeem_blocking(
    conn: &mut WalletConn,
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

fn revoke_blocking(conn: &mut WalletConn, coupon_id: i64, reason: Option<String>) -> Result<bool> {
    let row: RevokedRow = sql_query("SELECT wallet.service_revoke_coupon($1, $2) AS revoked")
        .bind::<BigInt, _>(coupon_id)
        .bind::<Nullable<Text>, _>(reason)
        .get_result(conn)
        .map_err(WalletError::from_diesel)?;
    Ok(row.revoked)
}

fn verify_blocking(conn: &mut WalletConn, account_id: Uuid) -> Result<VerifyBalanceRow> {
    let row: VerifyBalanceRowDb = sql_query(
        "SELECT account_id, stored_credits, ledger_credits, \
                stored_khash, ledger_khash, ok \
         FROM wallet.service_verify_balance($1)",
    )
    .bind::<diesel::sql_types::Uuid, _>(account_id)
    .get_result(conn)
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
