//! Resolve a Discord snowflake to the canonical KBVE username.
//!
//! Discord rewrites a typed `@name` into the wire token `<@snowflake>`. When
//! relaying to IRC we want the mentioned user's KBVE handle (so it matches who
//! they are in-game), not their Discord display name. The
//! `tracker.find_claim_identity_by_discord_id` RPC joins `auth.identities`
//! (the linked Discord account) to `profile.username`; we call it over
//! PostgREST and cache the result in Valkey so a busy channel doesn't hit
//! Supabase on every message. A miss (unlinked account, or no username set) is
//! cached too, and the relay falls back to the Discord display name.

use std::sync::Arc;
use std::time::Duration;

use jedi::state::kv::KvCache;
use serde::Deserialize;

const CACHE_TTL: Duration = Duration::from_secs(300);

pub struct MentionResolver {
    http: reqwest::Client,
    rpc_url: String,
    service_key: String,
    kv: Arc<KvCache>,
}

#[derive(Deserialize)]
struct IdentityRow {
    kbve_username: Option<String>,
}

impl MentionResolver {
    /// Build from env. `None` when Supabase isn't configured, in which case
    /// the relay keeps using the Discord display name.
    pub fn from_env(kv: Arc<KvCache>) -> Option<Self> {
        let base = std::env::var("SUPABASE_URL").ok()?;
        let service_key = std::env::var("SUPABASE_SERVICE_ROLE_KEY").ok()?;
        if base.trim().is_empty() || service_key.trim().is_empty() {
            return None;
        }
        let rpc_url = format!(
            "{}/rest/v1/rpc/find_claim_identity_by_discord_id",
            base.trim_end_matches('/')
        );
        Some(Self {
            http: reqwest::Client::new(),
            rpc_url,
            service_key,
            kv,
        })
    }

    /// Return the KBVE username linked to `snowflake`, or `None` when the
    /// account isn't linked / has no username. Cached (positive and negative)
    /// in Valkey for [`CACHE_TTL`].
    pub async fn kbve_username(&self, snowflake: &str) -> Option<String> {
        if snowflake.is_empty() || !snowflake.bytes().all(|b| b.is_ascii_digit()) {
            return None;
        }
        let key = format!("discord:uname:{snowflake}");
        let sf = snowflake.to_owned();
        let this = self;
        this.kv
            .get_or_fetch_json::<Option<String>, _, _>(&key, Some(CACHE_TTL), || async move {
                Ok(this.lookup(&sf).await)
            })
            .await
            .ok()
            .flatten()
    }

    async fn lookup(&self, snowflake: &str) -> Option<String> {
        let resp = self
            .http
            .post(&self.rpc_url)
            .header("apikey", &self.service_key)
            .header("Authorization", format!("Bearer {}", self.service_key))
            .header("Content-Profile", "tracker")
            .header("Content-Type", "application/json")
            .json(&serde_json::json!({ "p_discord_id": snowflake }))
            .send()
            .await
            .ok()?;
        if !resp.status().is_success() {
            tracing::warn!(status = %resp.status(), "discord mention lookup failed");
            return None;
        }
        let rows: Vec<IdentityRow> = resp.json().await.ok()?;
        rows.into_iter().next().and_then(|r| r.kbve_username)
    }
}
