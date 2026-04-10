//! Supabase PostgREST client for the mc_auth link flow.
//!
//! Two RPCs are called against the live `mc` schema (already deployed to
//! production — see packages/data/sql/dbmate/migrations/20260227210000):
//!
//!   - `service_get_user_by_mc_uuid(p_mc_uuid)` — read-only lookup; returns
//!     the link row (user_id, status, is_verified) if one exists, empty
//!     otherwise. Used on player join to decide greet-vs-nag.
//!
//!   - `service_verify_link(p_mc_uuid, p_code)` — verify + consume a 6-digit
//!     code issued web-side by `proxy_request_link`. Returns the linked
//!     user_id on success, NULL on wrong code / expired / locked.
//!
//! Both RPCs are `SECURITY DEFINER` and only reachable with the service-role
//! key. The code is bcrypt-hashed at rest, expires in 10 min, locks the row
//! for 15 min after 5 failed attempts — all enforced server-side, the client
//! just passes raw inputs through.
//!
//! Non-blocking / graceful posture: any failure (missing env, network error,
//! bad JSON, null user_id) returns an `Unlinked` / `LinkRejected` outcome
//! and logs a warning. Players are never kicked from auth failures.

use reqwest::{Client, StatusCode};
use serde_json::json;
use tracing::{debug, warn};

use crate::types::LinkStatusRow;

const ENV_URL: &str = "SUPABASE_URL";
const ENV_KEY: &str = "SUPABASE_SERVICE_ROLE_KEY";

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
    /// Code was wrong, expired, the row is locked, or no matching row exists.
    /// The RPC doesn't distinguish these cases by design (anti-enumeration) —
    /// the player just sees "code didn't work".
    Rejected,
    /// Transport/decode failure — surface to the player as a soft error so
    /// they know to retry rather than assume the code was wrong.
    Failure { reason: String },
}

/// Thin wrapper around a reqwest client + Supabase credentials.
///
/// Constructed at worker start. If either env var is missing the client
/// stays in `disabled` mode and every call returns `Failure` — the mod
/// still loads cleanly so local dev (no Supabase) isn't blocked.
pub struct SupabaseClient {
    http: Client,
    mode: ClientMode,
}

enum ClientMode {
    Live {
        url: String,
        service_role_key: String,
    },
    Disabled,
}

impl SupabaseClient {
    /// Read `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` from the process
    /// env. Missing vars are a warning, not a panic — the worker continues
    /// in `Disabled` mode so Fabric still boots.
    pub fn from_env() -> Self {
        let url = std::env::var(ENV_URL).ok();
        let key = std::env::var(ENV_KEY).ok();

        let http = Client::builder()
            .timeout(std::time::Duration::from_secs(5))
            .build()
            .unwrap_or_else(|_| Client::new());

        match (url, key) {
            (Some(url), Some(key)) if !url.is_empty() && !key.is_empty() => {
                debug!(%url, "SupabaseClient: live mode");
                Self {
                    http,
                    mode: ClientMode::Live {
                        url: url.trim_end_matches('/').to_string(),
                        service_role_key: key,
                    },
                }
            }
            _ => {
                warn!(
                    "SupabaseClient: {} and/or {} not set — auth disabled, players treated as unlinked",
                    ENV_URL, ENV_KEY
                );
                Self {
                    http,
                    mode: ClientMode::Disabled,
                }
            }
        }
    }

    pub fn is_enabled(&self) -> bool {
        matches!(self.mode, ClientMode::Live { .. })
    }

    /// Look up a player's link status via `service_get_user_by_mc_uuid`.
    pub async fn lookup_player_link(&self, player_uuid: &str) -> LookupOutcome {
        let (url, key) = match &self.mode {
            ClientMode::Live {
                url,
                service_role_key,
            } => (url.as_str(), service_role_key.as_str()),
            ClientMode::Disabled => {
                return LookupOutcome::Unlinked;
            }
        };

        let endpoint = format!("{}/rest/v1/rpc/service_get_user_by_mc_uuid", url);
        let body = json!({ "p_mc_uuid": player_uuid });

        let resp = match self
            .http
            .post(&endpoint)
            .header("apikey", key)
            .header("Authorization", format!("Bearer {}", key))
            .header("Content-Type", "application/json")
            .header("db-schema", "mc")
            .json(&body)
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) => {
                return LookupOutcome::Failure {
                    reason: format!("transport: {}", e),
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
        let (url, key) = match &self.mode {
            ClientMode::Live {
                url,
                service_role_key,
            } => (url.as_str(), service_role_key.as_str()),
            ClientMode::Disabled => {
                return VerifyOutcome::Failure {
                    reason: "auth disabled (no supabase env)".to_string(),
                };
            }
        };

        let endpoint = format!("{}/rest/v1/rpc/service_verify_link", url);
        let body = json!({ "p_mc_uuid": player_uuid, "p_code": code });

        let resp = match self
            .http
            .post(&endpoint)
            .header("apikey", key)
            .header("Authorization", format!("Bearer {}", key))
            .header("Content-Type", "application/json")
            .header("db-schema", "mc")
            .json(&body)
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) => {
                return VerifyOutcome::Failure {
                    reason: format!("transport: {}", e),
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

        // The RPC returns UUID or NULL. PostgREST serializes this as either
        // a JSON string or JSON null at the top level.
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
}

fn truncate(s: &str, n: usize) -> &str {
    if s.len() > n { &s[..n] } else { s }
}
