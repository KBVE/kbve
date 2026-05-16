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
use diesel::sql_types::{Bool, Bytea, Nullable, Text, Uuid as SqlUuid};
use diesel_async::{AsyncPgConnection, RunQueryDsl};
use uuid::Uuid;

use crate::wallet::client::WalletPool;

use super::error::{ReferralError, Result};
use super::types::{
    RecordClickInput, RecordClickOutcome, RecordClickRow, ResolvedTargetRow, UserStats,
    UserStatsRow, UserTargetMutation, UserTargetMutationRow, UserTargetRow, UserTargetView,
};

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

    // ---------------------------------------------------------------------
    // Phase 3a — user-target management
    // ---------------------------------------------------------------------

    /// `SELECT * FROM referral.service_list_user_targets(user_id)`. One
    /// row per (user, target) regardless of active state — the UI shows
    /// disabled rows with a re-enable affordance.
    pub async fn list_user_targets(&self, user_id: Uuid) -> Result<Vec<UserTargetView>> {
        let mut conn = self.pool.get().await?;
        let inner: &mut AsyncPgConnection = &mut *conn;

        let rows: Vec<UserTargetRow> = sql_query(
            "SELECT target_slug, title, url, is_default, active, enabled_at, \
                    disabled_at, clicks_total, clicks_credited, credits_total, \
                    last_click_at \
             FROM referral.service_list_user_targets($1)",
        )
        .bind::<SqlUuid, _>(user_id)
        .get_results::<UserTargetRow>(inner)
        .await
        .map_err(ReferralError::from_diesel)?;

        Ok(rows.into_iter().map(UserTargetView::from).collect())
    }

    /// `referral.service_enable_target(user_id, slug, set_as_default)`.
    pub async fn enable_target(
        &self,
        user_id: Uuid,
        target_slug: &str,
        set_as_default: bool,
    ) -> Result<UserTargetMutation> {
        let mut conn = self.pool.get().await?;
        let inner: &mut AsyncPgConnection = &mut *conn;

        let row: UserTargetMutationRow = sql_query(
            "SELECT user_id, target_slug, is_default, active, enabled_at, \
                    disabled_at \
             FROM referral.service_enable_target($1, $2, $3)",
        )
        .bind::<SqlUuid, _>(user_id)
        .bind::<Text, _>(target_slug)
        .bind::<Bool, _>(set_as_default)
        .get_result(inner)
        .await
        .map_err(ReferralError::from_diesel)?;

        Ok(row.into())
    }

    /// `referral.service_disable_target(user_id, slug)`.
    pub async fn disable_target(
        &self,
        user_id: Uuid,
        target_slug: &str,
    ) -> Result<UserTargetMutation> {
        let mut conn = self.pool.get().await?;
        let inner: &mut AsyncPgConnection = &mut *conn;

        let row: UserTargetMutationRow = sql_query(
            "SELECT user_id, target_slug, is_default, active, enabled_at, \
                    disabled_at \
             FROM referral.service_disable_target($1, $2)",
        )
        .bind::<SqlUuid, _>(user_id)
        .bind::<Text, _>(target_slug)
        .get_result(inner)
        .await
        .map_err(ReferralError::from_diesel)?;

        Ok(row.into())
    }

    /// `referral.service_set_default_target(user_id, slug)`.
    pub async fn set_default_target(
        &self,
        user_id: Uuid,
        target_slug: &str,
    ) -> Result<UserTargetMutation> {
        let mut conn = self.pool.get().await?;
        let inner: &mut AsyncPgConnection = &mut *conn;

        let row: UserTargetMutationRow = sql_query(
            "SELECT user_id, target_slug, is_default, active, enabled_at, \
                    disabled_at \
             FROM referral.service_set_default_target($1, $2)",
        )
        .bind::<SqlUuid, _>(user_id)
        .bind::<Text, _>(target_slug)
        .get_result(inner)
        .await
        .map_err(ReferralError::from_diesel)?;

        Ok(row.into())
    }

    /// `referral.service_get_user_stats(user_id)`.
    pub async fn get_user_stats(&self, user_id: Uuid) -> Result<UserStats> {
        let mut conn = self.pool.get().await?;
        let inner: &mut AsyncPgConnection = &mut *conn;

        let row: UserStatsRow = sql_query(
            "SELECT clicks_total, clicks_credited, credits_total, last_click_at \
             FROM referral.service_get_user_stats($1)",
        )
        .bind::<SqlUuid, _>(user_id)
        .get_result(inner)
        .await
        .map_err(ReferralError::from_diesel)?;

        Ok(row.into())
    }
}
