// OSRS item and price cache actor
//
// Loads item mapping on startup, refreshes prices periodically.
// Uses DashMap for concurrent access with bidirectional lookups.

use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{mpsc, oneshot};

/// Cache configuration
const PRICE_REFRESH_INTERVAL: Duration = Duration::from_secs(60);
const CHANNEL_BUFFER: usize = 256;
const USER_AGENT: &str = "KBVE item_tracker - @h0lybyte on Discord";

/// Convert hex digit to numeric value (0-15)
#[inline(always)]
fn from_hex(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

/// Normalize URL path to item name lookup key.
/// Single-pass: URL decode + separator normalize + lowercase.
/// Only one allocation (final String). No regex.
///
/// Handles:
/// - "Dragon_hunter_crossbow" -> "dragon hunter crossbow"
/// - "Dragon-hunter-crossbow" -> "dragon hunter crossbow"
/// - "Dragon+hunter+crossbow" -> "dragon hunter crossbow"
/// - "Dragon%20hunter%20crossbow" -> "dragon hunter crossbow"
pub fn normalize_item_name(url_path: &str) -> String {
    thread_local! {
        static BUF: std::cell::RefCell<Vec<u8>> = std::cell::RefCell::new(Vec::with_capacity(128));
    }

    BUF.with(|buf| {
        let mut buf = buf.borrow_mut();
        buf.clear();

        let bytes = url_path.as_bytes();
        let mut i = 0;

        while i < bytes.len() {
            let b = match bytes[i] {
                // Percent-encoded sequence
                b'%' if i + 2 < bytes.len() => {
                    if let (Some(hi), Some(lo)) = (from_hex(bytes[i + 1]), from_hex(bytes[i + 2])) {
                        i += 3;
                        (hi << 4) | lo
                    } else {
                        // Invalid hex - preserve the '%'
                        i += 1;
                        b'%'
                    }
                }
                // Separators -> space (replaces regex)
                b'+' | b'_' | b'-' => {
                    i += 1;
                    b' '
                }
                // Normal byte
                b => {
                    i += 1;
                    b
                }
            };

            // ASCII lowercase in same pass (safe for UTF-8 since uppercase ASCII is single-byte)
            buf.push(if b.is_ascii_uppercase() { b + 32 } else { b });
        }

        // Single allocation: convert buffer to String
        // from_utf8_lossy handles any invalid UTF-8 from malformed percent sequences
        String::from_utf8_lossy(&buf).into_owned()
    })
}

/// Convert item name to canonical URL path
/// "Dragon hunter crossbow" -> "Dragon_hunter_crossbow"
#[inline]
pub fn item_name_to_url(name: &str) -> String {
    name.replace(' ', "_")
}

/// URL-encode icon filename for wiki image URLs
/// "Dragon hunter crossbow.png" -> "Dragon_hunter_crossbow.png"
/// Note: OSRS Wiki uses underscores for spaces in image URLs
#[inline]
#[allow(dead_code)]
pub fn encode_icon_url(icon: &str) -> String {
    icon.replace(' ', "_")
}

/// OSRS item metadata from mapping API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OSRSItem {
    pub id: u32,
    pub name: String,
    pub examine: String,
    pub members: bool,
    #[serde(default)]
    pub lowalch: Option<u32>,
    #[serde(default)]
    pub highalch: Option<u32>,
    #[serde(default)]
    pub limit: Option<u32>,
    #[serde(default)]
    pub value: Option<u32>,
    pub icon: String,
}

/// OSRS price data from latest API
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct OSRSPrice {
    pub high: Option<u64>,
    #[serde(rename = "highTime")]
    pub high_time: Option<u64>,
    pub low: Option<u64>,
    #[serde(rename = "lowTime")]
    pub low_time: Option<u64>,
}

// Note: Volume data is now calculated client-side from the timeseries API
// This provides more accurate and flexible volume calculations

/// Combined item with current price for template rendering
#[derive(Debug, Clone)]
pub struct OSRSItemWithPrice {
    pub item: Arc<OSRSItem>,
    pub price: OSRSPrice,
    #[allow(dead_code)]
    pub canonical_url: String,
}

/// Commands sent to the OSRS cache actor
pub enum OSRSCacheCommand {
    /// Get item by name (case-insensitive, underscore-normalized)
    GetByName {
        name: String,
        reply: oneshot::Sender<Option<OSRSItemWithPrice>>,
    },
    /// Get item by numeric ID
    GetById {
        id: u32,
        reply: oneshot::Sender<Option<OSRSItemWithPrice>>,
    },
    /// Get cache statistics
    #[allow(dead_code)]
    Stats {
        reply: oneshot::Sender<OSRSCacheStats>,
    },
    /// Force refresh prices now
    RefreshPrices, // used by price_refresh_loop
}

/// Cache statistics
#[derive(Debug, Clone)]
pub struct OSRSCacheStats {
    pub item_count: usize,
    pub prices_loaded: usize,
    pub last_price_refresh: Option<std::time::Instant>,
    pub hits: u64,
    pub misses: u64,
}

/// Handle to communicate with the OSRS cache actor
#[derive(Clone)]
pub struct OSRSCache {
    tx: mpsc::Sender<OSRSCacheCommand>,
}

impl OSRSCache {
    /// Get item by name (from URL path, e.g., "Dragon_hunter_crossbow")
    pub async fn get_by_name(&self, name: &str) -> Option<OSRSItemWithPrice> {
        let (reply_tx, reply_rx) = oneshot::channel();
        let normalized = normalize_item_name(name);

        let cmd = OSRSCacheCommand::GetByName {
            name: normalized,
            reply: reply_tx,
        };

        if self.tx.send(cmd).await.is_err() {
            tracing::error!("OSRS cache actor channel closed");
            return None;
        }

        reply_rx.await.unwrap_or(None)
    }

    /// Get item by numeric ID
    pub async fn get_by_id(&self, id: u32) -> Option<OSRSItemWithPrice> {
        let (reply_tx, reply_rx) = oneshot::channel();

        let cmd = OSRSCacheCommand::GetById {
            id,
            reply: reply_tx,
        };

        if self.tx.send(cmd).await.is_err() {
            tracing::error!("OSRS cache actor channel closed");
            return None;
        }

        reply_rx.await.unwrap_or(None)
    }

    /// Get cache statistics
    #[allow(dead_code)]
    pub async fn stats(&self) -> Option<OSRSCacheStats> {
        let (reply_tx, reply_rx) = oneshot::channel();
        let cmd = OSRSCacheCommand::Stats { reply: reply_tx };

        if self.tx.send(cmd).await.is_err() {
            return None;
        }

        reply_rx.await.ok()
    }

    /// Force a price refresh
    #[allow(dead_code)]
    pub async fn refresh_prices(&self) {
        let _ = self.tx.send(OSRSCacheCommand::RefreshPrices).await;
    }
}

/// Internal actor state
struct OSRSCacheActor {
    /// Name (lowercase) -> Item
    name_to_item: DashMap<String, Arc<OSRSItem>>,
    /// ID -> Item
    id_to_item: DashMap<u32, Arc<OSRSItem>>,
    /// ID -> Price (updated periodically from /latest)
    prices: DashMap<u32, OSRSPrice>,
    /// Statistics
    stats: OSRSCacheStats,
}

impl OSRSCacheActor {
    fn new() -> Self {
        Self {
            name_to_item: DashMap::new(),
            id_to_item: DashMap::new(),
            prices: DashMap::new(),
            stats: OSRSCacheStats {
                item_count: 0,
                prices_loaded: 0,
                last_price_refresh: None,
                hits: 0,
                misses: 0,
            },
        }
    }

    fn get_by_name(&self, name: &str) -> Option<OSRSItemWithPrice> {
        self.name_to_item.get(name).map(|item| {
            let price = self
                .prices
                .get(&item.id)
                .map(|p| p.clone())
                .unwrap_or_default();

            OSRSItemWithPrice {
                canonical_url: format!("/osrs/{}", item_name_to_url(&item.name)),
                item: Arc::clone(&item),
                price,
            }
        })
    }

    fn get_by_id(&self, id: u32) -> Option<OSRSItemWithPrice> {
        self.id_to_item.get(&id).map(|item| {
            let price = self.prices.get(&id).map(|p| p.clone()).unwrap_or_default();

            OSRSItemWithPrice {
                canonical_url: format!("/osrs/{}", item_name_to_url(&item.name)),
                item: Arc::clone(&item),
                price,
            }
        })
    }

    fn load_items(&mut self, items: Vec<OSRSItem>) {
        for item in items {
            let arc_item = Arc::new(item);
            let lowercase_name = arc_item.name.to_lowercase();

            self.name_to_item
                .insert(lowercase_name, Arc::clone(&arc_item));
            self.id_to_item.insert(arc_item.id, arc_item);
        }
        self.stats.item_count = self.id_to_item.len();
    }

    fn load_prices(&mut self, prices: HashMap<String, OSRSPrice>) {
        for (id_str, price) in prices {
            if let Ok(id) = id_str.parse::<u32>() {
                self.prices.insert(id, price);
            }
        }
        self.stats.prices_loaded = self.prices.len();
        self.stats.last_price_refresh = Some(std::time::Instant::now());
    }
}

/// Fetch item mapping from OSRS Wiki API
async fn fetch_item_mapping() -> Result<Vec<OSRSItem>, reqwest::Error> {
    let client = reqwest::Client::builder().user_agent(USER_AGENT).build()?;

    let items: Vec<OSRSItem> = client
        .get("https://prices.runescape.wiki/api/v1/osrs/mapping")
        .send()
        .await?
        .json()
        .await?;

    Ok(items)
}

/// Fetch latest prices from OSRS Wiki API
async fn fetch_latest_prices() -> Result<HashMap<String, OSRSPrice>, reqwest::Error> {
    let client = reqwest::Client::builder().user_agent(USER_AGENT).build()?;

    #[derive(Deserialize)]
    struct PriceResponse {
        data: HashMap<String, OSRSPrice>,
    }

    let response: PriceResponse = client
        .get("https://prices.runescape.wiki/api/v1/osrs/latest")
        .send()
        .await?
        .json()
        .await?;

    Ok(response.data)
}

/// Spawn the OSRS cache actor and return a handle
pub async fn spawn_osrs_cache_actor() -> OSRSCache {
    let (tx, rx) = mpsc::channel(CHANNEL_BUFFER);
    let cache = OSRSCache { tx: tx.clone() };

    // Spawn the main actor loop
    tokio::spawn(osrs_cache_actor_loop(rx));

    // Spawn the price refresh background task (60s)
    tokio::spawn(price_refresh_loop(tx));

    cache
}

/// The OSRS cache actor event loop
async fn osrs_cache_actor_loop(mut rx: mpsc::Receiver<OSRSCacheCommand>) {
    let mut actor = OSRSCacheActor::new();

    // Load item mapping on startup
    tracing::info!("OSRS cache actor starting - loading item mapping...");
    match fetch_item_mapping().await {
        Ok(items) => {
            let count = items.len();
            actor.load_items(items);
            tracing::info!("Loaded {} OSRS items into cache", count);
        }
        Err(e) => {
            tracing::error!("Failed to load OSRS item mapping: {}", e);
        }
    }

    // Load initial prices
    tracing::info!("Loading initial OSRS prices...");
    match fetch_latest_prices().await {
        Ok(prices) => {
            let count = prices.len();
            actor.load_prices(prices);
            tracing::info!("Loaded {} OSRS prices into cache", count);
        }
        Err(e) => {
            tracing::error!("Failed to load OSRS prices: {}", e);
        }
    }

    // Note: Volume data is now calculated client-side from the timeseries API
    // This provides more accurate cumulative volumes and reduces server load

    // Process commands
    while let Some(cmd) = rx.recv().await {
        match cmd {
            OSRSCacheCommand::GetByName { name, reply } => {
                let result = actor.get_by_name(&name);
                if result.is_some() {
                    actor.stats.hits += 1;
                } else {
                    actor.stats.misses += 1;
                }
                let _ = reply.send(result);
            }

            OSRSCacheCommand::GetById { id, reply } => {
                let result = actor.get_by_id(id);
                if result.is_some() {
                    actor.stats.hits += 1;
                } else {
                    actor.stats.misses += 1;
                }
                let _ = reply.send(result);
            }

            OSRSCacheCommand::Stats { reply } => {
                let _ = reply.send(actor.stats.clone());
            }

            OSRSCacheCommand::RefreshPrices => match fetch_latest_prices().await {
                Ok(prices) => {
                    let count = prices.len();
                    actor.load_prices(prices);
                    tracing::debug!("Refreshed {} OSRS prices", count);
                }
                Err(e) => {
                    tracing::warn!("Failed to refresh OSRS prices: {}", e);
                }
            },
        }
    }

    tracing::warn!("OSRS cache actor shutting down");
}

/// Background task to refresh prices periodically (every 60s)
async fn price_refresh_loop(tx: mpsc::Sender<OSRSCacheCommand>) {
    let mut interval = tokio::time::interval(PRICE_REFRESH_INTERVAL);

    // Skip the first tick (prices already loaded on startup)
    interval.tick().await;

    loop {
        interval.tick().await;
        if tx.send(OSRSCacheCommand::RefreshPrices).await.is_err() {
            tracing::warn!("OSRS price refresh loop: actor channel closed");
            break;
        }
    }
}

// Global cache handle
static OSRS_CACHE: std::sync::OnceLock<OSRSCache> = std::sync::OnceLock::new();

/// Initialize the global OSRS cache (call once at startup)
pub async fn init_osrs_cache() -> OSRSCache {
    // Note: We can't use get_or_init with async, so we handle it manually
    if let Some(cache) = OSRS_CACHE.get() {
        return cache.clone();
    }

    let cache = spawn_osrs_cache_actor().await;
    let _ = OSRS_CACHE.set(cache.clone());
    cache
}

/// Get the global OSRS cache handle
pub fn get_osrs_cache() -> Option<OSRSCache> {
    OSRS_CACHE.get().cloned()
}
