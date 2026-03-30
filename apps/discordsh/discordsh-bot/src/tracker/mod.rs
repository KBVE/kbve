use std::time::SystemTime;

use reqwest::Client;
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE, HeaderMap, HeaderValue};
use serde::{Deserialize, Serialize};
use tracing::{info, warn};

/// ISO 8601 UTC timestamp without pulling in chrono.
fn now_iso8601() -> String {
    let d = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = d.as_secs();
    // Simple but correct: delegate to the humantime crate-free approach.
    // Format: 2026-02-24T12:00:00Z
    let days = secs / 86400;
    let time_secs = secs % 86400;
    let hours = time_secs / 3600;
    let minutes = (time_secs % 3600) / 60;
    let seconds = time_secs % 60;

    // Days since epoch → date using the civil calendar algorithm.
    let (y, m, d) = epoch_days_to_date(days as i64);
    format!("{y:04}-{m:02}-{d:02}T{hours:02}:{minutes:02}:{seconds:02}Z")
}

/// Convert days since 1970-01-01 to (year, month, day).
fn epoch_days_to_date(days: i64) -> (i64, u32, u32) {
    // Algorithm from Howard Hinnant's date library (public domain).
    let z = days + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}

/// A shard record from the `tracker.cluster_management` table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShardRecord {
    pub instance_id: String,
    pub cluster_name: String,
    pub shard_id: i32,
    pub total_shards: i32,
    pub status: String,
    pub last_heartbeat: Option<String>,
    pub guild_count: Option<i32>,
    pub latency_ms: Option<f64>,
    pub hostname: Option<String>,
}

/// Shard tracker backed by Supabase PostgREST.
///
/// Manages shard assignments and heartbeats in the `tracker.cluster_management`
/// table. Uses the `Content-Profile: tracker` header since the table lives in
/// a non-default schema.
///
/// All operations are best-effort — errors are logged but never crash the bot.
pub struct ShardTracker {
    base_url: String,
    api_key: String,
    client: Client,
}

impl ShardTracker {
    /// Create a tracker from `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` env vars.
    /// Returns `None` if either variable is missing.
    pub fn from_env() -> Option<Self> {
        let base_url = std::env::var("SUPABASE_URL").ok()?;
        let api_key = std::env::var("SUPABASE_SERVICE_ROLE_KEY").ok()?;

        if base_url.is_empty() || api_key.is_empty() {
            return None;
        }

        let client = Client::builder()
            .build()
            .expect("Failed to build reqwest client for ShardTracker");

        info!("ShardTracker initialized (Supabase)");
        Some(Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            api_key,
            client,
        })
    }

    /// Build default headers for PostgREST requests to the `tracker` schema.
    fn headers(&self) -> HeaderMap {
        let mut h = HeaderMap::new();
        if let Ok(v) = HeaderValue::from_str(&self.api_key) {
            h.insert("apikey", v);
        }
        if let Ok(v) = HeaderValue::from_str(&format!("Bearer {}", self.api_key)) {
            h.insert(AUTHORIZATION, v);
        }
        h.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        // Non-default schema
        h.insert("Content-Profile", HeaderValue::from_static("tracker"));
        h.insert("Accept-Profile", HeaderValue::from_static("tracker"));
        h
    }

    /// Table URL.
    fn table_url(&self) -> String {
        format!("{}/rest/v1/cluster_management", self.base_url)
    }

    /// Record (upsert) a shard assignment discovered from Discord.
    ///
    /// Uses PostgREST upsert on the `(cluster_name, shard_id)` unique constraint
    /// so pod restarts update the existing row instead of returning a 409 conflict.
    pub async fn record_shard(
        &self,
        instance_id: &str,
        cluster_name: &str,
        shard_id: u32,
        total_shards: u32,
        guild_count: usize,
        latency_ms: f64,
    ) {
        let hostname = std::env::var("HOSTNAME").unwrap_or_default();
        let body = serde_json::json!({
            "instance_id": instance_id,
            "cluster_name": cluster_name,
            "shard_id": shard_id,
            "total_shards": total_shards,
            "status": "active",
            "last_heartbeat": now_iso8601(),
            "guild_count": guild_count,
            "latency_ms": latency_ms,
            "hostname": hostname,
            "bot_version": env!("CARGO_PKG_VERSION"),
        });

        let mut headers = self.headers();
        // PostgREST upsert: merge on the unique constraint columns
        headers.insert(
            "Prefer",
            HeaderValue::from_static("resolution=merge-duplicates,return=representation"),
        );

        // Specify conflict columns so PostgREST knows which constraint to match
        let url = format!("{}?on_conflict=cluster_name,shard_id", self.table_url());

        let res = self
            .client
            .post(&url)
            .headers(headers)
            .json(&body)
            .send()
            .await;

        match res {
            Ok(r) if r.status().is_success() => {
                info!(
                    shard_id,
                    total_shards, cluster_name, "Shard recorded in tracker"
                );
            }
            Ok(r) => {
                let status = r.status();
                let text = r.text().await.unwrap_or_default();
                warn!(%status, %text, "Failed to record shard in tracker");
            }
            Err(e) => {
                warn!(error = %e, "Failed to record shard (network error)");
            }
        }
    }

    /// Update heartbeat for an active shard.
    pub async fn update_heartbeat(
        &self,
        instance_id: &str,
        cluster_name: &str,
        guild_count: usize,
        latency_ms: f64,
    ) {
        let body = serde_json::json!({
            "last_heartbeat": now_iso8601(),
            "guild_count": guild_count,
            "latency_ms": latency_ms,
            "status": "active",
        });

        let url = format!(
            "{}?instance_id=eq.{}&cluster_name=eq.{}",
            self.table_url(),
            instance_id,
            cluster_name,
        );

        let mut headers = self.headers();
        headers.insert("Prefer", HeaderValue::from_static("return=minimal"));

        let res = self
            .client
            .patch(&url)
            .headers(headers)
            .json(&body)
            .send()
            .await;

        if let Err(e) = res {
            warn!(error = %e, "Heartbeat update failed");
        }
    }

    /// Mark this instance as inactive (graceful shutdown).
    #[allow(dead_code)]
    pub async fn cleanup_assignment(&self, instance_id: &str, cluster_name: &str) {
        let body = serde_json::json!({ "status": "inactive" });
        let url = format!(
            "{}?instance_id=eq.{}&cluster_name=eq.{}",
            self.table_url(),
            instance_id,
            cluster_name,
        );

        let mut headers = self.headers();
        headers.insert("Prefer", HeaderValue::from_static("return=minimal"));

        let res = self
            .client
            .patch(&url)
            .headers(headers)
            .json(&body)
            .send()
            .await;

        match res {
            Ok(_) => info!(instance_id, cluster_name, "Shard assignment cleaned up"),
            Err(e) => warn!(error = %e, "Failed to cleanup shard assignment"),
        }
    }

    /// Get all active shards in a cluster.
    pub async fn get_cluster_status(&self, cluster_name: &str) -> Vec<ShardRecord> {
        let url = format!(
            "{}?cluster_name=eq.{}&status=eq.active&order=shard_id.asc",
            self.table_url(),
            cluster_name,
        );

        let res = self.client.get(&url).headers(self.headers()).send().await;

        match res {
            Ok(r) if r.status().is_success() => {
                r.json::<Vec<ShardRecord>>().await.unwrap_or_default()
            }
            Ok(r) => {
                let status = r.status();
                warn!(%status, "Failed to fetch cluster status");
                Vec::new()
            }
            Err(e) => {
                warn!(error = %e, "Failed to fetch cluster status");
                Vec::new()
            }
        }
    }

    /// Clean up stale shard assignments via RPC.
    #[allow(dead_code)]
    pub async fn cleanup_stale(&self, threshold_minutes: i32) {
        let url = format!("{}/rest/v1/rpc/cleanup_stale_assignments", self.base_url);
        let body = serde_json::json!({
            "threshold_minutes": threshold_minutes,
        });

        let res = self
            .client
            .post(&url)
            .headers(self.headers())
            .json(&body)
            .send()
            .await;

        match res {
            Ok(r) if r.status().is_success() => {
                info!(threshold_minutes, "Stale shard cleanup completed");
            }
            Ok(r) => {
                let status = r.status();
                warn!(%status, "Stale shard cleanup RPC failed");
            }
            Err(e) => {
                warn!(error = %e, "Stale shard cleanup failed");
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shard_record_deserialize() {
        let json = r#"{
            "instance_id": "pod-abc",
            "cluster_name": "default",
            "shard_id": 0,
            "total_shards": 2,
            "status": "active",
            "last_heartbeat": "2026-02-24T12:00:00Z",
            "guild_count": 42,
            "latency_ms": 55.3,
            "hostname": "pod-abc"
        }"#;
        let record: ShardRecord = serde_json::from_str(json).unwrap();
        assert_eq!(record.shard_id, 0);
        assert_eq!(record.total_shards, 2);
        assert_eq!(record.status, "active");
        assert_eq!(record.guild_count, Some(42));
    }

    #[test]
    fn shard_record_deserialize_nulls() {
        let json = r#"{
            "instance_id": "x",
            "cluster_name": "default",
            "shard_id": 1,
            "total_shards": 2,
            "status": "inactive",
            "last_heartbeat": null,
            "guild_count": null,
            "latency_ms": null,
            "hostname": null
        }"#;
        let record: ShardRecord = serde_json::from_str(json).unwrap();
        assert_eq!(record.shard_id, 1);
        assert!(record.guild_count.is_none());
    }

    #[test]
    fn from_env_returns_none_without_vars() {
        // Env vars are not set in test environment
        // This just confirms it doesn't panic
        let _ = ShardTracker::from_env();
    }
}
