//! Wallet integration — calls axum-kbve `/api/v1/wallet/service/credit-user`
//! to grant daily-login khash to linked players.
//!
//! The MC mod knows a Supabase `user_id` (returned by `lookup_player_link`
//! / `verify_link`) but not a wallet `account_id`. The new
//! `service_credit_user` route on axum-kbve does the resolution + credit
//! atomically, so this module is a thin reqwest wrapper.
//!
//! Daily semantics:
//!   - idempotency_key derived via UUIDv5 from (user_id, "YYYY-MM-DD" in UTC).
//!   - same user joining twice on the same UTC day → same key → server
//!     replays the original ledger row instead of crediting again.
//!   - server returns the original ledger_id on replay; mod treats both
//!     "first credit today" and "already credited" as success and logs both
//!     uniformly. No client-side state needed.
//!
//! Env:
//!   - `AXUM_KBVE_URL` — base URL (e.g. `http://axum-kbve.kbve:4321` in cluster).
//!     Wallet integration is disabled if unset.
//!   - `WALLET_SERVICE_JWT` — Supabase service_role JWT. Wallet integration
//!     is disabled if unset.
//!   - `MC_DAILY_KHASH_AMOUNT` — optional, defaults to 100.

use std::env;
use std::time::Duration;

use chrono::Utc;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tracing::{debug, info, warn};

const DEFAULT_DAILY_AMOUNT: i64 = 100;
const REQUEST_TIMEOUT_SECS: u64 = 10;

/// Namespace UUID used to derive the daily idempotency key. Stable; do not
/// change without also accepting that historical replays will start to look
/// like new credits.
///
/// Generated as `uuidv5(NIL, "kbve.mc.daily_khash.v1")`; the literal value
/// is pinned so the binary doesn't need to compute it at startup.
const DAILY_NAMESPACE: uuid::Uuid =
    uuid::Uuid::from_u128(0x2cba_9eb2_bd9b_5d9b_8b32_ad28_71fa_85d2);

#[derive(Clone)]
pub struct WalletClient {
    http: Client,
    base_url: String,
    service_jwt: String,
    daily_amount: i64,
}

#[derive(Debug, thiserror::Error)]
pub enum WalletCallError {
    #[error("wallet integration disabled (missing env)")]
    Disabled,
    #[error("invalid user_id: {0}")]
    InvalidUserId(String),
    #[error("http error: {0}")]
    Http(String),
    #[error("upstream {status}: {body}")]
    Upstream { status: u16, body: String },
}

#[derive(Serialize)]
struct CreditUserReq<'a> {
    user_id: &'a str,
    currency: &'a str,
    amount: i64,
    source_kind: &'a str,
    reason: &'a str,
    ref_type: &'a str,
    ref_id: Option<i64>,
    idempotency_key: String,
}

#[derive(Deserialize, Debug)]
pub struct CreditUserResp {
    pub account_id: String,
    pub ledger_id: i64,
}

/// Decodes the `BalanceDto` shape served by `/api/v1/wallet/service/balance/{user_id}`.
#[derive(Deserialize, Debug, Clone)]
pub struct BalanceSnapshot {
    pub account_id: String,
    pub credits: i64,
    pub khash: i64,
    pub updated_at: String,
}

impl WalletClient {
    /// Read env and build a client. Returns `None` if the integration is
    /// disabled (missing URL or JWT) — caller should log and skip wallet
    /// ops, not fail.
    pub fn from_env() -> Option<Self> {
        let base_url = match env::var("AXUM_KBVE_URL") {
            Ok(v) if !v.is_empty() => v.trim_end_matches('/').to_string(),
            _ => {
                debug!("mc_auth wallet: AXUM_KBVE_URL not set, integration disabled");
                return None;
            }
        };
        let service_jwt = match env::var("WALLET_SERVICE_JWT") {
            Ok(v) if !v.is_empty() => v,
            _ => {
                debug!("mc_auth wallet: WALLET_SERVICE_JWT not set, integration disabled");
                return None;
            }
        };
        let daily_amount = env::var("MC_DAILY_KHASH_AMOUNT")
            .ok()
            .and_then(|s| s.parse::<i64>().ok())
            .filter(|n| *n > 0)
            .unwrap_or(DEFAULT_DAILY_AMOUNT);

        let http = Client::builder()
            .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
            .build()
            .ok()?;

        info!(
            base_url = %base_url,
            daily_amount,
            "mc_auth wallet: integration enabled"
        );

        Some(Self {
            http,
            base_url,
            service_jwt,
            daily_amount,
        })
    }

    /// Credit daily khash for the given Supabase user. Idempotent across
    /// repeated calls within the same UTC day.
    pub async fn daily_credit_khash(
        &self,
        user_id: &str,
    ) -> Result<CreditUserResp, WalletCallError> {
        // Validate the user_id is a real UUID before crossing the wire.
        let user_uuid = uuid::Uuid::parse_str(user_id)
            .map_err(|e| WalletCallError::InvalidUserId(format!("{user_id}: {e}")))?;

        // Deterministic key: namespace ⊕ (user_id, UTC date).
        let date = Utc::now().format("%Y-%m-%d").to_string();
        let key_input = format!("{user_uuid}:{date}");
        let idem = uuid::Uuid::new_v5(&DAILY_NAMESPACE, key_input.as_bytes());

        let body = CreditUserReq {
            user_id,
            currency: "khash",
            amount: self.daily_amount,
            source_kind: "reward",
            reason: "mc_daily_login",
            ref_type: "mc_daily",
            ref_id: None,
            idempotency_key: idem.to_string(),
        };

        let resp = self
            .http
            .post(format!(
                "{}/api/v1/wallet/service/credit-user",
                self.base_url
            ))
            .bearer_auth(&self.service_jwt)
            .json(&body)
            .send()
            .await
            .map_err(|e| WalletCallError::Http(e.to_string()))?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(WalletCallError::Upstream {
                status: status.as_u16(),
                body,
            });
        }

        resp.json::<CreditUserResp>()
            .await
            .map_err(|e| WalletCallError::Http(e.to_string()))
    }

    pub fn daily_amount(&self) -> i64 {
        self.daily_amount
    }

    /// Read a linked user's wallet balance via the service-role endpoint.
    /// Used on player join to surface credits + khash in chat.
    pub async fn balance_for_user(
        &self,
        user_id: &str,
    ) -> Result<BalanceSnapshot, WalletCallError> {
        let user_uuid = uuid::Uuid::parse_str(user_id)
            .map_err(|e| WalletCallError::InvalidUserId(format!("{user_id}: {e}")))?;

        let resp = self
            .http
            .get(format!(
                "{}/api/v1/wallet/service/balance/{}",
                self.base_url, user_uuid
            ))
            .bearer_auth(&self.service_jwt)
            .send()
            .await
            .map_err(|e| WalletCallError::Http(e.to_string()))?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(WalletCallError::Upstream {
                status: status.as_u16(),
                body,
            });
        }

        resp.json::<BalanceSnapshot>()
            .await
            .map_err(|e| WalletCallError::Http(e.to_string()))
    }
}

/// Convenience: optional client constructor + logger. Use this in the
/// runtime boot path so a misconfigured deploy doesn't crash the mod.
pub fn maybe_init() -> Option<WalletClient> {
    let c = WalletClient::from_env();
    if c.is_none() {
        warn!("mc_auth wallet: daily-khash integration disabled (env not set)");
    }
    c
}
