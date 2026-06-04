//! Typed errors emitted by the lot client.
//!
//! Maps Postgres SQLSTATEs raised by the `mc.service_*` /
//! `public.proxy_*` functions to dedicated variants. The mapping is
//! conservative: structural SQLSTATEs (CheckViolation, NotNullViolation,
//! ExclusionViolation, UniqueViolation) get dedicated variants; raised
//! exception messages get prefix-matched against a small known set.

use diesel::result::{DatabaseErrorKind, Error as DieselError};
use thiserror::Error;

use crate::wallet::error::WalletError;

#[derive(Debug, Error)]
pub enum LotError {
    #[error("not authenticated")]
    NotAuthenticated,

    #[error("not authorized")]
    NotAuthorized,

    #[error("lot not found")]
    LotNotFound,

    #[error("schematic not found")]
    SchematicNotFound,

    #[error("build job not found")]
    BuildNotFound,

    #[error("lot not vacant")]
    LotNotVacant,

    #[error("lot not owned by caller")]
    LotNotOwned,

    #[error("lot already has an active queued/claimed job")]
    ActiveJobConflict,

    #[error("chunk overlap with existing lot")]
    ChunkOverlap,

    #[error("idempotency_key reused with different payload")]
    ReplayMismatch,

    #[error("insufficient funds")]
    InsufficientFunds,

    #[error("invalid argument: {0}")]
    InvalidArgument(String),

    #[error("null argument: {0}")]
    NullArgument(String),

    #[error("wallet: {0}")]
    Wallet(#[from] WalletError),

    #[error("pool error: {0}")]
    Pool(String),

    #[error(transparent)]
    Db(#[from] DieselError),
}

impl LotError {
    pub fn from_diesel(e: DieselError) -> Self {
        if let DieselError::DatabaseError(kind, ref info) = e {
            match kind {
                DatabaseErrorKind::UniqueViolation => {
                    // uq_mc_lot_build_log_one_active_per_lot fires when
                    // queue / retry races with an existing active job.
                    if info.constraint_name() == Some("uq_mc_lot_build_log_one_active_per_lot") {
                        return LotError::ActiveJobConflict;
                    }
                    return LotError::InvalidArgument(info.message().to_string());
                }
                DatabaseErrorKind::ExclusionViolation => {
                    return LotError::ChunkOverlap;
                }
                DatabaseErrorKind::CheckViolation => {
                    return LotError::InvalidArgument(info.message().to_string());
                }
                DatabaseErrorKind::NotNullViolation => {
                    return LotError::NullArgument(info.message().to_string());
                }
                DatabaseErrorKind::SerializationFailure => {
                    return LotError::ReplayMismatch;
                }
                DatabaseErrorKind::ForeignKeyViolation => {
                    let m = info.message().to_lowercase();
                    if m.contains("schematic") {
                        return LotError::SchematicNotFound;
                    }
                    return LotError::LotNotFound;
                }
                _ => {}
            }
            if let Some(err) = classify_message(info.message()) {
                return err;
            }
        }
        LotError::Db(e)
    }
}

fn classify_message(msg: &str) -> Option<LotError> {
    let m = msg.to_lowercase();
    if m.contains("not authenticated") {
        return Some(LotError::NotAuthenticated);
    }
    if m.contains("service_role required") || m.contains("not owned by caller") {
        return Some(LotError::NotAuthorized);
    }
    if m.contains("lot not found") {
        return Some(LotError::LotNotFound);
    }
    if m.contains("schematic") && (m.contains("not found") || m.contains("disabled")) {
        return Some(LotError::SchematicNotFound);
    }
    if m.contains("build") && m.contains("not found") {
        return Some(LotError::BuildNotFound);
    }
    if m.contains("not vacant") {
        return Some(LotError::LotNotVacant);
    }
    if m.contains("not owned") || m.contains("does not own") {
        return Some(LotError::LotNotOwned);
    }
    if m.contains("active queued/claimed job") || m.contains("active build job") {
        return Some(LotError::ActiveJobConflict);
    }
    if m.contains("idempotency_key reused") {
        return Some(LotError::ReplayMismatch);
    }
    if m.contains("insufficient funds") {
        return Some(LotError::InsufficientFunds);
    }
    if m.contains("cannot be null") || m.contains("is required") {
        return Some(LotError::NullArgument(msg.to_string()));
    }
    if m.contains("invalid") || m.contains("must be") || m.contains("cannot retry") {
        return Some(LotError::InvalidArgument(msg.to_string()));
    }
    None
}

impl From<bb8::RunError<diesel_async::pooled_connection::PoolError>> for LotError {
    fn from(e: bb8::RunError<diesel_async::pooled_connection::PoolError>) -> Self {
        LotError::Pool(e.to_string())
    }
}

impl From<diesel_async::pooled_connection::PoolError> for LotError {
    fn from(e: diesel_async::pooled_connection::PoolError) -> Self {
        LotError::Pool(e.to_string())
    }
}

pub type Result<T> = std::result::Result<T, LotError>;
