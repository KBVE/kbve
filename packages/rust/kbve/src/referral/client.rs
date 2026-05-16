//! `ReferralClient` — thin diesel-async wrapper around the two SECURITY
//! DEFINER functions Phase 1 ships: `referral.record_click` and
//! `referral.resolve_user_target`.
//!
//! Reuses the wallet's `WalletPool` (`Pool<AsyncPgConnection>`) so we don't
//! spin up a second connection pool for what is effectively the same
//! application. A referral credit and the wallet ledger entry it produces
//! must run in the same transaction, and they always do because Phase 1
//! does the wallet credit inline inside `record_click`.

use diesel::OptionalExtension;
use diesel::sql_query;
use diesel::sql_types::{Bytea, Nullable, Text, Uuid as SqlUuid};
use diesel_async::{AsyncPgConnection, RunQueryDsl};
use uuid::Uuid;

use crate::wallet::client::WalletPool;

use super::error::{ReferralError, Result};
use super::types::{RecordClickInput, RecordClickOutcome, RecordClickRow, ResolvedTargetRow};

#[derive(Clone)]
pub struct ReferralClient {
    pool: WalletPool,
}

impl ReferralClient {
    pub fn new(pool: WalletPool) -> Self {
        Self { pool }
    }

    /// `SELECT * FROM referral.record_click(...)`. Returns the redirect
    /// target URL + whether the click qualified for a credit. Wallet
    /// credit + click row INSERT run inside one transaction on the
    /// Postgres side.
    pub async fn record_click(&self, input: &RecordClickInput) -> Result<RecordClickOutcome> {
        let mut conn = self.pool.get().await?;
        let inner: &mut AsyncPgConnection = &mut *conn;

        let row: RecordClickRow = sql_query(
            "SELECT click_id, target_slug, target_url, qualified, credited, ledger_id \
             FROM referral.record_click($1, $2, $3, $4, $5, $6, $7)",
        )
        .bind::<SqlUuid, _>(input.referrer_id)
        .bind::<Text, _>(&input.target_slug)
        .bind::<Bytea, _>(input.ip_hash.clone())
        .bind::<Bytea, _>(input.subnet_hash.clone())
        .bind::<Nullable<Text>, _>(input.user_agent.clone())
        .bind::<Nullable<Text>, _>(input.referer.clone())
        .bind::<Nullable<Text>, _>(input.accept_lang.clone())
        .get_result(inner)
        .await
        .map_err(ReferralError::from_diesel)?;

        Ok(row.into())
    }

    /// `SELECT * FROM referral.resolve_user_target(user_id, slug?)`.
    /// Returns `Ok(None)` when the user has no matching active target
    /// — the handler treats that as 404 not as an error.
    pub async fn resolve_user_target(
        &self,
        user_id: Uuid,
        target_slug: Option<&str>,
    ) -> Result<Option<ResolvedTargetRow>> {
        let mut conn = self.pool.get().await?;
        let inner: &mut AsyncPgConnection = &mut *conn;

        let row: Option<ResolvedTargetRow> = sql_query(
            "SELECT slug, title, url \
             FROM referral.resolve_user_target($1, $2)",
        )
        .bind::<SqlUuid, _>(user_id)
        .bind::<Nullable<Text>, _>(target_slug.map(|s| s.to_string()))
        .get_result::<ResolvedTargetRow>(inner)
        .await
        .optional()
        .map_err(ReferralError::from_diesel)?;

        Ok(row)
    }
}
