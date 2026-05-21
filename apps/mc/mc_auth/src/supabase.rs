//! Supabase wrapper for the mc_auth link flow.
//!
//! This module is intentionally thin: all HTTP plumbing lives in
//! `bevy_supa::SupaClient` (shared across future Bevy games and JNI
//! consumers), and this file just wraps the two RPCs the Minecraft
//! auth bridge actually calls into typed outcome enums.
//!
//! RPCs (live in production since 20260227210000_mc_schema_init):
//!
//!   - `mc.service_get_user_by_mc_uuid(p_mc_uuid)` — read-only lookup;
//!     returns the link row if one exists, empty otherwise. Called on
//!     join to decide greet-vs-nag.
//!
//!   - `mc.service_verify_link(p_mc_uuid, p_code)` — verifies + consumes
//!     a 6-digit code issued web-side by `mc.proxy_request_link`.
//!     Returns the linked user_id on success, NULL on wrong code /
//!     expired / locked.
//!
//! Both are `SECURITY DEFINER` and only reachable with the service-role
//! key. The code is bcrypt-hashed at rest, expires in 10 min, locks the
//! row for 15 min after 5 failed attempts — all enforced server-side,
//! this client just passes raw inputs through.
//!
//! Non-blocking / graceful posture: any failure (missing env, network
//! error, bad JSON, null user_id) returns an `Unlinked` / `Rejected`
//! outcome and logs a warning. Players are never kicked from auth
//! failures.

use bevy_supa::{SupaClient, SupaError};
use reqwest::StatusCode;
use serde_json::json;
use tracing::{debug, warn};

use crate::types::LinkStatusRow;

/// Outcome of a `lookup_player_link` call.
pub enum LookupOutcome {
    /// Player has a verified link row — bind them to this Supabase user.
    Linked { supabase_user_id: String },
    /// Player has no row, or the row exists but `is_verified = false`.
    Unlinked,
    /// Transport/decode failure — treat as unlinked at the call site but
    /// keep the reason so the JVM side can log a warning.
    Failure { reason: String },
}

/// Outcome of a `verify_link` call.
pub enum VerifyOutcome {
    /// Code was correct, row is now `(status & 1) == 1`. user_id returned.
    Verified { supabase_user_id: String },
    /// Code was wrong, expired, the row is locked, or no matching row
    /// exists. The RPC deliberately doesn't distinguish these cases
    /// (anti-enumeration) — the player just sees "code didn't work".
    Rejected,
    /// Transport/decode failure — surface to the player as a soft error
    /// so they know to retry rather than assume the code was wrong.
    Failure { reason: String },
}

/// Thin wrapper around a shared [`bevy_supa::SupaClient`] that knows
/// how to talk to the two `mc.*` RPCs consumed by the auth bridge.
///
/// The client stays in `Disabled` mode when `SUPABASE_URL` or
/// `SUPABASE_SERVICE_ROLE_KEY` are missing from env; the mod still
/// loads, the worker logs a single warning at startup, and every
/// lookup returns `Unlinked` so local dev is not blocked.
pub struct SupabaseClient {
    inner: Option<SupaClient>,
}

impl SupabaseClient {
    /// Read env vars and build the shared client. Missing vars are a
    /// warning, not a panic — the worker continues in "disabled" mode
    /// so Fabric still boots in local dev without Supabase.
    pub fn from_env() -> Self {
        match SupaClient::from_env() {
            Some(c) => {
                debug!("SupabaseClient: live mode (bevy_supa)");
                Self { inner: Some(c) }
            }
            None => {
                warn!(
                    "SupabaseClient: SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY not set — \
                     auth disabled, all lookups treated as Unlinked"
                );
                Self { inner: None }
            }
        }
    }

    pub fn is_enabled(&self) -> bool {
        self.inner.is_some()
    }

    /// Look up a player's link status via `service_get_user_by_mc_uuid`.
    pub async fn lookup_player_link(&self, player_uuid: &str) -> LookupOutcome {
        let client = match &self.inner {
            Some(c) => c,
            None => return LookupOutcome::Unlinked,
        };

        let params = json!({ "p_mc_uuid": player_uuid });

        let resp = match client
            .rpc_schema("service_get_user_by_mc_uuid", params, "mc")
            .await
        {
            Ok(r) => r,
            Err(SupaError::Transport(reason)) => {
                return LookupOutcome::Failure {
                    reason: format!("transport: {}", reason),
                };
            }
            Err(e) => {
                return LookupOutcome::Failure {
                    reason: format!("supa: {}", e),
                };
            }
        };

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return LookupOutcome::Failure {
                reason: format!("http {}: {}", status, truncate(&body, 200)),
            };
        }

        let rows: Vec<LinkStatusRow> = match resp.json().await {
            Ok(r) => r,
            Err(e) => {
                return LookupOutcome::Failure {
                    reason: format!("decode: {}", e),
                };
            }
        };

        match rows.into_iter().next() {
            Some(row) if row.is_verified => LookupOutcome::Linked {
                supabase_user_id: row.user_id,
            },
            Some(_) => LookupOutcome::Unlinked,
            None => LookupOutcome::Unlinked,
        }
    }

    /// Verify + consume a link code via `service_verify_link`.
    pub async fn verify_link(&self, player_uuid: &str, code: i32) -> VerifyOutcome {
        let client = match &self.inner {
            Some(c) => c,
            None => {
                return VerifyOutcome::Failure {
                    reason: "auth disabled (no supabase env)".to_string(),
                };
            }
        };

        let params = json!({ "p_mc_uuid": player_uuid, "p_code": code });

        let resp = match client.rpc_schema("service_verify_link", params, "mc").await {
            Ok(r) => r,
            Err(SupaError::Transport(reason)) => {
                return VerifyOutcome::Failure {
                    reason: format!("transport: {}", reason),
                };
            }
            Err(e) => {
                return VerifyOutcome::Failure {
                    reason: format!("supa: {}", e),
                };
            }
        };

        if resp.status() == StatusCode::NOT_FOUND {
            return VerifyOutcome::Rejected;
        }

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return VerifyOutcome::Failure {
                reason: format!("http {}: {}", status, truncate(&body, 200)),
            };
        }

        // The RPC returns UUID or NULL. PostgREST serializes this as
        // either a JSON string or JSON null at the top level.
        let body: serde_json::Value = match resp.json().await {
            Ok(v) => v,
            Err(e) => {
                return VerifyOutcome::Failure {
                    reason: format!("decode: {}", e),
                };
            }
        };

        match body {
            serde_json::Value::String(user_id) => VerifyOutcome::Verified {
                supabase_user_id: user_id,
            },
            serde_json::Value::Null => VerifyOutcome::Rejected,
            other => VerifyOutcome::Failure {
                reason: format!("unexpected verify_link body: {}", other),
            },
        }
    }

    pub async fn user_balance(&self, user_id: &str) -> Result<Option<(i64, i64)>, String> {
        let client = self
            .inner
            .as_ref()
            .ok_or_else(|| "auth disabled (no supabase env)".to_string())?;
        let params = json!({ "p_user_id": user_id });
        let resp = client
            .rpc("proxy_service_user_balance", params)
            .await
            .map_err(|e| format!("supa: {e}"))?;
        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("http {}: {}", status, truncate(&body, 200)));
        }
        #[derive(serde::Deserialize)]
        struct Row {
            credits: i64,
            khash: i64,
        }
        let rows: Vec<Row> = resp.json().await.map_err(|e| format!("decode: {e}"))?;
        if rows.len() > 1 {
            warn!(
                user_id = %user_id,
                row_count = rows.len(),
                "wallet.service_user_balance returned multiple rows — wallet_account_user_uq invariant violated"
            );
        }
        Ok(rows.into_iter().next().map(|r| (r.credits, r.khash)))
    }

    pub async fn save_player_snapshot(&self, snapshot_json: &str) -> Result<(), String> {
        let client = self
            .inner
            .as_ref()
            .ok_or_else(|| "auth disabled (no supabase env)".to_string())?;
        let snapshot: serde_json::Value =
            serde_json::from_str(snapshot_json).map_err(|e| format!("bad snapshot json: {e}"))?;
        let params = json!({ "p_snapshot": snapshot });
        let resp = client
            .rpc_schema("service_save_player", params, "mc")
            .await
            .map_err(|e| format!("supa: {e}"))?;
        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("http {}: {}", status, truncate(&body, 200)));
        }
        Ok(())
    }

    pub async fn load_player_snapshot(
        &self,
        player_uuid: &str,
        server_id: &str,
    ) -> Result<Option<String>, String> {
        let client = self
            .inner
            .as_ref()
            .ok_or_else(|| "auth disabled (no supabase env)".to_string())?;
        let params = json!({ "p_player_uuid": player_uuid, "p_server_id": server_id });
        let resp = client
            .rpc_schema("service_load_player", params, "mc")
            .await
            .map_err(|e| format!("supa: {e}"))?;
        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("http {}: {}", status, truncate(&body, 200)));
        }
        let rows: Vec<serde_json::Value> = resp.json().await.map_err(|e| format!("decode: {e}"))?;
        match rows.into_iter().next() {
            Some(row) => Ok(Some(row.to_string())),
            None => Ok(None),
        }
    }
}

fn truncate(s: &str, n: usize) -> &str {
    if s.len() > n { &s[..n] } else { s }
}
