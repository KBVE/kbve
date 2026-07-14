//! Mirror the chat word blocklist from Postgres into Valkey.
//!
//! `profile.username_banlist` rows tagged `profanity`/`slur` are the
//! authoritative chat blocklist; the irc-gateway content filter reads them from
//! the Valkey key `chat:filter:words`. This bot shares the gateway's Valkey
//! database (same `KBVE_KV_URL` db + `kbve:cache` namespace), so it owns the
//! mirror: every few minutes it reads the banlist over PostgREST and writes the
//! JSON array to Valkey. The reserved-name terms (admin/mod/staff/…) are
//! excluded — they're username-only and would over-block ordinary chat.
//!
//! No-op when Supabase or Valkey isn't configured.

use std::sync::Arc;
use std::time::Duration;

use jedi::state::kv::KvCache;
use serde::Deserialize;

const BLOCKLIST_KEY: &str = "chat:filter:words";
const REFRESH: Duration = Duration::from_secs(300);

#[derive(Deserialize)]
struct PatternRow {
    pattern: String,
}

/// Spawn the periodic mirror. Call once at startup.
pub fn spawn() {
    tokio::spawn(async {
        let (base, service_key) = match (
            std::env::var("SUPABASE_URL"),
            std::env::var("SUPABASE_SERVICE_ROLE_KEY"),
        ) {
            (Ok(b), Ok(k)) if !b.trim().is_empty() && !k.trim().is_empty() => (b, k),
            _ => {
                tracing::info!("Chat blocklist mirror disabled (Supabase not configured)");
                return;
            }
        };
        let kv = KvCache::from_env().await;
        let http = reqwest::Client::new();
        let url = format!(
            "{}/rest/v1/username_banlist?select=pattern&is_active=eq.true&category=in.(profanity,slur)",
            base.trim_end_matches('/')
        );

        let mut tick = tokio::time::interval(REFRESH);
        loop {
            tick.tick().await;
            sync_once(&http, &url, &service_key, &kv).await;
        }
    });
}

async fn sync_once(http: &reqwest::Client, url: &str, service_key: &str, kv: &Arc<KvCache>) {
    let resp = match http
        .get(url)
        .header("apikey", service_key)
        .header("Authorization", format!("Bearer {service_key}"))
        .header("Accept-Profile", "profile")
        .send()
        .await
    {
        Ok(r) if r.status().is_success() => r,
        Ok(r) => {
            tracing::warn!(status = %r.status(), "chat blocklist mirror: banlist read failed");
            return;
        }
        Err(e) => {
            tracing::warn!(error = %e, "chat blocklist mirror: banlist request error");
            return;
        }
    };

    let rows: Vec<PatternRow> = match resp.json().await {
        Ok(v) => v,
        Err(e) => {
            tracing::warn!(error = %e, "chat blocklist mirror: banlist parse error");
            return;
        }
    };
    let words: Vec<String> = rows.into_iter().map(|r| r.pattern).collect();

    match serde_json::to_string(&words) {
        Ok(json) => {
            if kv.kv_set_str(BLOCKLIST_KEY, &json).await.is_some() {
                tracing::info!(count = words.len(), "chat blocklist mirrored to Valkey");
            } else {
                tracing::warn!("chat blocklist mirror: Valkey write failed (L2 unavailable?)");
            }
        }
        Err(e) => tracing::warn!(error = %e, "chat blocklist mirror: serialize failed"),
    }
}
