// MC RCON client with multi-server support, DashMap-cached player data,
// Mojang profile enrichment, and ClickHouse snapshot publishing.
//
// Background task polls every configured RCON endpoint in parallel every
// 15s, tags each player with the backend server they're on, resolves
// UUIDs + textures via Mojang, and writes a snapshot row per player to
// `mc.player_snapshots_distributed` in ClickHouse. axum-kbve serves its
// own /api/v1/mc/players from an in-memory cache for low latency; edge
// functions and other consumers read historical state from ClickHouse.

use dashmap::DashMap;
use futures_util::future::join_all;
use serde::Serialize;
use std::sync::{Arc, OnceLock};
use std::time::{Duration, Instant};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tracing::{debug, warn};

use super::ensure_https;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const REFRESH_INTERVAL: Duration = Duration::from_secs(15);
const PLAYER_TTL: Duration = Duration::from_secs(3600); // 1h
const RCON_TIMEOUT: Duration = Duration::from_secs(5);
const CH_WRITE_TIMEOUT: Duration = Duration::from_secs(10);

const MOJANG_API: &str = "https://api.mojang.com/users/profiles/minecraft";
const MOJANG_SESSION: &str = "https://sessionserver.mojang.com/session/minecraft/profile";

// Names we probe for multi-server env var prefixes. Add new backends
// by listing their env var suffix here — each maps to
// MC_RCON_<NAME>_HOST / _PORT / _PASSWORD.
const KNOWN_SERVERS: &[&str] = &["LOBBY", "SURVIVAL"];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// API response model — serialized to JSON for `/api/v1/mc/players`.
#[derive(Clone, Debug, Serialize)]
pub struct McPlayer {
    pub name: String,
    pub uuid: Option<String>,
    pub skin_url: Option<String>,
    /// Backend server the player is connected to ("lobby", "survival").
    pub server: String,
}

/// Per-server status for API clients that want a breakdown by backend.
/// `reachable=false` means the RCON call failed this interval — the
/// player list for that server is stale or empty in the aggregate
/// response.
#[derive(Clone, Debug, Serialize)]
pub struct McServerStatus {
    pub server: String,
    pub online: usize,
    pub max: usize,
    pub reachable: bool,
}

#[derive(Clone, Debug, Serialize)]
pub struct McPlayerList {
    /// Total online across all reachable servers.
    pub online: usize,
    /// Sum of `max_slots` across all reachable servers.
    pub max: usize,
    pub players: Vec<McPlayer>,
    pub servers: Vec<McServerStatus>,
    pub cached_at: u64,
}

/// One RCON endpoint. Multiple can be configured for lobby + survival +
/// future backends.
#[derive(Clone, Debug)]
struct RconEndpoint {
    /// Lowercase server name ("lobby", "survival"). Surfaced on each
    /// McPlayer and written to ClickHouse.
    name: String,
    host: String,
    port: u16,
    password: String,
}

/// Single cache entry holding all resolved data for a Minecraft player.
/// Keyed by lowercase player name in the DashMap.
#[derive(Clone, Debug)]
struct CachedPlayer {
    #[allow(dead_code)]
    name: String,
    uuid: String,
    skin_url: Option<String>,
    /// Lazily populated when the texture proxy endpoint is hit.
    texture_bytes: Option<Vec<u8>>,
    resolved_at: Instant,
}

impl CachedPlayer {
    fn is_expired(&self) -> bool {
        self.resolved_at.elapsed() > PLAYER_TTL
    }
}

pub struct McService {
    endpoints: Vec<RconEndpoint>,
    http: reqwest::Client,
    /// Optional — writes every snapshot to ClickHouse when configured.
    /// None means CH env vars were missing and we're in-memory only.
    clickhouse: Option<ClickHouseWriter>,
    // Cached player list (refreshed by background task)
    player_list: Arc<tokio::sync::RwLock<Option<McPlayerList>>>,
    // Single cache for all player data (name → uuid + skin_url + texture_bytes)
    players: Arc<DashMap<String, CachedPlayer>>,
}

// ---------------------------------------------------------------------------
// Global singleton (same pattern as osrs.rs, discord.rs)
// ---------------------------------------------------------------------------

static MC_SERVICE: OnceLock<Arc<McService>> = OnceLock::new();

pub fn get_mc_service() -> Option<&'static Arc<McService>> {
    MC_SERVICE.get()
}

pub fn init_mc_service() -> bool {
    let endpoints = parse_rcon_endpoints();
    if endpoints.is_empty() {
        return false;
    }

    let svc = Arc::new(McService {
        endpoints,
        http: reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .unwrap_or_default(),
        clickhouse: ClickHouseWriter::from_env(),
        player_list: Arc::new(tokio::sync::RwLock::new(None)),
        players: Arc::new(DashMap::new()),
    });

    if MC_SERVICE.set(svc.clone()).is_err() {
        return false;
    }

    // Spawn background refresh task with panic recovery
    tokio::spawn(async move {
        loop {
            let svc_ref = svc.clone();
            let result = tokio::task::spawn(async move {
                svc_ref.refresh_player_list().await;
            })
            .await;
            if let Err(e) = result {
                warn!("MC refresh task recovered from panic: {e}");
            }
            tokio::time::sleep(REFRESH_INTERVAL).await;
        }
    });

    true
}

/// Parse RCON endpoints from env vars. Prefers the multi-server scheme
/// (`MC_RCON_LOBBY_*`, `MC_RCON_SURVIVAL_*`). Falls back to the legacy
/// single-server scheme (`MC_RCON_HOST`/`MC_RCON_PORT`/`MC_RCON_PASSWORD`,
/// reported as server="default") if no prefixed vars are set.
fn parse_rcon_endpoints() -> Vec<RconEndpoint> {
    let mut out = Vec::new();

    for name in KNOWN_SERVERS {
        if let Ok(host) = std::env::var(format!("MC_RCON_{name}_HOST")) {
            let port = std::env::var(format!("MC_RCON_{name}_PORT"))
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(25575);
            let password = std::env::var(format!("MC_RCON_{name}_PASSWORD")).unwrap_or_default();
            out.push(RconEndpoint {
                name: name.to_lowercase(),
                host,
                port,
                password,
            });
        }
    }

    if out.is_empty() {
        if let Ok(host) = std::env::var("MC_RCON_HOST") {
            let port = std::env::var("MC_RCON_PORT")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(25575);
            let password = std::env::var("MC_RCON_PASSWORD").unwrap_or_default();
            out.push(RconEndpoint {
                name: "default".to_string(),
                host,
                port,
                password,
            });
        }
    }

    out
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

impl McService {
    pub async fn get_players(&self) -> McPlayerList {
        self.player_list
            .read()
            .await
            .clone()
            .unwrap_or(McPlayerList {
                online: 0,
                max: 0,
                players: vec![],
                servers: vec![],
                cached_at: now_epoch(),
            })
    }

    /// Proxy-fetch a skin texture PNG from textures.minecraft.net.
    /// `hash` must be a 60-64 character hex string (validated by caller).
    /// Caches bytes in the player's DashMap entry for subsequent requests.
    pub async fn fetch_texture(&self, hash: &str) -> Option<Vec<u8>> {
        let target_suffix = format!("/texture/{hash}");

        // Check if any cached player already has the bytes
        for entry in self.players.iter() {
            if let Some(ref url) = entry.skin_url {
                if url.ends_with(&target_suffix) {
                    if let Some(ref bytes) = entry.texture_bytes {
                        return Some(bytes.clone());
                    }
                    break;
                }
            }
        }

        // Fetch from Mojang
        let url = format!("https://textures.minecraft.net/texture/{hash}");
        let resp = self.http.get(&url).send().await.ok()?;
        if !resp.status().is_success() {
            return None;
        }
        let bytes = resp.bytes().await.ok()?.to_vec();

        // Store in matching player's entry (if found)
        for mut entry in self.players.iter_mut() {
            if let Some(ref skin_url) = entry.skin_url {
                if skin_url.ends_with(&target_suffix) {
                    entry.texture_bytes = Some(bytes.clone());
                    break;
                }
            }
        }

        Some(bytes)
    }
}

// ---------------------------------------------------------------------------
// Background refresh
// ---------------------------------------------------------------------------

impl McService {
    async fn refresh_player_list(&self) {
        // Poll every configured endpoint in parallel. If one is down
        // (e.g. Agones fleet has 0 Fabric pods), the others still land.
        let polls = self.endpoints.iter().map(|ep| {
            let ep = ep.clone();
            async move {
                let result = Self::rcon_list(&ep).await;
                (ep.name, result)
            }
        });
        let results: Vec<(String, anyhow::Result<(Vec<String>, usize)>)> = join_all(polls).await;

        let mut all_players: Vec<McPlayer> = Vec::new();
        let mut server_statuses: Vec<McServerStatus> = Vec::new();
        let mut total_online = 0usize;
        let mut total_max = 0usize;

        for (server_name, result) in results {
            match result {
                Ok((names, max)) => {
                    total_online += names.len();
                    total_max += max;
                    server_statuses.push(McServerStatus {
                        server: server_name.clone(),
                        online: names.len(),
                        max,
                        reachable: true,
                    });
                    for name in names {
                        let cached = self.resolve_player(&name).await;
                        all_players.push(McPlayer {
                            name,
                            uuid: cached.as_ref().map(|c| c.uuid.clone()),
                            skin_url: cached.and_then(|c| c.skin_url),
                            server: server_name.clone(),
                        });
                    }
                }
                Err(e) => {
                    warn!(server = %server_name, error = %e, "RCON list failed");
                    server_statuses.push(McServerStatus {
                        server: server_name,
                        online: 0,
                        max: 0,
                        reachable: false,
                    });
                }
            }
        }

        let list = McPlayerList {
            online: total_online,
            max: total_max,
            players: all_players.clone(),
            servers: server_statuses.clone(),
            cached_at: now_epoch(),
        };

        *self.player_list.write().await = Some(list);

        // Evict expired entries
        self.players.retain(|_, v| !v.is_expired());

        debug!(
            "MC refresh: {} players across {} servers",
            all_players.len(),
            server_statuses.len()
        );

        // ClickHouse write is best-effort — failures don't affect the
        // in-memory cache that serves /api/v1/mc/players.
        if let Some(ref ch) = self.clickhouse {
            if let Err(e) = ch.write_snapshot(&server_statuses, &all_players).await {
                warn!(error = %e, "ClickHouse snapshot write failed");
            }
        }
    }

    /// Resolve player name → full profile (UUID + skin URL) via DashMap cache
    /// or Mojang API. Returns the cached entry if fresh, otherwise fetches.
    async fn resolve_player(&self, name: &str) -> Option<CachedPlayer> {
        let lower = name.to_lowercase();

        // Check cache
        if let Some(entry) = self.players.get(&lower) {
            if !entry.is_expired() {
                return Some(entry.clone());
            }
        }

        // Fetch UUID from Mojang
        let url = format!("{MOJANG_API}/{name}");
        let url = ensure_https(&url).ok()?;
        let resp = self.http.get(url).send().await.ok()?;
        if !resp.status().is_success() {
            return None;
        }
        let body: serde_json::Value = resp.json().await.ok()?;
        let uuid = body.get("id")?.as_str()?.to_string();

        // Fetch skin URL from Mojang session server
        let skin_url = self.fetch_skin_url(&uuid).await;

        // Preserve existing texture_bytes if the skin_url hasn't changed
        let texture_bytes = self.players.get(&lower).and_then(|old| {
            if old.skin_url == skin_url {
                old.texture_bytes.clone()
            } else {
                None
            }
        });

        let player = CachedPlayer {
            name: name.to_string(),
            uuid,
            skin_url,
            texture_bytes,
            resolved_at: Instant::now(),
        };

        self.players.insert(lower, player.clone());
        Some(player)
    }

    /// Fetch skin texture URL from Mojang session server.
    async fn fetch_skin_url(&self, uuid: &str) -> Option<String> {
        let url = format!("{MOJANG_SESSION}/{uuid}");
        let url = ensure_https(&url).ok()?;
        let resp = self.http.get(url).send().await.ok()?;
        if !resp.status().is_success() {
            return None;
        }
        let body: serde_json::Value = resp.json().await.ok()?;
        extract_skin_url(&body)
    }
}

// ---------------------------------------------------------------------------
// RCON protocol (Minecraft/Source RCON — simple length-prefixed TCP packets)
// ---------------------------------------------------------------------------

// Packet types
const RCON_AUTH: i32 = 3;
const RCON_EXEC: i32 = 2;

impl McService {
    /// Connect to RCON, authenticate, run `list`, return (player_names, max_players).
    /// Associated function so each endpoint can be polled in parallel without
    /// borrowing &self across the join_all boundary.
    async fn rcon_list(ep: &RconEndpoint) -> anyhow::Result<(Vec<String>, usize)> {
        let addr = format!("{}:{}", ep.host, ep.port);
        let mut stream = tokio::time::timeout(RCON_TIMEOUT, TcpStream::connect(&addr)).await??;

        // Authenticate
        rcon_send(&mut stream, 1, RCON_AUTH, &ep.password).await?;
        let (req_id, _, _) = rcon_recv(&mut stream).await?;
        if req_id == -1 {
            anyhow::bail!("RCON authentication failed");
        }

        // Send `list` command
        rcon_send(&mut stream, 2, RCON_EXEC, "list").await?;
        let (_, _, body) = rcon_recv(&mut stream).await?;

        parse_list_response(&body)
    }
}

/// Send an RCON packet: [length:4][req_id:4][type:4][body + \0][pad \0]
///
/// The entire packet is buffered and sent in a single write to avoid
/// TCP segmentation issues with RCON servers that expect atomic reads.
async fn rcon_send(
    stream: &mut TcpStream,
    req_id: i32,
    ptype: i32,
    body: &str,
) -> anyhow::Result<()> {
    let body_bytes = body.as_bytes();
    let length = 4 + 4 + body_bytes.len() as i32 + 2; // req_id + type + body + 2 nulls

    let mut buf = Vec::with_capacity(4 + length as usize);
    buf.extend_from_slice(&length.to_le_bytes());
    buf.extend_from_slice(&req_id.to_le_bytes());
    buf.extend_from_slice(&ptype.to_le_bytes());
    buf.extend_from_slice(body_bytes);
    buf.extend_from_slice(&[0, 0]);

    stream.write_all(&buf).await?;
    stream.flush().await?;
    Ok(())
}

/// Read an RCON response packet, returns (req_id, type, body).
async fn rcon_recv(stream: &mut TcpStream) -> anyhow::Result<(i32, i32, String)> {
    let mut len_buf = [0u8; 4];
    stream.read_exact(&mut len_buf).await?;
    let length = i32::from_le_bytes(len_buf) as usize;

    if length < 10 || length > 4096 {
        anyhow::bail!("RCON packet length out of range: {length}");
    }

    let mut payload = vec![0u8; length];
    stream.read_exact(&mut payload).await?;

    let req_id = i32::from_le_bytes([payload[0], payload[1], payload[2], payload[3]]);
    let ptype = i32::from_le_bytes([payload[4], payload[5], payload[6], payload[7]]);
    // Body is everything after the 8-byte header, minus 2 trailing nulls
    let body_end = length.saturating_sub(2);
    let body = String::from_utf8_lossy(&payload[8..body_end]).to_string();

    Ok((req_id, ptype, body))
}

// ---------------------------------------------------------------------------
// ClickHouse writer — snapshot per player per poll into
// mc.player_snapshots_distributed. Schema lives in
// apps/kube/kbve/manifest/mc-presence-ch-setup-job.yaml.
// ---------------------------------------------------------------------------

struct ClickHouseWriter {
    endpoint: String,
    user: String,
    password: String,
    client: reqwest::Client,
}

impl ClickHouseWriter {
    fn from_env() -> Option<Self> {
        let endpoint = std::env::var("CLICKHOUSE_ENDPOINT").ok()?;
        let user = std::env::var("CLICKHOUSE_USER").ok()?;
        let password = std::env::var("CLICKHOUSE_PASSWORD").unwrap_or_default();
        let client = reqwest::Client::builder()
            .timeout(CH_WRITE_TIMEOUT)
            .build()
            .ok()?;
        Some(Self {
            endpoint: endpoint.trim_end_matches('/').to_string(),
            user,
            password,
            client,
        })
    }

    async fn write_snapshot(
        &self,
        servers: &[McServerStatus],
        players: &[McPlayer],
    ) -> anyhow::Result<()> {
        // Skip empty snapshots — the schema is per-player, so there's
        // nothing to record when every server is empty. The reachable
        // flag + in-memory cache cover server liveness at query time.
        if players.is_empty() {
            return Ok(());
        }

        let timestamp = chrono::Utc::now()
            .format("%Y-%m-%d %H:%M:%S%.3f")
            .to_string();

        let mut payload = String::with_capacity(players.len() * 128);
        for p in players {
            let status = servers.iter().find(|s| s.server == p.server);
            let online = status.map(|s| s.online).unwrap_or(0);
            let max = status.map(|s| s.max).unwrap_or(0);

            let row = serde_json::json!({
                "timestamp": timestamp,
                "server": p.server,
                "name": p.name,
                "uuid": p.uuid.clone().unwrap_or_default(),
                "online_count": online,
                "max_slots": max,
            });
            payload.push_str(&row.to_string());
            payload.push('\n');
        }

        let url = format!(
            "{}/?query=INSERT+INTO+mc.player_snapshots_distributed+FORMAT+JSONEachRow",
            self.endpoint
        );
        let resp = self
            .client
            .post(&url)
            .basic_auth(&self.user, Some(&self.password))
            .body(payload)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!("ClickHouse insert failed: status={status} body={body}");
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

/// Parse Minecraft `list` response:
/// "There are N of a max of M players online: name1, name2, ..."
/// or "There are 0 of a max of M players online:"
fn parse_list_response(response: &str) -> anyhow::Result<(Vec<String>, usize)> {
    // Find "max of N" to extract max players
    let max = response
        .split("max of ")
        .nth(1)
        .and_then(|s| s.split_whitespace().next())
        .and_then(|s| s.parse::<usize>().ok())
        .unwrap_or(0);

    // Find player names after the colon
    let names = if let Some(after_colon) = response.split(':').nth(1) {
        let trimmed = after_colon.trim();
        if trimmed.is_empty() {
            vec![]
        } else {
            trimmed
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect()
        }
    } else {
        vec![]
    };

    Ok((names, max))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Extract skin URL from Mojang session profile response.
/// The `properties` array contains a base64-encoded JSON with texture URLs.
fn extract_skin_url(profile: &serde_json::Value) -> Option<String> {
    let properties = profile.get("properties")?.as_array()?;
    let textures_prop = properties.iter().find(|p| {
        p.get("name")
            .and_then(|n| n.as_str())
            .map_or(false, |n| n == "textures")
    })?;
    let b64 = textures_prop.get("value")?.as_str()?;

    let decoded = base64_decode(b64)?;
    let json: serde_json::Value = serde_json::from_slice(&decoded).ok()?;

    json.get("textures")?
        .get("SKIN")?
        .get("url")?
        .as_str()
        .map(String::from)
}

/// Minimal base64 decode (standard alphabet, with padding).
fn base64_decode(input: &str) -> Option<Vec<u8>> {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    let mut out = Vec::with_capacity(input.len() * 3 / 4);
    let mut buf: u32 = 0;
    let mut bits: u32 = 0;

    for &b in input.as_bytes() {
        let val = if b == b'=' {
            continue;
        } else if let Some(pos) = TABLE.iter().position(|&c| c == b) {
            pos as u32
        } else if b == b'\n' || b == b'\r' || b == b' ' {
            continue;
        } else {
            return None;
        };

        buf = (buf << 6) | val;
        bits += 6;

        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8);
            buf &= (1 << bits) - 1;
        }
    }

    Some(out)
}

fn now_epoch() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_list_with_players() {
        let resp = "There are 3 of a max of 20 players online: Alice, Bob, Charlie";
        let (names, max) = parse_list_response(resp).unwrap();
        assert_eq!(max, 20);
        assert_eq!(names, vec!["Alice", "Bob", "Charlie"]);
    }

    #[test]
    fn test_parse_list_empty() {
        let resp = "There are 0 of a max of 20 players online:";
        let (names, max) = parse_list_response(resp).unwrap();
        assert_eq!(max, 20);
        assert!(names.is_empty());
    }

    #[test]
    fn test_base64_decode() {
        let encoded = "SGVsbG8gV29ybGQ=";
        let decoded = base64_decode(encoded).unwrap();
        assert_eq!(&decoded, b"Hello World");
    }

    #[test]
    fn test_extract_skin_url() {
        let texture_json =
            r#"{"textures":{"SKIN":{"url":"https://textures.minecraft.net/texture/abc123"}}}"#;
        let b64 = {
            const TABLE: &[u8; 64] =
                b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
            let input = texture_json.as_bytes();
            let mut out = String::new();
            let mut i = 0;
            while i < input.len() {
                let b0 = input[i] as u32;
                let b1 = if i + 1 < input.len() {
                    input[i + 1] as u32
                } else {
                    0
                };
                let b2 = if i + 2 < input.len() {
                    input[i + 2] as u32
                } else {
                    0
                };
                let triple = (b0 << 16) | (b1 << 8) | b2;
                out.push(TABLE[((triple >> 18) & 0x3F) as usize] as char);
                out.push(TABLE[((triple >> 12) & 0x3F) as usize] as char);
                if i + 1 < input.len() {
                    out.push(TABLE[((triple >> 6) & 0x3F) as usize] as char);
                } else {
                    out.push('=');
                }
                if i + 2 < input.len() {
                    out.push(TABLE[(triple & 0x3F) as usize] as char);
                } else {
                    out.push('=');
                }
                i += 3;
            }
            out
        };

        let profile = serde_json::json!({
            "id": "abc",
            "name": "Test",
            "properties": [
                {
                    "name": "textures",
                    "value": b64
                }
            ]
        });

        let url = extract_skin_url(&profile).unwrap();
        assert_eq!(url, "https://textures.minecraft.net/texture/abc123");
    }
}
