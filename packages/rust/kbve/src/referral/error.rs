//! Typed errors for the referral client.
//!
//! Mirrors the wallet error pattern: diesel surfaces SQLSTATE classes via
//! `DatabaseErrorKind` for some codes; the rest we recognize from the
//! exception message prefix our SQL functions raise.

use diesel::result::{DatabaseErrorKind, Error as DieselError};
use thiserror::Error;

pub type Result<T> = std::result::Result<T, ReferralError>;

#[derive(Debug, Error)]
pub enum ReferralError {
    /// `referral.reward_policy` row missing — should be impossible after
    /// the Phase 1 migration. Custom SQLSTATE RFP01.
    #[error("referral reward policy missing")]
    PolicyMissing,

    /// `referral.target` not found / inactive. Custom SQLSTATE RFT01.
    #[error("referral target not found or inactive")]
    TargetNotFound,

    /// Referrer does not have the supplied target enabled. Custom
    /// SQLSTATE RFU01.
    #[error("referrer does not have this target enabled")]
    TargetNotEnabled,

    /// Wallet account provisioning failed inside
    /// `referral.ensure_referrer_account`. Custom SQLSTATE RFWA1.
    #[error("wallet account provisioning failed")]
    WalletAccountProvisioning,

    /// NULL or wrong-shape argument (22023 / 22004).
    #[error("invalid argument: {0}")]
    InvalidArgument(String),

    /// Pool acquisition failure.
    #[error("pool: {0}")]
    Pool(String),

    /// Anything else diesel surfaces.
    #[error(transparent)]
    Db(#[from] DieselError),
}

impl ReferralError {
    pub fn from_diesel(e: DieselError) -> Self {
        if let DieselError::DatabaseError(kind, ref info) = e {
            let msg = info.message();
            if let Some(mapped) = classify_message(msg) {
                return mapped;
            }
            match kind {
                DatabaseErrorKind::CheckViolation => {
                    return ReferralError::InvalidArgument(msg.to_string());
                }
                DatabaseErrorKind::NotNullViolation => {
                    return ReferralError::InvalidArgument(msg.to_string());
                }
                _ => {}
            }
        }
        ReferralError::Db(e)
    }
}

fn classify_message(msg: &str) -> Option<ReferralError> {
    let m = msg.to_lowercase();
    if m.contains("reward policy missing") {
        return Some(ReferralError::PolicyMissing);
    }
    if m.contains("not found or inactive") {
        return Some(ReferralError::TargetNotFound);
    }
    if m.contains("disabled or unset") {
        return Some(ReferralError::TargetNotEnabled);
    }
    if m.contains("failed to provision wallet account") {
        return Some(ReferralError::WalletAccountProvisioning);
    }
    if m.contains("must be a 32-byte")
        || m.contains("is required")
        || m.contains("must be positive")
    {
        return Some(ReferralError::InvalidArgument(msg.to_string()));
    }
    None
}

impl From<bb8::RunError<diesel_async::pooled_connection::PoolError>> for ReferralError {
    fn from(e: bb8::RunError<diesel_async::pooled_connection::PoolError>) -> Self {
        ReferralError::Pool(e.to_string())
    }
}

impl From<diesel_async::pooled_connection::PoolError> for ReferralError {
    fn from(e: diesel_async::pooled_connection::PoolError) -> Self {
        ReferralError::Pool(e.to_string())
    }
}
