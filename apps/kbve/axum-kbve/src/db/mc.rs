// MC RCON client with DashMap-cached player data and Mojang profile enrichment.
//
// Background task polls RCON `list` every 15s, resolves UUIDs + textures
// via Mojang API, and stores results in a single DashMap for instant lookups.

use dashmap::DashMap;
use serde::Serialize;
use std::sync::{Arc, OnceLock};
use std::time::{Duration, Instant};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tracing::{debug, warn};

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const REFRESH_INTERVAL: Duration = Duration::from_secs(15);
const PLAYER_TTL: Duration = Duration::from_secs(3600); // 1h
const RCON_TIMEOUT: Duration = Duration::from_secs(5);

const MOJANG_API: &str = "https://api.mojang.com/users/profiles/minecraft";
const MOJANG_SESSION: &str = "https://sessionserver.mojang.com/session/minecraft/profile";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// API response model — serialized to JSON for `/api/v1/mc/players`.
#[derive(Clone, Debug, Serialize)]
pub struct McPlayer {
    pub name: String,
    pub uuid: Option<String>,
    pub skin_url: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
pub struct McPlayerList {
    pub online: usize,
    pub max: usize,
    pub players: Vec<McPlayer>,
    pub cached_at: u64,
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
    rcon_host: String,
    rcon_port: u16,
    rcon_password: String,
    http: reqwest::Client,
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
    let host = match std::env::var("MC_RCON_HOST") {
        Ok(h) => h,
        Err(_) => return false,
    };
    let port: u16 = std::env::var("MC_RCON_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(25575);
    let password = std::env::var("MC_RCON_PASSWORD").unwrap_or_default();

    let svc = Arc::new(McService {
        rcon_host: host,
        rcon_port: port,
        rcon_password: password,
        http: reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .unwrap_or_default(),
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
        let rcon_result = self.rcon_list().await;

        let (names, max) = match rcon_result {
            Ok(r) => r,
            Err(e) => {
                warn!(error = %e, "RCON list failed");
                return;
            }
        };

        let mut players = Vec::with_capacity(names.len());

        for name in &names {
            let cached = self.resolve_player(name).await;
            players.push(McPlayer {
                name: name.clone(),
                uuid: cached.as_ref().map(|c| c.uuid.clone()),
                skin_url: cached.and_then(|c| c.skin_url),
            });
        }

        let list = McPlayerList {
            online: players.len(),
            max,
            players,
            cached_at: now_epoch(),
        };

        *self.player_list.write().await = Some(list);

        // Evict expired entries
        self.players.retain(|_, v| !v.is_expired());

        debug!("MC player list refreshed ({} players)", names.len());
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
        let resp = self.http.get(&url).send().await.ok()?;
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
        let resp = self.http.get(&url).send().await.ok()?;
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
    async fn rcon_list(&self) -> anyhow::Result<(Vec<String>, usize)> {
        let addr = format!("{}:{}", self.rcon_host, self.rcon_port);
        let mut stream = tokio::time::timeout(RCON_TIMEOUT, TcpStream::connect(&addr)).await??;

        // Authenticate
        rcon_send(&mut stream, 1, RCON_AUTH, &self.rcon_password).await?;
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
