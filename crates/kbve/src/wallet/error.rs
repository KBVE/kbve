//! Typed errors emitted by the wallet client.
//!
//! Maps Postgres SQLSTATEs raised by the `wallet.service_*` / `public.proxy_wallet_*`
//! functions to dedicated variants. The mapping is conservative: SQLSTATEs that
//! diesel surfaces as `DatabaseErrorKind` are matched on the kind; the rest are
//! matched against the exception message prefix the SQL functions raise.

use diesel::result::{DatabaseErrorKind, Error as DieselError};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum WalletError {
    #[error("insufficient funds")]
    InsufficientFunds,

    #[error("idempotency_key reused with different payload")]
    ReplayMismatch,

    #[error("balance overflow")]
    Overflow,

    #[error("not authorized")]
    NotAuthorized,

    #[error("not authenticated")]
    NotAuthenticated,

    #[error("wallet account missing for caller")]
    AccountMissing,

    #[error("null argument: {0}")]
    NullArgument(String),

    #[error("invalid argument: {0}")]
    InvalidArgument(String),

    #[error("not found: {0}")]
    NotFound(String),

    #[error("coupon not redeemable: {0}")]
    CouponNotRedeemable(String),

    #[error("coupon expired")]
    CouponExpired,

    #[error("feature not implemented: {0}")]
    Unimplemented(String),

    #[error("mfa required for this transition")]
    MfaRequired,

    #[error("pool error: {0}")]
    Pool(String),

    #[error(transparent)]
    Db(#[from] DieselError),
}

impl WalletError {
    /// Best-effort mapping from a diesel error to a typed variant.
    ///
    /// Strategy:
    ///   1. If the underlying `DatabaseErrorKind` is one of the well-known
    ///      mapped ones (UniqueViolation, SerializationFailure, …), use it.
    ///   2. Otherwise inspect the exception message prefix that our SQL
    ///      functions raise (e.g. "insufficient funds").
    ///   3. Fall back to the raw `DieselError` in the `Db` variant.
    pub fn from_diesel(e: DieselError) -> Self {
        if let DieselError::DatabaseError(_, ref info) = e {
            // SQLSTATE WLT01 surfaces as one of these messages raised by
            // public.proxy_wallet_*_readonly. diesel's
            // DatabaseErrorInformation doesn't expose the SQLSTATE on this
            // diesel version, so we match on the message string instead.
            // wallet_account_duplicate (WLT02) is intentionally not mapped
            // here: it indicates a broken wallet_account_user_uq invariant
            // that needs human intervention, so it falls through to the
            // generic Db variant and surfaces as a 500.
            match info.message() {
                "wallet_account_missing" | "wallet_balance_missing" => {
                    return WalletError::AccountMissing;
                }
                _ => {}
            }
        }
        if let DieselError::DatabaseError(kind, ref info) = e {
            // First pass: structural kinds that map cleanly.
            match kind {
                DatabaseErrorKind::SerializationFailure => {
                    return WalletError::ReplayMismatch;
                }
                DatabaseErrorKind::ForeignKeyViolation => {
                    // Our SQL raises 23503 for "coupon not found" /
                    // "account has no balance row" pre-debit.
                    return WalletError::NotFound(info.message().to_string());
                }
                DatabaseErrorKind::CheckViolation => {
                    // Balance check, ledger.delta<>0, coupon state checks, etc.
                    return WalletError::InvalidArgument(info.message().to_string());
                }
                DatabaseErrorKind::NotNullViolation => {
                    return WalletError::NullArgument(info.message().to_string());
                }
                _ => {}
            }

            // Second pass: prefix-match against the raised messages our SQL uses.
            let msg = info.message();
            return classify_message(msg).unwrap_or(WalletError::Db(e));
        }

        WalletError::Db(e)
    }
}

fn classify_message(msg: &str) -> Option<WalletError> {
    let m = msg.to_lowercase();
    if m.contains("insufficient funds") {
        return Some(WalletError::InsufficientFunds);
    }
    // POD shipment arrived before its order identity was ACKed — retryable.
    if m.contains("no matching order") {
        return Some(WalletError::NotFound(msg.to_string()));
    }
    if m.contains("idempotency_key reused")
        || m.contains("replay parameter mismatch")
        || m.contains("replay payload mismatch")
        || m.contains("current bid cache mismatch")
    {
        return Some(WalletError::ReplayMismatch);
    }
    if m.contains("overflow") || m.contains("would overflow") {
        return Some(WalletError::Overflow);
    }
    if m.contains("not authenticated") || m.contains("not_authenticated") {
        return Some(WalletError::NotAuthenticated);
    }
    if m.contains("mfa_required") || m.contains("mfa required") {
        return Some(WalletError::MfaRequired);
    }
    if m.contains("service_role required")
        || m.contains("not owned by seller")
        || m.contains("cannot settle listing")
        || m.contains("does not own listing")
    {
        return Some(WalletError::NotAuthorized);
    }
    if m.contains("legacy listing rpc disabled") {
        return Some(WalletError::Unimplemented(msg.to_string()));
    }
    if m.contains("coupon expired") {
        return Some(WalletError::CouponExpired);
    }
    if m.contains("coupon not found") {
        return Some(WalletError::NotFound("coupon".into()));
    }
    if m.contains("not redeemable")
        || m.contains("template is inactive")
        || m.contains("cannot revoke a redeemed coupon")
    {
        return Some(WalletError::CouponNotRedeemable(msg.to_string()));
    }
    if m.contains("not yet wired") || m.contains("not implemented") {
        return Some(WalletError::Unimplemented(msg.to_string()));
    }
    // Topup webhook permanent validation failures (SQLSTATE 22023). These never
    // succeed on retry, so they must classify as InvalidArgument and let the
    // webhook ack rather than 500-loop until Stripe disables the endpoint.
    if m.contains("does not match pack")
        || m.contains("topup pack")
        || m.contains("exceeds maximum")
        || m.contains("3-letter iso")
    {
        return Some(WalletError::InvalidArgument(msg.to_string()));
    }
    if m.contains("must be positive") || m.contains("must differ") || m.contains("invalid") {
        return Some(WalletError::InvalidArgument(msg.to_string()));
    }
    if m.contains("is required") || m.contains("cannot be null") {
        return Some(WalletError::NullArgument(msg.to_string()));
    }
    None
}

impl From<bb8::RunError<diesel_async::pooled_connection::PoolError>> for WalletError {
    fn from(e: bb8::RunError<diesel_async::pooled_connection::PoolError>) -> Self {
        WalletError::Pool(e.to_string())
    }
}

impl From<diesel_async::pooled_connection::PoolError> for WalletError {
    fn from(e: diesel_async::pooled_connection::PoolError) -> Self {
        WalletError::Pool(e.to_string())
    }
}

pub type Result<T> = std::result::Result<T, WalletError>;
