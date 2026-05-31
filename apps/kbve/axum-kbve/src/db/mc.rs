use dashmap::DashMap;
use futures_util::future::join_all;
use jedi::rcon::{RconClient, RconEndpoint as RconConn};
use serde::Serialize;
use std::sync::{Arc, OnceLock};
use std::time::{Duration, Instant};
use tracing::{debug, warn};

use super::ensure_https;

const REFRESH_INTERVAL: Duration = Duration::from_secs(15);
const PLAYER_TTL: Duration = Duration::from_secs(3600); // 1h
const RCON_TIMEOUT: Duration = Duration::from_secs(5);
const CH_WRITE_TIMEOUT: Duration = Duration::from_secs(10);

const MOJANG_API: &str = "https://api.mojang.com/users/profiles/minecraft";
const MOJANG_SESSION: &str = "https://sessionserver.mojang.com/session/minecraft/profile";

/// Probed env-var suffixes for the multi-server scheme. Add a new backend
/// by listing its suffix here — each maps to `MC_RCON_<NAME>_HOST` / `_PORT`
/// / `_PASSWORD`.
const KNOWN_SERVERS: &[&str] = &["LOBBY", "SURVIVAL"];

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

/// `(server_name, rcon_list_result)` returned by each parallel RCON
/// poll. Factored out to silence the `type_complexity` clippy lint.
type RconPollResult = (String, anyhow::Result<(Vec<String>, usize)>);

/// One named MC backend keyed by its env-var suffix ("lobby", "survival").
/// The transport-level connection params live in [`RconConn`]; this wrapper
/// adds the logical name surfaced on each `McPlayer` and ClickHouse row.
#[derive(Clone, Debug)]
struct RconEndpoint {
    name: String,
    conn: RconConn,
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
    player_list: Arc<tokio::sync::RwLock<Option<McPlayerList>>>,
    players: Arc<DashMap<String, CachedPlayer>>,
}

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
                conn: RconConn::new(host, port, password),
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
                conn: RconConn::new(host, port, password),
            });
        }
    }

    out
}

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

    /// Resolve a Minecraft UUID to its current skin_url, scanning the
    /// online-player cache first and falling back to Mojang sessionserver.
    /// Returns None when Mojang has no profile or the player has no skin.
    pub async fn resolve_skin_by_uuid(&self, uuid: &str) -> Option<String> {
        let target = uuid.replace('-', "").to_lowercase();

        for entry in self.players.iter() {
            if entry.uuid.eq_ignore_ascii_case(&target) && !entry.is_expired() {
                return entry.skin_url.clone();
            }
        }

        self.fetch_skin_url(&target).await
    }

    /// Proxy-fetch a skin texture PNG from textures.minecraft.net.
    /// `hash` must be a 60-64 character hex string (validated by caller).
    /// Caches bytes in the player's DashMap entry for subsequent requests.
    pub async fn fetch_texture(&self, hash: &str) -> Option<Vec<u8>> {
        let target_suffix = format!("/texture/{hash}");

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

        let url = format!("https://textures.minecraft.net/texture/{hash}");
        let resp = self.http.get(&url).send().await.ok()?;
        if !resp.status().is_success() {
            return None;
        }
        let bytes = resp.bytes().await.ok()?.to_vec();

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

impl McService {
    /// Poll every configured endpoint in parallel so one unreachable backend
    /// (e.g. an Agones fleet with 0 Fabric pods) doesn't sink the others.
    async fn refresh_player_list(&self) {
        let polls = self.endpoints.iter().map(|ep| {
            let ep = ep.clone();
            async move {
                let result = Self::rcon_list(&ep).await;
                (ep.name, result)
            }
        });
        let results: Vec<RconPollResult> = join_all(polls).await;

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

        self.players.retain(|_, v| !v.is_expired());

        debug!(
            "MC refresh: {} players across {} servers",
            all_players.len(),
            server_statuses.len()
        );

        // ClickHouse write is best-effort: failures don't affect the
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

        if let Some(entry) = self.players.get(&lower) {
            if !entry.is_expired() {
                return Some(entry.clone());
            }
        }

        let url = format!("{MOJANG_API}/{name}");
        let url = ensure_https(&url).ok()?;
        let resp = self.http.get(url).send().await.ok()?;
        if !resp.status().is_success() {
            return None;
        }
        let body: serde_json::Value = resp.json().await.ok()?;
        let uuid = body.get("id")?.as_str()?.to_string();

        let skin_url = self.fetch_skin_url(&uuid).await;

        // Preserve cached texture_bytes when the skin_url hasn't changed.
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

impl McService {
    /// Connect to RCON, run `list`, return (player_names, max_players).
    /// Associated function so each endpoint can be polled in parallel without
    /// borrowing &self across the join_all boundary.
    async fn rcon_list(ep: &RconEndpoint) -> anyhow::Result<(Vec<String>, usize)> {
        let mut client = RconClient::connect(&ep.conn, RCON_TIMEOUT).await?;
        let body = client.exec("list").await?;
        parse_list_response(&body)
    }
}

/// Writer for the per-poll snapshot into `mc.player_snapshots_distributed`.
/// Schema lives in `apps/kube/kbve/manifest/mc-presence-ch-setup-job.yaml`.
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
        // Skip empty snapshots — the schema is per-player, so there's nothing
        // to record when every server is empty. The `reachable` flag + the
        // in-memory cache cover server liveness at query time.
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

/// Parse Minecraft `list` response:
/// "There are N of a max of M players online: name1, name2, ..."
/// or "There are 0 of a max of M players online:"
fn parse_list_response(response: &str) -> anyhow::Result<(Vec<String>, usize)> {
    let max = response
        .split("max of ")
        .nth(1)
        .and_then(|s| s.split_whitespace().next())
        .and_then(|s| s.parse::<usize>().ok())
        .unwrap_or(0);

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

/// Extract the 60-64 char hex texture hash from a textures.minecraft.net URL.
pub fn extract_texture_hash(skin_url: &str) -> Option<String> {
    let trimmed = skin_url.trim_end_matches('/');
    let tail = trimmed.rsplit('/').next()?;
    if (60..=64).contains(&tail.len()) && tail.chars().all(|c| c.is_ascii_hexdigit()) {
        Some(tail.to_string())
    } else {
        None
    }
}

/// Extract skin URL from Mojang session profile response.
/// The `properties` array contains a base64-encoded JSON with texture URLs.
fn extract_skin_url(profile: &serde_json::Value) -> Option<String> {
    let properties = profile.get("properties")?.as_array()?;
    let textures_prop = properties
        .iter()
        .find(|p| p.get("name").and_then(|n| n.as_str()) == Some("textures"))?;
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
