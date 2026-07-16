//! Game server module — headless Bevy app with lightyear ServerPlugin + avian3d.
//!
//! Runs the authoritative physics simulation and lightyear replication in a
//! dedicated thread alongside the existing Axum REST API.

pub mod token;

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::mpsc;
use std::time::Duration;

use avian3d::prelude::*;
use bevy::app::ScheduleRunnerPlugin;
use bevy::prelude::*;
use lightyear::prelude::server::*;
use lightyear::prelude::*;

use bevy_inventory::Inventory;
use bevy_items::ItemDb;
use bevy_items::inventory_adapter::{ProtoItemKind, init_item_db};
use bevy_items::skilling_type_to_skill_ref;
use bevy_kbve_net::npcdb::{self, ProtoNpcId, creature::CapturedCreatures};
use bevy_kbve_net::{
    AuthAck, AuthMessage, AuthResponse, CapturedCreatureEntry, CollectRequest, CraftFailureReason,
    CraftRequest, CraftResult, CreatureCaptureRequest, CreatureCaptured, CreatureCapturedBatch,
    CreatureKind, CreaturePositionSync, CreatureSnapshot, CreatureSyncChannel, DamageEvent,
    DeployRequest, EquipRequest, EquipmentSync, EquipmentUpdate, GameChannel, InventorySlotState,
    InventorySync, InventoryUpdate, ItemDeployed, ObjectRemoved, ObjectRespawned, PlayerName,
    PositionUpdate, ProtocolPlugin, SetUsernameRequest, SetUsernameResponse, SkillXpGrant, TileKey,
    TimeChannel, TimeSyncMessage, UnequipRequest, UseItemRequest,
};
use bevy_skills::{BevySkillsPlugin, GrantXpMsg, SkillDef, SkillId, SkillProfile, SkillRegistry};

/// Server tick rate: 20 Hz (matching client).
const TICK_DURATION: Duration = Duration::from_millis(50);

// NOTE: lightyear 0.28 dropped the per-sender send-interval config (ReplicationSender
// is now a bare marker). The former 100ms server send throttle is no longer applied
// per-sender; revisit via 0.28 global replication config once netcode is runtime-verified.

/// Default WebSocket listen address for the game server.
const DEFAULT_WS_ADDR: &str = "0.0.0.0:5000";

/// Default WebTransport (QUIC) listen address for the game server.
const DEFAULT_WT_ADDR: &str = "0.0.0.0:5001";

/// Supabase JWT secret for token validation (read from env at startup).
#[derive(Resource)]
struct JwtSecret(String);

/// Maps client entities to authenticated user IDs (Supabase `sub` UUID).
#[derive(Resource, Default)]
struct AuthenticatedClients(HashMap<Entity, String>);

/// Maps client connection entities to their spawned player entities.
#[derive(Resource, Default)]
struct ClientPlayerMap(HashMap<Entity, Entity>);

/// Compact log of captured creatures — replayed to newly connected clients
/// as a single [`CreatureCapturedBatch`] so join-time work is O(1) messages
/// instead of O(captured) per join.
#[derive(Resource, Default)]
struct CapturedCreatureLog(Vec<CapturedCreatureEntry>);

/// Belt-and-suspenders fallback for the broadcast switch (issue #8189).
///
/// The optimized path uses [`ServerMultiMessageSender`] which serializes a
/// message once and shares the bytes across all connected clients. If that
/// path misbehaves in production, set `KBVE_LEGACY_BROADCAST=1` and restart
/// the server to fall back to the original per-client `MessageSender::send`
/// loop (one clone per connected client). No rebuild required.
#[derive(Resource, Clone, Copy, Debug, Default)]
struct LegacyBroadcastFlag(bool);

impl LegacyBroadcastFlag {
    fn from_env() -> Self {
        let on = std::env::var("KBVE_LEGACY_BROADCAST")
            .map(|v| matches!(v.as_str(), "1" | "true" | "TRUE" | "yes" | "YES"))
            .unwrap_or(false);
        if on {
            tracing::warn!(
                "[gameserver] KBVE_LEGACY_BROADCAST=1 — using per-client clone fan-out (slower, see #8189)"
            );
        }
        Self(on)
    }

    #[inline]
    fn is_legacy(self) -> bool {
        self.0
    }
}

/// Whether verbose netcode diagnostics (per-tick link/packet tracing observers
/// and systems) are registered. Off by default — these iterate every Link every
/// tick and are only useful when debugging transport/handshake issues.
/// Enable with `GAME_NET_DEBUG=1`.
fn gameserver_debug_enabled() -> bool {
    std::env::var("GAME_NET_DEBUG")
        .map(|v| matches!(v.as_str(), "1" | "true" | "TRUE" | "yes" | "YES"))
        .unwrap_or(false)
}

/// Marker: client has not yet sent a valid AuthMessage.
#[derive(Component)]
struct PendingAuth;

/// Marker: client authenticated but hasn't completed the 4-step handshake.
/// Stores the server_time challenge that the client must echo back in AuthAck.
#[derive(Component)]
struct PendingAck {
    server_time: u64,
}

/// Marker: client just completed authentication and needs world state sync
/// (collected objects, captured creatures, etc.). Removed after sync is sent.
#[derive(Component)]
struct NeedsWorldSync;

/// How long (in seconds) before a collected object respawns.
const RESPAWN_COOLDOWN_SECS: f64 = 300.0; // 5 minutes

/// Maximum distance (world units) a player can be from an object to collect it.
const MAX_COLLECT_DISTANCE: f32 = 3.0;

/// Tracks collected world objects with the time they were collected.
/// When enough time passes, the object respawns (entry removed).
#[derive(Resource, Default)]
struct CollectedObjects(HashMap<TileKey, f64>);

/// Slot capacity for every player inventory. Matches the client's bag UI grid.
const PLAYER_INVENTORY_SLOTS: usize = 16;

/// Server-authoritative per-player inventories. Keyed by the player Entity
/// (not the client connection entity) so survives reconnect under the same
/// session if reconnect logic is added later.
#[derive(Resource, Default)]
struct PlayerInventories(HashMap<Entity, Inventory<ProtoItemKind>>);

impl PlayerInventories {
    fn get_or_init(&mut self, player_entity: Entity) -> &mut Inventory<ProtoItemKind> {
        self.0
            .entry(player_entity)
            .or_insert_with(|| Inventory::new(PLAYER_INVENTORY_SLOTS))
    }
}

/// Server-authoritative equipment per player. Stored as proto EquipSlot
/// values (i32) so the wire protocol can round-trip without a custom enum.
#[derive(Resource, Default)]
struct PlayerEquipment(HashMap<Entity, HashMap<i32, ProtoItemKind>>);

/// Tracks per-(player, item-id) cooldown timestamps for consumables. Value
/// is the absolute server-time after which the player may use the item
/// again.
#[derive(Resource, Default)]
struct ConsumableCooldowns(HashMap<(Entity, bevy_items::ProtoItemId), f64>);

/// Tracks every active deployable in the world so reconnects can replay
/// placements and the same tile cannot be over-built.
#[derive(Resource, Default)]
struct DeployedItems(HashMap<TileKey, DeployedEntry>);

#[derive(Clone)]
struct DeployedEntry {
    owner_id: u64,
    item_ref: String,
}

/// Baked itemdb JSON — same payload the isometric client embeds. Generated by
/// `node apps/kbve/isometric/scripts/sync-itemdb.mjs` (writes both targets).
const BAKED_ITEMDB_JSON: &str = include_str!("../data/itemdb.json");

fn load_server_itemdb() {
    match ItemDb::from_json(BAKED_ITEMDB_JSON) {
        Ok(db) => {
            let count = db.len();
            let db_static: &'static ItemDb = Box::leak(Box::new(db));
            init_item_db(db_static);
            tracing::info!("[itemdb] server loaded {count} items from baked itemdb.json");
        }
        Err(e) => tracing::warn!(
            "[itemdb] server failed to parse baked itemdb.json: {e:?} — \
             ProtoItemKind::max_stack() will fall back to 1"
        ),
    }
}

/// Build an [`InventorySlotState`] payload for a populated slot.
fn slot_to_state(
    slot_index: u32,
    stack: &bevy_inventory::ItemStack<ProtoItemKind>,
) -> InventorySlotState {
    InventorySlotState {
        slot_index,
        item_ref: stack
            .kind
            .item()
            .map(|i| i.r#ref.clone())
            .unwrap_or_default(),
        quantity: stack.quantity,
    }
}

/// Register the same gathering skills the client knows about so the server
/// can grant XP and gate access by level. Keep the slugs aligned with
/// `apps/kbve/isometric/.../skills.rs::register_skills` — drift will desync
/// the XP curves between server and client.
fn register_server_skills(mut registry: ResMut<SkillRegistry>) {
    registry.register(SkillDef {
        r#ref: "woodcutting".into(),
        name: "Woodcutting".into(),
        category: "gathering".into(),
        icon: None,
        xp_curve: None,
    });
    registry.register(SkillDef {
        r#ref: "mining".into(),
        name: "Mining".into(),
        category: "gathering".into(),
        icon: None,
        xp_curve: None,
    });
    registry.register(SkillDef {
        r#ref: "foraging".into(),
        name: "Foraging".into(),
        category: "gathering".into(),
        icon: None,
        xp_curve: None,
    });
    tracing::info!("[skills] server registered {} skills", registry.len());
}

// ---------------------------------------------------------------------------
// Day/night cycle & creature sync
// ---------------------------------------------------------------------------

/// Server-authoritative game clock. 1 real minute = 1 game hour (60× speed).
#[derive(Resource)]
struct DayCycle {
    hour: f32,
    speed: f32,
}

impl Default for DayCycle {
    fn default() -> Self {
        Self {
            hour: 10.0,
            speed: 1.0 / 60.0,
        }
    }
}

/// Global seed for deterministic creature spawning — all clients share this.
#[derive(Resource)]
struct CreatureSeed(u64);

impl Default for CreatureSeed {
    fn default() -> Self {
        Self(0x4BBEF02026)
    }
}

/// Server wind state (simple static default for now).
#[derive(Resource)]
struct WindState {
    speed_mph: f32,
    direction: (f32, f32),
}

impl Default for WindState {
    fn default() -> Self {
        Self {
            speed_mph: 5.0,
            direction: (0.7, 0.7),
        }
    }
}

/// Map a protocol `CreatureKind` to its NPC ref string.
#[allow(dead_code)]
fn creature_kind_to_npc_ref(kind: CreatureKind) -> &'static str {
    match kind {
        CreatureKind::Firefly => "meadow-firefly",
        CreatureKind::Butterfly => "woodland-butterfly",
        CreatureKind::Frog => "green-toad",
    }
}

/// Map a protocol `CreatureKind` to a `ProtoNpcId`.
#[allow(dead_code)]
fn creature_kind_to_npc_id(kind: CreatureKind) -> ProtoNpcId {
    ProtoNpcId::from_ref(creature_kind_to_npc_ref(kind))
}

/// Map a `ProtoNpcId` back to a protocol `CreatureKind` (for wire messages).
#[allow(dead_code)]
fn npc_id_to_creature_kind(npc_id: ProtoNpcId) -> Option<CreatureKind> {
    if npc_id == ProtoNpcId::from_ref("meadow-firefly") {
        Some(CreatureKind::Firefly)
    } else if npc_id == ProtoNpcId::from_ref("woodland-butterfly") {
        Some(CreatureKind::Butterfly)
    } else if npc_id == ProtoNpcId::from_ref("green-toad") {
        Some(CreatureKind::Frog)
    } else {
        None
    }
}

/// Timer for periodic time sync broadcasts.
#[derive(Resource)]
struct TimeSyncTimer(Timer);

impl Default for TimeSyncTimer {
    fn default() -> Self {
        Self(Timer::from_seconds(5.0, TimerMode::Repeating))
    }
}

/// Timer for periodic creature position sync broadcasts (every 2 seconds).
#[derive(Resource)]
struct CreatureSyncTimer(Timer);

impl Default for CreatureSyncTimer {
    fn default() -> Self {
        Self(Timer::from_seconds(2.0, TimerMode::Repeating))
    }
}

// ---------------------------------------------------------------------------
// Profile bridge: Bevy ↔ tokio async communication
// ---------------------------------------------------------------------------

/// Requests sent from Bevy systems to the async bridge task.
enum ProfileRequest {
    LookupUsername {
        player_entity: Entity,
        user_id: String,
    },
    SetUsername {
        client_entity: Entity,
        player_entity: Entity,
        user_id: String,
        username: String,
    },
    /// Short-circuit path used when the JWT already carries `kbve_username`.
    /// Bypasses the profile DB lookup and lets the bridge echo a
    /// `ProfileResponse::Username` straight back to Bevy.
    SetUsernameLocal {
        player_entity: Entity,
        username: String,
    },
}

/// Responses sent from the async bridge task back to Bevy systems.
enum ProfileResponse {
    Username {
        player_entity: Entity,
        username: String,
    },
    SetUsernameResult {
        client_entity: Entity,
        player_entity: Entity,
        success: bool,
        username: String,
        error: String,
    },
}

/// Sender side of the profile bridge (Bevy → tokio).
#[derive(Resource)]
struct ProfileBridgeTx(mpsc::Sender<ProfileRequest>);

/// Receiver side of the profile bridge (tokio → Bevy).
/// Wrapped in a Mutex because `mpsc::Receiver` is not `Sync`.
#[derive(Resource)]
struct ProfileBridgeRx(std::sync::Mutex<mpsc::Receiver<ProfileResponse>>);

/// Initialize and spawn the headless Bevy game server in a background thread.
///
/// Lightyear's WebSocket server binds its own port (default 5000), separate
/// from the Axum HTTP server. The Bevy app runs its own event loop.
pub fn init_gameserver() {
    let ws_addr: SocketAddr = std::env::var("GAME_WS_ADDR")
        .unwrap_or_else(|_| DEFAULT_WS_ADDR.to_string())
        .parse()
        .expect("invalid GAME_WS_ADDR");

    let wt_addr: SocketAddr = std::env::var("GAME_WT_ADDR")
        .unwrap_or_else(|_| DEFAULT_WT_ADDR.to_string())
        .parse()
        .expect("invalid GAME_WT_ADDR");

    let jwt_secret = std::env::var("SUPABASE_JWT_SECRET").unwrap_or_default();

    // Load WebTransport TLS certificate (optional — WT disabled if not present)
    let wt_identity = load_webtransport_identity();

    // Verify cert digest was set (critical for token endpoint to return WT URL)
    let digest = get_cert_digest();
    if digest.is_empty() {
        tracing::warn!(
            "[gameserver] CERT_DIGEST is EMPTY — token endpoint will NOT return WebTransport URL, clients will fall back to WebSocket"
        );
    } else {
        tracing::info!(
            "[gameserver] CERT_DIGEST set: {}...{} ({}chars) — WT enabled in token endpoint",
            &digest[..8],
            &digest[digest.len() - 8..],
            digest.len()
        );
    }

    // Profile bridge channels (Bevy ↔ tokio)
    let (req_tx, req_rx) = mpsc::channel::<ProfileRequest>();
    let (resp_tx, resp_rx) = mpsc::channel::<ProfileResponse>();

    // Spawn the async bridge task on the current tokio runtime
    let tokio_handle = tokio::runtime::Handle::current();
    tokio_handle.spawn(async move {
        profile_bridge_task(req_rx, resp_tx).await;
    });

    // Belt: verify UDP port is bindable before handing off to Bevy/lightyear.
    // A silent bind failure inside wtransport is the #1 cause of
    // ERR_QUIC_PROTOCOL_ERROR / QUIC_NETWORK_IDLE_TIMEOUT on the client.
    if wt_identity.is_some() {
        match std::net::UdpSocket::bind(wt_addr) {
            Ok(sock) => {
                drop(sock); // release immediately so lightyear can bind
                tracing::info!(
                    "[gameserver] UDP pre-check OK — port {} is available for WebTransport",
                    wt_addr.port()
                );
            }
            Err(e) => {
                tracing::error!(
                    "[gameserver] UDP pre-check FAILED on {wt_addr}: {e} — \
                     WebTransport will NOT work! Clients will see QUIC_NETWORK_IDLE_TIMEOUT. \
                     Check firewall / another process on port {}.",
                    wt_addr.port()
                );
            }
        }
    }

    let ws_plain = std::env::var("GAME_WS_PLAIN")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);

    std::thread::spawn(move || {
        tracing::info!(
            target: "gameserver.startup",
            ws_addr = %ws_addr,
            ws_plain = ws_plain,
            wt_enabled = wt_identity.is_some(),
            wt_addr = %wt_addr,
            "game server starting — WS on {ws_addr} (plain={ws_plain}), WT: {}",
            if wt_identity.is_some() {
                format!(
                    "on {wt_addr} (keep_alive={}s, idle_timeout={}s)",
                    std::env::var("GAME_WT_KEEP_ALIVE_SECS").unwrap_or_else(|_| "4".into()),
                    std::env::var("GAME_WT_IDLE_TIMEOUT_SECS").unwrap_or_else(|_| "30".into()),
                )
            } else {
                "disabled".to_string()
            }
        );
        run_bevy_app(ws_addr, wt_addr, jwt_secret, wt_identity, req_tx, resp_rx);
    });
}

/// Create a WebTransport TLS identity.
///
/// Priority:
/// 1. `GAME_WT_DISABLE=1` → None (WebTransport disabled)
/// 2. `GAME_WT_CERT` + `GAME_WT_KEY` → load PEM files (production, Let's Encrypt)
/// 3. Fallback → self-signed cert (local dev, 14-day validity)
///
/// For production certs (Let's Encrypt), the browser trusts the CA natively so
/// `cert_digest` is left empty — no pinning needed.
/// For self-signed certs, the SHA-256 digest is stored globally so the token
/// endpoint can serve it to WASM clients.
fn load_webtransport_identity() -> Option<lightyear::webtransport::prelude::Identity> {
    use lightyear::webtransport::prelude::Identity;

    if std::env::var("GAME_WT_DISABLE").unwrap_or_default() == "1" {
        tracing::info!("GAME_WT_DISABLE=1 — WebTransport disabled");
        return None;
    }

    // --- Production path: load cert from PEM files ---
    let cert_path = std::env::var("GAME_WT_CERT").ok();
    let key_path = std::env::var("GAME_WT_KEY").ok();

    if let (Some(cert_path), Some(key_path)) = (cert_path, key_path) {
        if std::path::Path::new(&cert_path).exists() && std::path::Path::new(&key_path).exists() {
            tracing::info!("loading WebTransport cert from {cert_path}");
            let identity = tokio::task::block_in_place(|| {
                tokio::runtime::Handle::current()
                    .block_on(Identity::load_pemfiles(&cert_path, &key_path))
            });
            match identity {
                Ok(id) => {
                    WT_ENABLED.store(true, std::sync::atomic::Ordering::Relaxed);
                    // PEM cert from file = CA-signed (Let's Encrypt) = trusted by browsers.
                    // Clients must NOT use serverCertificateHashes for trusted certs.
                    WT_CERT_TRUSTED.store(true, std::sync::atomic::Ordering::Relaxed);

                    // Compute cert digest for diagnostics and self-signed fallback.
                    // For trusted certs the client should ignore this digest.
                    let cert_chain = id.certificate_chain();
                    let certs = cert_chain.as_slice();
                    if let Some(cert) = certs.first() {
                        let digest = cert.hash();
                        let raw_bytes: &[u8] = digest.as_ref();
                        let digest_hex: String =
                            raw_bytes.iter().map(|b| format!("{b:02X}")).collect();
                        tracing::info!(
                            "WebTransport PEM cert digest: {digest_hex} ({}chars)",
                            digest_hex.len()
                        );
                        let _ = CERT_DIGEST.set(digest_hex);
                    } else {
                        tracing::warn!("WebTransport PEM cert chain empty — no digest available");
                    }

                    tracing::info!(
                        "WebTransport using PEM TLS cert (digest={})",
                        get_cert_digest()
                    );
                    return Some(id);
                }
                Err(e) => {
                    tracing::error!(
                        "failed to load WebTransport cert: {e} — falling back to self-signed"
                    );
                }
            }
        } else {
            tracing::warn!(
                "GAME_WT_CERT/KEY set but files not found — falling back to self-signed"
            );
        }
    }

    // --- Fallback path: pre-generated self-signed cert from CronJob ---
    // In production, a CronJob rotates a self-signed cert every 12 days
    // (WebTransport spec limit for hash-pinned certs) and stores it in
    // the kbve-wt-selfsigned Secret mounted at GAME_WT_SELFSIGNED_CERT/KEY.
    let ss_cert_path = std::env::var("GAME_WT_SELFSIGNED_CERT").ok();
    let ss_key_path = std::env::var("GAME_WT_SELFSIGNED_KEY").ok();
    if let (Some(sc), Some(sk)) = (ss_cert_path, ss_key_path) {
        if std::path::Path::new(&sc).exists() && std::path::Path::new(&sk).exists() {
            tracing::info!("[wt-cert] loading pre-generated self-signed cert from {sc}");
            let identity = tokio::task::block_in_place(|| {
                tokio::runtime::Handle::current().block_on(Identity::load_pemfiles(&sc, &sk))
            });
            match identity {
                Ok(id) => {
                    WT_ENABLED.store(true, std::sync::atomic::Ordering::Relaxed);
                    // Self-signed = NOT trusted, must use hash pinning
                    let cert_chain = id.certificate_chain();
                    if let Some(cert) = cert_chain.as_slice().first() {
                        let digest = cert.hash();
                        let raw_bytes: &[u8] = digest.as_ref();
                        let digest_hex: String =
                            raw_bytes.iter().map(|b| format!("{b:02X}")).collect();
                        tracing::info!(
                            "[wt-cert] pre-generated self-signed cert digest: {digest_hex}"
                        );
                        let _ = CERT_DIGEST.set(digest_hex);
                    }
                    tracing::info!("[wt-cert] using pre-generated self-signed cert (hash-pinned)");
                    return Some(id);
                }
                Err(e) => {
                    tracing::warn!(
                        "[wt-cert] failed to load pre-generated self-signed cert: {e} — generating at runtime"
                    );
                }
            }
        }
    }

    // --- Last resort: generate self-signed cert at runtime ---
    // Include production hostname + public IP in SANs so the cert works
    // both locally and in production.
    let mut sans = vec![
        "localhost".to_string(),
        "127.0.0.1".to_string(),
        "::1".to_string(),
    ];
    if let Ok(host) = std::env::var("GAME_SERVER_HOST") {
        if !host.is_empty() && host != "localhost" {
            tracing::info!("[wt-cert] adding GAME_SERVER_HOST '{host}' to self-signed SANs");
            sans.push(host.clone());
            // Also resolve and add the IP so both hostname and IP connections work
            if let Ok(addrs) = std::net::ToSocketAddrs::to_socket_addrs(&(host.as_str(), 0)) {
                for addr in addrs {
                    let ip = addr.ip().to_string();
                    if !sans.contains(&ip) {
                        tracing::info!("[wt-cert] adding resolved IP '{ip}' to self-signed SANs");
                        sans.push(ip);
                    }
                }
            }
        }
    }
    let san_refs: Vec<&str> = sans.iter().map(|s| s.as_str()).collect();
    tracing::info!("[wt-cert] generating self-signed cert with SANs: {san_refs:?}");
    let identity = Identity::self_signed(&san_refs).expect("self-signed cert");
    WT_ENABLED.store(true, std::sync::atomic::Ordering::Relaxed);
    tracing::info!("[wt-cert] self-signed identity created OK");

    // Store digest so WASM clients can pin the self-signed cert
    let cert_chain = identity.certificate_chain();
    let certs = cert_chain.as_slice();
    tracing::info!("[wt-cert] certificate chain length: {}", certs.len());
    if let Some(cert) = certs.first() {
        let digest = cert.hash();
        let raw_bytes: &[u8] = digest.as_ref();
        tracing::info!("[wt-cert] hash returned {} bytes", raw_bytes.len());
        let digest_hex: String = raw_bytes.iter().map(|b| format!("{b:02X}")).collect();
        tracing::info!(
            "[wt-cert] self-signed cert digest: {digest_hex} (len={})",
            digest_hex.len()
        );
        let set_result = CERT_DIGEST.set(digest_hex);
        if set_result.is_err() {
            tracing::error!("[wt-cert] CERT_DIGEST.set() FAILED — OnceLock already set!");
        } else {
            tracing::info!(
                "[wt-cert] CERT_DIGEST stored OK — get_cert_digest() = '{}'",
                get_cert_digest()
            );
        }
    } else {
        tracing::error!("[wt-cert] certificate chain is EMPTY — cannot extract digest!");
    }

    Some(identity)
}

/// Async bridge task: receives profile requests from Bevy, calls DB, sends responses back.
async fn profile_bridge_task(
    rx: mpsc::Receiver<ProfileRequest>,
    tx: mpsc::Sender<ProfileResponse>,
) {
    loop {
        let req = match rx.try_recv() {
            Ok(req) => req,
            Err(mpsc::TryRecvError::Empty) => {
                tokio::time::sleep(Duration::from_millis(50)).await;
                continue;
            }
            Err(mpsc::TryRecvError::Disconnected) => break,
        };

        let profile_service = crate::db::get_profile_service();

        match req {
            ProfileRequest::LookupUsername {
                player_entity,
                user_id,
            } => {
                let username = if let Some(cached) = lookup_username_cached(&user_id) {
                    cached
                } else if let Some(svc) = profile_service {
                    match svc.get_profile_by_user_id(&user_id).await {
                        Ok(Some(profile)) => {
                            if profile.username.is_empty() {
                                String::new()
                            } else {
                                profile.username
                            }
                        }
                        Ok(None) => String::new(),
                        Err(e) => {
                            tracing::warn!(
                                "[profile_bridge] failed to lookup username for {user_id}: {e}"
                            );
                            String::new()
                        }
                    }
                } else {
                    String::new()
                };

                store_username_cache(&user_id, &username);

                let _ = tx.send(ProfileResponse::Username {
                    player_entity,
                    username,
                });
            }
            ProfileRequest::SetUsername {
                client_entity,
                player_entity,
                user_id,
                username,
            } => {
                let (success, canonical, error) = if let Some(svc) = profile_service {
                    match svc.set_username(&user_id, &username).await {
                        Ok(canonical) => (true, canonical, String::new()),
                        Err(e) => (false, String::new(), e),
                    }
                } else {
                    (
                        false,
                        String::new(),
                        "Profile service not available".to_string(),
                    )
                };

                if success {
                    store_username_cache(&user_id, &canonical);
                }

                let _ = tx.send(ProfileResponse::SetUsernameResult {
                    client_entity,
                    player_entity,
                    success,
                    username: canonical,
                    error,
                });
            }
            ProfileRequest::SetUsernameLocal {
                player_entity,
                username,
            } => {
                let _ = tx.send(ProfileResponse::Username {
                    player_entity,
                    username,
                });
            }
        }
    }
    tracing::info!("[profile_bridge] bridge task exiting");
}

/// Short-TTL in-memory cache for username lookups. Auth handshake spamming
/// the DB on every reconnect is wasteful when the same JWT validates many
/// times within seconds; 60s is short enough that `set_username` updates
/// surface quickly while still cutting hot-path DB load.
const USERNAME_CACHE_TTL_SECS: u64 = 60;

static USERNAME_CACHE: std::sync::LazyLock<
    std::sync::Mutex<std::collections::HashMap<String, (String, std::time::Instant)>>,
> = std::sync::LazyLock::new(|| std::sync::Mutex::new(std::collections::HashMap::new()));

fn lookup_username_cached(user_id: &str) -> Option<String> {
    let now = std::time::Instant::now();
    let mut guard = USERNAME_CACHE.lock().ok()?;
    if let Some((value, inserted)) = guard.get(user_id).cloned() {
        if now.duration_since(inserted).as_secs() < USERNAME_CACHE_TTL_SECS {
            return Some(value);
        }
        guard.remove(user_id);
    }
    None
}

const USERNAME_CACHE_SWEEP_AT: usize = 4096;

fn store_username_cache(user_id: &str, username: &str) {
    if user_id.is_empty() {
        return;
    }
    if let Ok(mut guard) = USERNAME_CACHE.lock() {
        let now = std::time::Instant::now();
        // Entries are otherwise only evicted when the same user_id is looked up
        // again after TTL, so ids never queried again leak. Sweep expired
        // entries once the map crosses a threshold to bound growth.
        if guard.len() >= USERNAME_CACHE_SWEEP_AT {
            guard.retain(|_, (_, inserted)| {
                now.duration_since(*inserted).as_secs() < USERNAME_CACHE_TTL_SECS
            });
        }
        guard.insert(user_id.to_string(), (username.to_string(), now));
    }
}

fn run_bevy_app(
    ws_addr: SocketAddr,
    wt_addr: SocketAddr,
    jwt_secret: String,
    wt_identity: Option<lightyear::webtransport::prelude::Identity>,
    profile_tx: mpsc::Sender<ProfileRequest>,
    profile_rx: mpsc::Receiver<ProfileResponse>,
) {
    let mut app = App::new();

    // Minimal headless Bevy — no window, no renderer
    app.add_plugins(MinimalPlugins.set(ScheduleRunnerPlugin::run_loop(
        Duration::from_secs_f64(1.0 / 60.0),
    )));
    app.add_plugins(bevy::state::app::StatesPlugin);
    app.add_plugins(bevy::transform::TransformPlugin);

    // avian3d physics (headless — disable transform sync plugins,
    // lightyear_avian handles that)
    app.add_plugins(
        PhysicsPlugins::default()
            .build()
            .disable::<PhysicsTransformPlugin>()
            .disable::<PhysicsInterpolationPlugin>(),
    );

    // lightyear server networking
    app.add_plugins(ServerPlugins {
        tick_duration: TICK_DURATION,
    });

    // Shared protocol (components, inputs, channels)
    app.add_plugins(ProtocolPlugin);

    // lightyear–avian3d bridge
    app.add_plugins(lightyear_avian3d::prelude::LightyearAvianPlugin::default());

    // Netcode keys
    let private_key = bevy_kbve_net::net_config::load_private_key();
    app.insert_resource(NetcodeKeys { private_key });

    // Auth resources
    app.insert_resource(JwtSecret(jwt_secret));
    app.init_resource::<AuthenticatedClients>();
    app.init_resource::<ClientPlayerMap>();
    app.init_resource::<SetUsernameLastAttempt>();
    app.init_resource::<CollectedObjects>();
    app.init_resource::<PlayerInventories>();
    app.init_resource::<PlayerEquipment>();
    app.init_resource::<ConsumableCooldowns>();
    app.init_resource::<DeployedItems>();
    load_server_itemdb();
    app.add_plugins(BevySkillsPlugin);
    app.add_systems(Startup, register_server_skills);
    app.init_resource::<DayCycle>();
    app.init_resource::<CreatureSeed>();
    app.init_resource::<WindState>();
    app.init_resource::<CapturedCreatures>();
    app.init_resource::<CapturedCreatureLog>();
    app.insert_resource(LegacyBroadcastFlag::from_env());
    app.insert_resource(npcdb::build_creature_registry());
    app.init_resource::<TimeSyncTimer>();
    app.init_resource::<CreatureSyncTimer>();

    // --- Server-authoritative creature simulation ---
    app.insert_resource(bevy_kbve_net::creatures::definitions::build_sprite_creature_types());
    app.init_resource::<bevy_kbve_net::creatures::types::SpriteAtlasPool>();
    app.init_resource::<bevy_kbve_net::creatures::simulate::SimulationCenter>();
    app.init_resource::<bevy_kbve_net::creatures::common::GameTime>();
    app.init_resource::<bevy_kbve_net::terrain::TerrainMap>();
    app.init_resource::<bevy_kbve_net::creatures::physics_lod::PhysicsLodTimer>();
    app.init_resource::<bevy_kbve_net::creatures::types::PlayerPositions>();

    // --- Ambient creature simulation (fireflies, butterflies) ---
    app.init_resource::<bevy_kbve_net::creatures::ambient_types::AmbientCreaturePool>();
    app.init_resource::<bevy_kbve_net::creatures::ambient_types::FireflySlotState>();

    // Profile bridge resources
    app.insert_resource(ProfileBridgeTx(profile_tx));
    app.insert_resource(ProfileBridgeRx(std::sync::Mutex::new(profile_rx)));

    // Store WebTransport identity as a resource so the startup system can take it
    app.insert_resource(PendingWtIdentity(wt_identity));
    app.insert_resource(WtAddr(wt_addr));

    // Spawn separate server entities per transport (matching lightyear examples).
    // lightyear's netcode server_plugin uses Query (not Single) to iterate
    // over all NetcodeServer entities, so multiple server entities work correctly.
    // Each client connects to one transport and lands in that server's collection.
    let startup_ws_addr = ws_addr;
    let startup_key = private_key;
    app.add_systems(
        Startup,
        move |mut commands: Commands,
              mut wt_id: ResMut<PendingWtIdentity>,
              wt_addr: Res<WtAddr>| {
            start_server(
                &mut commands,
                startup_ws_addr,
                wt_addr.0,
                startup_key,
                wt_id.0.take(),
            );
        },
    );

    // Handle new client connections (mark as pending auth)
    app.add_observer(handle_new_link);
    app.add_observer(handle_new_connection);

    // Per-connection cleanup — MUST run in production. Despawns the player
    // entity and evicts auth/inventory/equipment/cooldown state on disconnect;
    // the only place those maps shrink. Not a diagnostic — never gate this.
    app.add_observer(on_server_disconnected);

    // Verbose netcode diagnostics — gated behind GAME_NET_DEBUG. These observers
    // and per-tick systems trace the transport/handshake path (connection
    // lifecycle, link/packet flow, orphaned links) and iterate every Link every
    // tick, so they stay off in production.
    if gameserver_debug_enabled() {
        // Connection lifecycle (logging only)
        app.add_observer(on_server_connecting);
        app.add_observer(on_server_connected);

        // Link/transport lifecycle — WebSocket accept → per-client Link → Linked
        app.add_observer(debug_on_linking_added);
        app.add_observer(debug_on_linked_added);
        app.add_observer(debug_on_unlinked_added);

        // LinkOf / ReplicationSender creation
        app.add_observer(|trigger: On<Add, LinkOf>| {
            let entity = trigger.entity;
            tracing::info!("[diag] LinkOf ADDED on entity {entity:?}");
        });
        app.add_observer(|trigger: On<Add, ReplicationSender>| {
            let entity = trigger.entity;
            tracing::info!("[diag] ReplicationSender ADDED on entity {entity:?}");
        });

        // Per-tick link/packet tracing
        app.add_systems(
            Update,
            (
                debug_link_packet_flow,
                debug_all_links,
                server_debug_heartbeat,
                server_debug_link_buffers,
                server_debug_netcode_collection,
            ),
        );
    }

    // Auth handshake + per-client request handlers. These systems are order
    // independent (each reads its own message channel / marker query), so they
    // run in one unordered batch. `disconnect_stalled_auth` reaps half-open
    // PendingAuth/PendingAck connections past `AUTH_HANDSHAKE_TIMEOUT_SECS`.
    app.add_systems(
        Update,
        (
            process_auth_messages,
            verify_auth_ack,
            disconnect_stalled_auth,
            process_position_updates,
            process_damage_events,
            process_collect_requests,
            process_equip_requests,
            process_unequip_requests,
            process_craft_requests,
            process_use_item_requests,
            process_deploy_requests,
        ),
    );

    // World state broadcast + late-join sync + creature capture. Also order
    // independent — each fans state out to newly connected/authenticated clients.
    app.add_systems(
        Update,
        (
            tick_respawns,
            send_collected_state_to_new_clients,
            process_profile_responses,
            process_set_username_requests,
            update_server_day_cycle,
            broadcast_time_sync,
            send_time_sync_to_new_clients,
            process_creature_captures,
            send_captured_state_to_new_clients,
            sync_creature_game_time,
            update_server_player_positions,
        ),
    );
    app.add_systems(
        Update,
        (
            bevy_kbve_net::creatures::spawn::spawn_creatures_headless,
            bevy_kbve_net::creatures::simulate::simulate_sprite_creatures
                .after(bevy_kbve_net::creatures::spawn::spawn_creatures_headless),
            bevy_kbve_net::creatures::brain::dispatch_behavior_trees
                .after(bevy_kbve_net::creatures::simulate::simulate_sprite_creatures),
            bevy_kbve_net::creatures::brain::poll_behavior_results
                .after(bevy_kbve_net::creatures::brain::dispatch_behavior_trees),
            bevy_kbve_net::creatures::physics_lod::update_physics_lod,
        ),
    );

    // --- Ambient creature simulation (fireflies, butterflies) ---
    app.add_systems(
        Update,
        (
            bevy_kbve_net::creatures::spawn_ambient::spawn_fireflies_headless,
            bevy_kbve_net::creatures::spawn_ambient::spawn_butterflies_headless,
            bevy_kbve_net::creatures::simulate_firefly::assign_firefly_slots
                .after(bevy_kbve_net::creatures::spawn_ambient::spawn_fireflies_headless),
            bevy_kbve_net::creatures::simulate_firefly::simulate_fireflies
                .after(bevy_kbve_net::creatures::simulate_firefly::assign_firefly_slots),
            bevy_kbve_net::creatures::simulate_butterfly::simulate_butterflies
                .after(bevy_kbve_net::creatures::spawn_ambient::spawn_butterflies_headless),
        ),
    );

    // Broadcast creature positions to clients periodically
    app.add_systems(Update, broadcast_creature_sync);

    // Timeout clients that never authenticate
    app.add_systems(Update, timeout_pending_auth);

    tracing::info!("game server Bevy app running");
    app.run();
}

/// Pending WebTransport identity — taken once during Startup.
#[derive(Resource)]
struct PendingWtIdentity(Option<lightyear::webtransport::prelude::Identity>);

/// WebTransport listen address.
#[derive(Resource)]
struct WtAddr(SocketAddr);

/// The WS server entity — used by `spawn_player` for `ReplicationMode::Server`
/// so lightyear doesn't need `.single()` (which fails with multiple servers).
#[derive(Resource)]
struct WsServerEntity(Entity);

/// Shared netcode keys for the game server.
#[derive(Resource)]
struct NetcodeKeys {
    #[allow(dead_code)]
    private_key: [u8; 32],
}

/// WebTransport certificate digest (SHA-256 hex, 64 chars).
/// Stored in an Arc so the token endpoint (async Axum) can read it.
#[derive(Clone)]
pub struct CertDigest(pub std::sync::Arc<String>);

/// Global accessor for the cert digest (set once at startup).
static CERT_DIGEST: std::sync::OnceLock<String> = std::sync::OnceLock::new();

/// Whether WebTransport is enabled (set once at startup).
static WT_ENABLED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// Whether the loaded cert is CA-signed (trusted) vs self-signed.
/// Trusted certs (Let's Encrypt) must NOT use serverCertificateHashes — the browser
/// validates them via the CA chain. Self-signed certs MUST use hash pinning.
static WT_CERT_TRUSTED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// Read the cert digest from the global store (for the token endpoint).
pub fn get_cert_digest() -> &'static str {
    CERT_DIGEST.get().map(|s| s.as_str()).unwrap_or("")
}

/// Check whether WebTransport is enabled.
pub fn is_wt_enabled() -> bool {
    WT_ENABLED.load(std::sync::atomic::Ordering::Relaxed)
}

/// Check whether the WT cert is CA-signed (trusted by browsers natively).
/// When true, clients must NOT use serverCertificateHashes and should
/// connect via hostname so the browser validates the cert against the CA chain.
/// When false, clients MUST use the cert_digest for hash pinning.
pub fn is_wt_cert_trusted() -> bool {
    WT_CERT_TRUSTED.load(std::sync::atomic::Ordering::Relaxed)
}

/// Spawn a single server entity with WebSocket + optional WebTransport.
///
/// lightyear's `Replicate::to_clients(NetworkTarget::All)` calls `single()` on the
/// `Server` query — there MUST be exactly one `Server` entity.
///
/// WS binds from its `ServerConfig` (address baked into the config builder), so it
/// ignores `LocalAddr`. WT binds from `LocalAddr`. Setting `LocalAddr` to the WT
/// address lets both transports coexist on one entity with correct binding.
fn start_server(
    commands: &mut Commands,
    ws_addr: SocketAddr,
    wt_addr: SocketAddr,
    private_key: [u8; 32],
    wt_identity: Option<lightyear::webtransport::prelude::Identity>,
) {
    use lightyear::websocket::prelude::server::*;

    let has_wt = wt_identity.is_some();

    tracing::info!(
        "[gameserver] starting server — WS on {ws_addr}, WT: {}",
        if has_wt {
            format!("on {wt_addr}")
        } else {
            "disabled".to_string()
        }
    );

    // lightyear requires ONE server entity per transport (see lightyear examples).
    // Putting both WebSocketServerIo and WebTransportServerIo on the same entity
    // breaks the entity hierarchy — aeronet child entities can't resolve their
    // parent's AeronetLinkOf correctly, causing "packets not consumed" on proxied
    // connections.
    //
    // Solution: spawn separate server entities for WS and WT, each with its own
    // NetcodeServer. Both share the same protocol_id and private_key so clients
    // can connect to either.

    let netcode_config = || lightyear::netcode::prelude::server::NetcodeConfig {
        protocol_id: bevy_kbve_net::net_config::KBVE_PROTOCOL_ID,
        private_key,
        client_timeout_secs: 15,
        ..Default::default()
    };

    // --- WebSocket server entity ---
    let ws_plain = std::env::var("GAME_WS_PLAIN")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);

    let ws_config = if ws_plain {
        tracing::info!(
            "[gameserver] GAME_WS_PLAIN=1 — WebSocket listening WITHOUT TLS on {ws_addr}"
        );
        ServerConfig::builder()
            .with_bind_address(ws_addr)
            .with_no_encryption()
    } else {
        let ws_identity = load_ws_identity();
        tracing::info!("[gameserver] WebSocket listening WITH TLS on {ws_addr}");
        ServerConfig::builder()
            .with_bind_address(ws_addr)
            .with_identity(ws_identity)
    };

    let ws_entity = commands
        .spawn((
            NetcodeServer::new(netcode_config()),
            LocalAddr(ws_addr),
            WebSocketServerIo { config: ws_config },
        ))
        .id();

    commands.trigger(Start { entity: ws_entity });
    commands.insert_resource(WsServerEntity(ws_entity));
    tracing::info!("[gameserver] WS server entity {ws_entity:?} started on {ws_addr}");

    // --- WebTransport server entity (optional) ---
    if let Some(identity) = wt_identity {
        let wt_entity = commands
            .spawn((
                NetcodeServer::new(netcode_config()),
                LocalAddr(wt_addr),
                lightyear::webtransport::prelude::server::WebTransportServerIo {
                    certificate: identity,
                },
            ))
            .id();

        commands.trigger(Start { entity: wt_entity });
        tracing::info!("[gameserver] WT server entity {wt_entity:?} started on {wt_addr}");
    }
}

/// Load WebSocket TLS identity from PEM files (mkcert/production) or generate self-signed.
fn load_ws_identity() -> lightyear::websocket::server::Identity {
    let cert_path = std::env::var("GAME_WS_CERT").ok();
    let key_path = std::env::var("GAME_WS_KEY").ok();

    if let (Some(cert_file), Some(key_file)) = (cert_path, key_path) {
        match load_pem_identity(&cert_file, &key_file) {
            Ok(identity) => {
                tracing::info!("[gameserver] WS TLS loaded from PEM: {cert_file}");
                return identity;
            }
            Err(e) => {
                tracing::warn!(
                    "[gameserver] failed to load WS PEM certs: {e} — falling back to self-signed"
                );
            }
        }
    }

    tracing::info!("[gameserver] WS TLS using self-signed cert");
    lightyear::websocket::server::Identity::self_signed(["localhost", "127.0.0.1", "::1"])
        .expect("failed to generate self-signed cert for WebSocket server")
}

/// Parse PEM cert+key files into a lightyear websocket Identity.
fn load_pem_identity(
    cert_path: &str,
    key_path: &str,
) -> anyhow::Result<lightyear::websocket::server::Identity> {
    use rustls_pemfile::{certs, private_key};
    use std::io::BufReader;

    let cert_file = std::fs::File::open(cert_path)?;
    let key_file = std::fs::File::open(key_path)?;

    let cert_chain: Vec<_> =
        certs(&mut BufReader::new(cert_file)).collect::<Result<Vec<_>, _>>()?;

    let key_der = private_key(&mut BufReader::new(key_file))?
        .ok_or_else(|| anyhow::anyhow!("no private key found in {key_path}"))?;

    Ok(lightyear::websocket::server::Identity::new(
        cert_chain, key_der,
    ))
}

// ---------------------------------------------------------------------------
// Debug observers — transport + link lifecycle tracing
// ---------------------------------------------------------------------------

/// Diagnostic: log Link buffer states every tick for entities in the Server collection.
/// If the server's Netcode receive system processes packets, link.recv will be empty
/// after Update. If packets pile up, they're not being consumed.
#[allow(clippy::type_complexity)]
fn debug_link_packet_flow(
    server_q: Query<(Entity, &Server), Without<Stopped>>,
    link_q: Query<(Entity, &Link, Has<Linked>, Has<Linking>, Option<&Name>)>,
) {
    for (server_entity, server) in &server_q {
        for &client_entity in server.collection() {
            if let Ok((entity, link, is_linked, is_linking, name)) = link_q.get(client_entity) {
                let send_len = link.send.len();
                let recv_len = link.recv.len();
                let name_str = name.map(|n| n.as_str()).unwrap_or("?");
                // Only log when there's activity or the entity just appeared
                if send_len > 0 || recv_len > 0 || is_linking {
                    tracing::info!(
                        target: "gameserver.packet_debug",
                        server = ?server_entity,
                        client = ?entity,
                        name = name_str,
                        send = send_len,
                        recv = recv_len,
                        linked = is_linked,
                        linking = is_linking,
                        "[packet-debug] server={server_entity:?} client={entity:?}({name_str}) send={send_len} recv={recv_len} linked={is_linked} linking={is_linking}"
                    );
                }
            }
        }
        // Also log the collection size periodically
        let collection_size = server.collection().len();
        if collection_size > 0 {
            tracing::debug!(
                target: "gameserver.packet_debug",
                server = ?server_entity,
                clients = collection_size,
                "[packet-debug] server={server_entity:?} has {collection_size} clients in collection"
            );
        }
    }
}

/// Diagnostic: log ALL Link entities to detect orphans not in Server collection.
#[allow(clippy::type_complexity)]
fn debug_all_links(
    all_links: Query<(
        Entity,
        &Link,
        Has<Linked>,
        Has<Linking>,
        Option<&lightyear::link::prelude::LinkOf>,
        Option<&Name>,
    )>,
) {
    for (entity, link, is_linked, is_linking, link_of, name) in &all_links {
        let send_len = link.send.len();
        let recv_len = link.recv.len();
        if send_len == 0 && recv_len == 0 && !is_linking {
            continue;
        }
        let name_str = name.map(|n| n.as_str()).unwrap_or("?");
        let server_str = link_of
            .map(|l| format!("{:?}", l.server))
            .unwrap_or_else(|| "ORPHAN(no LinkOf)".to_string());
        tracing::info!(
            target: "gameserver.packet_debug",
            entity = ?entity,
            name = name_str,
            send = send_len,
            recv = recv_len,
            linked = is_linked,
            linking = is_linking,
            server = %server_str,
            "[all-links] entity={entity:?}({name_str}) send={send_len} recv={recv_len} linked={is_linked} linking={is_linking} server={server_str}"
        );
    }
}

/// Fires when Linking is added to a Link entity (transport connecting).
fn debug_on_linking_added(trigger: On<Add, Linking>) {
    let entity = trigger.entity;
    tracing::info!(
        target: "gameserver.transport",
        event = "linking",
        entity = ?entity,
        "[gameserver][link] LINKING — entity {entity:?} (transport connecting)"
    );
}

/// Fires when Linked is added to a Link entity (transport connected — packets can flow).
fn debug_on_linked_added(trigger: On<Add, Linked>) {
    let entity = trigger.entity;
    tracing::info!(
        target: "gameserver.transport",
        event = "linked",
        entity = ?entity,
        "[gameserver][link] LINKED — entity {entity:?} (transport ready, packets flowing)"
    );
}

/// Fires when Unlinked is added (transport failed or closed).
fn debug_on_unlinked_added(trigger: On<Add, Unlinked>) {
    let entity = trigger.entity;
    tracing::warn!(
        target: "gameserver.transport",
        event = "unlinked",
        entity = ?entity,
        "[gameserver][link] UNLINKED — entity {entity:?} (transport closed or failed)"
    );
}

/// Debug observer: fires when lightyear adds `Connecting` to a client entity on the server side.
fn on_server_connecting(trigger: On<Add, Connecting>) {
    let entity = trigger.entity;
    tracing::info!(
        target: "gameserver.lifecycle",
        event = "connecting",
        entity = ?entity,
        "[gameserver][lifecycle] CONNECTING — client entity {entity:?} starting handshake"
    );
}

/// Debug observer: fires when lightyear adds `Connected` to a client entity on the server side.
fn on_server_connected(trigger: On<Add, Connected>) {
    let entity = trigger.entity;
    tracing::info!(
        target: "gameserver.lifecycle",
        event = "connected",
        entity = ?entity,
        "[gameserver][lifecycle] CONNECTED — client entity {entity:?} handshake complete"
    );
}

/// When a client disconnects, clean up their player entity and auth state.
/// Despawning the replicated player entity triggers lightyear's built-in
/// despawn replication, notifying all remaining clients automatically.
#[allow(clippy::too_many_arguments)]
fn on_server_disconnected(
    trigger: On<Add, Disconnected>,
    mut commands: Commands,
    mut authenticated: ResMut<AuthenticatedClients>,
    mut client_player_map: ResMut<ClientPlayerMap>,
    mut inventories: ResMut<PlayerInventories>,
    mut equipment: ResMut<PlayerEquipment>,
    mut cooldowns: ResMut<ConsumableCooldowns>,
    mut set_username_attempts: ResMut<SetUsernameLastAttempt>,
) {
    let client_entity = trigger.entity;
    let user_id = authenticated.0.remove(&client_entity);
    let player_entity = client_player_map.0.remove(&client_entity);
    set_username_attempts.0.remove(&client_entity);
    if let Some(pe) = player_entity {
        inventories.0.remove(&pe);
        equipment.0.remove(&pe);
        cooldowns.0.retain(|(e, _), _| *e != pe);
    }

    tracing::warn!(
        target: "gameserver.lifecycle",
        event = "disconnected",
        client = ?client_entity,
        user_id = ?user_id,
        player = ?player_entity,
        "[gameserver][lifecycle] DISCONNECTED — client {client_entity:?} user={user_id:?} player={player_entity:?}"
    );

    if let Some(player_entity) = player_entity {
        commands.entity(player_entity).despawn();
        tracing::info!(
            target: "gameserver.lifecycle",
            event = "player_despawned",
            client = ?client_entity,
            player = ?player_entity,
            "[gameserver] despawned player entity {player_entity:?} for disconnected client {client_entity:?}"
        );
    }
}

/// Periodic heartbeat logging connected/pending clients every ~5 seconds.
fn server_debug_heartbeat(
    time: Res<Time>,
    mut timer: Local<Option<Timer>>,
    pending_q: Query<Entity, With<PendingAuth>>,
    connected_q: Query<Entity, With<Connected>>,
    authenticated: Res<AuthenticatedClients>,
) {
    let t = timer.get_or_insert_with(|| Timer::from_seconds(5.0, TimerMode::Repeating));
    t.tick(time.delta());
    if !t.just_finished() {
        return;
    }

    let pending: Vec<_> = pending_q.iter().collect();
    let connected: Vec<_> = connected_q.iter().collect();
    let auth_count = authenticated.0.len();

    if !pending.is_empty() || !connected.is_empty() || auth_count > 0 {
        tracing::info!(
            "[gameserver][heartbeat] connected={connected:?} pending_auth={pending:?} authenticated_count={auth_count}"
        );
    }
}

/// Periodic system: logs Link buffer states every ~2 seconds.
/// This helps diagnose whether packets from WebSocket clients reach the Link layer.
fn server_debug_link_buffers(
    time: Res<Time>,
    mut timer: Local<Option<Timer>>,
    link_q: Query<(Entity, &Link, Has<Linked>, Has<Linking>)>,
) {
    let t = timer.get_or_insert_with(|| Timer::from_seconds(2.0, TimerMode::Repeating));
    t.tick(time.delta());
    if !t.just_finished() {
        return;
    }

    // Only log Link entities with actual traffic (non-empty buffers)
    for (entity, link, is_linked, is_linking) in &link_q {
        let send_len = link.send.len();
        let recv_len = link.recv.len();
        if send_len > 0 || recv_len > 0 {
            tracing::debug!(
                "[gameserver][link-buffers] Link entity={entity:?} send={send_len} recv={recv_len} linked={is_linked} linking={is_linking}"
            );
        }
    }
}

/// Diagnostic: logs per-NetcodeServer collection() size every ~2s.
/// This reveals whether WT/WS connections produce Link entities visible to the Netcode layer.
#[allow(clippy::type_complexity)]
fn server_debug_netcode_collection(
    time: Res<Time>,
    mut timer: Local<Option<Timer>>,
    server_q: Query<(
        Entity,
        &NetcodeServer,
        &Server,
        Has<Linked>,
        Option<&LocalAddr>,
    )>,
    link_q: Query<(Entity, &Link, Has<Linked>), With<LinkOf>>,
) {
    let t = timer.get_or_insert_with(|| Timer::from_seconds(2.0, TimerMode::Repeating));
    t.tick(time.delta());
    if !t.just_finished() {
        return;
    }

    for (entity, _netcode, server, is_linked, local_addr) in &server_q {
        let addr = local_addr.map(|a| a.0.to_string()).unwrap_or_default();
        let collection = server.collection();
        let count = collection.len();
        if count > 0 {
            tracing::info!(
                "[gameserver][netcode-diag] Server entity={entity:?} addr={addr} linked={is_linked} collection_size={count}"
            );
            for &link_entity in collection {
                if let Ok((le, link, le_linked)) = link_q.get(link_entity) {
                    tracing::info!(
                        "[gameserver][netcode-diag]   Link {le:?} send={} recv={} linked={le_linked}",
                        link.send.len(),
                        link.recv.len(),
                    );
                } else {
                    tracing::warn!(
                        "[gameserver][netcode-diag]   Link {link_entity:?} NOT found in link_q (missing Link or LinkOf?)"
                    );
                }
            }
        }
    }
}

/// When a client's link is established (LinkOf added by the transport layer),
/// add ReplicationSender so lightyear can replicate entities to this client.
///
/// This follows the standard lightyear example pattern. LinkOf is auto-inserted
/// by all transports (UDP, WebSocket, WebTransport) when a client session is
/// established — it lives on the link entity that lightyear routes replication
/// through.
/// When a client's link is established (LinkOf added by the transport layer),
/// add ReplicationSender. Follows lightyear's example pattern exactly.
/// LinkOf + Connected + ReplicationSender end up on the same entity.
fn handle_new_link(trigger: On<Add, LinkOf>, mut commands: Commands) {
    let link_entity = trigger.entity;
    tracing::info!("[gameserver] NEW LINK — entity {link_entity:?}, adding ReplicationSender");
    commands.entity(link_entity).insert(ReplicationSender);
}

/// When a client's netcode handshake completes (Connected added), mark as
/// pending authentication. Player entity is spawned later during auth.
fn handle_new_connection(
    trigger: On<Add, Connected>,
    mut commands: Commands,
    time: Res<Time>,
    token_data_q: Query<&lightyear::netcode::prelude::server::TokenUserData>,
) {
    let client_entity = trigger.entity;

    // Extract user info from the Netcode token's user_data if available
    if let Ok(token_data) = token_data_q.get(client_entity) {
        if let Some(user_id) = bevy_kbve_net::net_config::unpack_user_data(&token_data.0) {
            tracing::info!(
                "[gameserver] NEW CLIENT — entity {client_entity:?} connected (token user_id: {user_id})"
            );
        } else {
            tracing::info!(
                "[gameserver] NEW CLIENT — entity {client_entity:?} connected (guest token)"
            );
        }
    } else {
        tracing::info!(
            "[gameserver] NEW CLIENT — entity {client_entity:?} connected (no token data)"
        );
    }

    // Insert ReplicationSender here too — lightyear's handle_connection
    // triggers on On<Add, (Connected, ReplicationSender)>. If both LinkOf
    // and Connected are added in the same command flush (WebSocket path),
    // the ReplicationSender from handle_new_link might not be committed yet.
    // Adding it here ensures it's present when Connected is inserted.
    commands.entity(client_entity).insert((
        PendingAuth,
        ConnectedAt(time.elapsed_secs()),
        ReplicationSender,
    ));
    tracing::info!("[gameserver] PendingAuth + ReplicationSender inserted for {client_entity:?}");
}

/// Encode the current game hour as a millihour challenge value.
/// This ties the handshake to the world clock — client must echo it back.
fn game_time_challenge(day: &DayCycle) -> u64 {
    (day.hour * 1000.0) as u64
}

/// Check for AuthMessage from connected clients and validate their JWT.
/// On success, sends AuthResponse with a `server_time` challenge (game clock)
/// and inserts PendingAck — the client must echo server_time in AuthAck to
/// complete the 4-step handshake.
#[allow(clippy::too_many_arguments, clippy::type_complexity)]
fn process_auth_messages(
    mut commands: Commands,
    jwt_secret: Res<JwtSecret>,
    day: Res<DayCycle>,
    ws_server: Res<WsServerEntity>,
    mut authenticated: ResMut<AuthenticatedClients>,
    mut client_player_map: ResMut<ClientPlayerMap>,
    profile_tx: Res<ProfileBridgeTx>,
    mut query: Query<
        (
            Entity,
            &mut MessageReceiver<AuthMessage>,
            &mut MessageSender<AuthResponse>,
        ),
        With<PendingAuth>,
    >,
) {
    let allow_anon = std::env::var("KBVE_ALLOW_ANON_AUTH")
        .map(|v| matches!(v.as_str(), "1" | "true" | "TRUE"))
        .unwrap_or(false);

    for (entity, mut receiver, mut sender) in &mut query {
        for msg in receiver.receive() {
            let server_time = game_time_challenge(&day);

            // --- Guest path: empty JWT → anonymous session ---
            if msg.jwt.is_empty() || msg.jwt.trim().is_empty() {
                // ULID gives globally-unique guest ids that survive restarts,
                // so two concurrent guest sessions can't collide on player_id.
                let guest_user_id = format!("guest_{}", uuid::Uuid::new_v4().simple());
                tracing::info!(
                    "client {entity:?} connecting as guest: {guest_user_id} (challenge={server_time})"
                );
                let player_id = user_id_to_player_id(&guest_user_id);
                let player_entity = spawn_player(&mut commands, player_id, entity, ws_server.0);
                sender.send::<GameChannel>(AuthResponse {
                    success: true,
                    user_id: guest_user_id.clone(),
                    player_id,
                    server_time,
                });
                commands
                    .entity(entity)
                    .remove::<PendingAuth>()
                    .insert(PendingAck { server_time });
                authenticated.0.insert(entity, guest_user_id);
                client_player_map.0.insert(entity, player_entity);
                continue;
            }

            // --- JWT path: validate with Supabase secret ---
            if jwt_secret.0.is_empty() {
                if !allow_anon {
                    tracing::error!(
                        "[gameserver] rejecting {entity:?} — SUPABASE_JWT_SECRET unset and KBVE_ALLOW_ANON_AUTH not enabled"
                    );
                    sender.send::<GameChannel>(AuthResponse {
                        success: false,
                        user_id: String::new(),
                        player_id: 0,
                        server_time: 0,
                    });
                    continue;
                }
                let anon_user_id = format!("anon_{}", uuid::Uuid::new_v4().simple());
                tracing::warn!(
                    "SUPABASE_JWT_SECRET not set and KBVE_ALLOW_ANON_AUTH=1 — accepting {entity:?} as {anon_user_id} (challenge={server_time})"
                );
                let player_id = user_id_to_player_id(&anon_user_id);
                let player_entity = spawn_player(&mut commands, player_id, entity, ws_server.0);
                sender.send::<GameChannel>(AuthResponse {
                    success: true,
                    user_id: anon_user_id.clone(),
                    player_id,
                    server_time,
                });
                commands
                    .entity(entity)
                    .remove::<PendingAuth>()
                    .insert(PendingAck { server_time });
                authenticated.0.insert(entity, anon_user_id.clone());
                client_player_map.0.insert(entity, player_entity);

                let _ = profile_tx.0.send(ProfileRequest::LookupUsername {
                    player_entity,
                    user_id: anon_user_id,
                });
                continue;
            }

            match crate::auth::verify_token(&msg.jwt, &jwt_secret.0) {
                Ok(claims) => {
                    let user_id = claims.sub.clone();
                    let jwt_username = claims.kbve_username.clone();
                    tracing::info!(
                        "client {entity:?} authenticated as user {user_id} (challenge={server_time}, jwt_username={jwt_username:?})"
                    );
                    let player_id = user_id_to_player_id(&user_id);
                    let player_entity = spawn_player(&mut commands, player_id, entity, ws_server.0);
                    sender.send::<GameChannel>(AuthResponse {
                        success: true,
                        user_id: user_id.clone(),
                        player_id,
                        server_time,
                    });
                    commands
                        .entity(entity)
                        .remove::<PendingAuth>()
                        .insert(PendingAck { server_time });
                    authenticated.0.insert(entity, user_id.clone());
                    client_player_map.0.insert(entity, player_entity);

                    // If the JWT already carries the canonical username
                    // (GoTrue Custom Access Token hook), skip the profile
                    // DB roundtrip and propagate it straight to PlayerName.
                    if let Some(name) = jwt_username.filter(|n| !n.is_empty()) {
                        let _ = profile_tx.0.send(ProfileRequest::SetUsernameLocal {
                            player_entity,
                            username: name,
                        });
                    } else {
                        let _ = profile_tx.0.send(ProfileRequest::LookupUsername {
                            player_entity,
                            user_id,
                        });
                    }
                }
                Err(e) => {
                    let jwt_preview = if msg.jwt.len() > 20 {
                        format!("{}...({} bytes)", &msg.jwt[..20], msg.jwt.len())
                    } else {
                        format!("({} bytes)", msg.jwt.len())
                    };
                    tracing::warn!("client {entity:?} auth failed: {e} | jwt={jwt_preview}");
                    sender.send::<GameChannel>(AuthResponse {
                        success: false,
                        user_id: String::new(),
                        player_id: 0,
                        server_time: 0,
                    });
                }
            }
        }
    }
}

/// Verify AuthAck from clients — step 4 of the 4-step handshake.
/// Client must echo back the exact `server_time` from AuthResponse.
/// On success: removes PendingAck, client is fully confirmed.
/// On failure: disconnects the client (possible replay/spoof).
fn verify_auth_ack(
    mut commands: Commands,
    mut query: Query<(Entity, &PendingAck, &mut MessageReceiver<AuthAck>)>,
) {
    for (entity, pending, mut receiver) in &mut query {
        for ack in receiver.receive() {
            if ack.server_time == pending.server_time {
                tracing::info!(
                    "[gameserver] AuthAck OK — client {entity:?} echoed server_time={} — handshake complete",
                    ack.server_time
                );
                commands
                    .entity(entity)
                    .remove::<PendingAck>()
                    .insert(NeedsWorldSync);
            } else {
                tracing::warn!(
                    "[gameserver] AuthAck MISMATCH — client {entity:?} sent {} but expected {} — disconnecting",
                    ack.server_time,
                    pending.server_time
                );
                commands.trigger(lightyear::prelude::Disconnect { entity });
            }
        }
    }
}

/// Counter for assigning spread-out spawn positions.
static PLAYER_COUNTER: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);

/// Player colors for distinguishing remote players.
const PLAYER_COLORS: &[(f32, f32, f32)] = &[
    (0.2, 0.4, 0.8), // blue
    (0.8, 0.2, 0.2), // red
    (0.2, 0.8, 0.3), // green
    (0.8, 0.6, 0.1), // orange
    (0.6, 0.2, 0.8), // purple
    (0.1, 0.8, 0.8), // cyan
];

/// Derive a stable player ID from a user identity string.
/// Uses FNV-1a hash to produce a deterministic u64 from the user_id.
fn user_id_to_player_id(user_id: &str) -> u64 {
    let mut hash: u64 = 0xcbf29ce484222325; // FNV offset basis
    for byte in user_id.as_bytes() {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(0x100000001b3); // FNV prime
    }
    hash
}

/// Spawn a player entity for an authenticated client, marked for replication.
/// `player_id` is derived from the user's identity (stable across reconnects).
/// `client_entity` is the connection entity — used for `ControlledBy` so
/// lightyear knows which client owns this player (required for replication
/// routing to work correctly for late-joining clients).
fn spawn_player(
    commands: &mut Commands,
    player_id: u64,
    client_entity: Entity,
    server_entity: Entity,
) -> Entity {
    let idx = PLAYER_COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);

    // Spread players apart so they don't collide on spawn
    let offset_x = (idx as f32) * 2.0;
    let spawn_x = 2.0 + offset_x;
    let spawn_y = 2.0;
    let spawn_z = 2.0;

    let (r, g, b) = PLAYER_COLORS[idx as usize % PLAYER_COLORS.len()];

    let player_entity = commands
        .spawn((
            bevy_kbve_net::PlayerId(player_id),
            bevy_kbve_net::PlayerColor(Color::srgb(r, g, b)),
            bevy_kbve_net::PlayerName(String::new()),
            bevy_kbve_net::PlayerVitals::default(),
            Transform::from_xyz(spawn_x, spawn_y, spawn_z),
            RigidBody::Kinematic,
            Position(Vec3::new(spawn_x, spawn_y, spawn_z)),
            Rotation::default(),
            LinearVelocity::default(),
            Collider::cuboid(0.6, 1.2, 0.6),
            // Server-side skill state. Persistence + cross-session restore is
            // not wired yet — fresh profile each session.
            SkillProfile::default(),
            // Target a specific server entity — avoids .single() failure when
            // multiple Server entities exist (WS + WT).
            Replicate::new(lightyear_replication::send::ReplicationMode::Server(
                server_entity,
                NetworkTarget::All,
            )),
            // Link player to owning client — required for replication routing
            ControlledBy {
                owner: client_entity,
                lifetime: Default::default(),
            },
        ))
        .id();

    tracing::info!(
        "spawned player entity {player_entity:?} (player_id={player_id}) at ({spawn_x}, {spawn_y}, {spawn_z})"
    );

    player_entity
}

/// Receive PositionUpdate messages from authenticated clients and apply to their player entities.
fn process_position_updates(
    client_player_map: Res<ClientPlayerMap>,
    mut receivers: Query<(Entity, &mut MessageReceiver<PositionUpdate>), Without<PendingAuth>>,
    mut positions: Query<&mut Position>,
) {
    for (client_entity, mut receiver) in &mut receivers {
        for msg in receiver.receive() {
            if let Some(&player_entity) = client_player_map.0.get(&client_entity) {
                if let Ok(mut pos) = positions.get_mut(player_entity) {
                    pos.0 = Vec3::new(msg.x, msg.y, msg.z);
                }
            }
        }
    }
}

/// Process damage events from clients and apply to their PlayerVitals.
fn process_damage_events(
    client_player_map: Res<ClientPlayerMap>,
    mut receivers: Query<(Entity, &mut MessageReceiver<DamageEvent>), Without<PendingAuth>>,
    mut vitals: Query<&mut bevy_kbve_net::PlayerVitals>,
) {
    for (client_entity, mut receiver) in &mut receivers {
        for msg in receiver.receive() {
            if let Some(&player_entity) = client_player_map.0.get(&client_entity) {
                if let Ok(mut v) = vitals.get_mut(player_entity) {
                    let old_hp = v.health;
                    v.health = (v.health - msg.amount).max(0.0);
                    tracing::info!(
                        "[gameserver] damage applied to {player_entity:?}: {:.1} → {:.1} (source={:?})",
                        old_hp,
                        v.health,
                        msg.source
                    );
                }
            }
        }
    }
}

/// Process collect requests: validate proximity + object existence, track removal, broadcast.
#[allow(clippy::too_many_arguments)]
fn process_collect_requests(
    time: Res<Time>,
    client_player_map: Res<ClientPlayerMap>,
    mut collected: ResMut<CollectedObjects>,
    mut inventories: ResMut<PlayerInventories>,
    mut receivers: Query<(Entity, &mut MessageReceiver<CollectRequest>), Without<PendingAuth>>,
    positions: Query<&Position>,
    player_ids: Query<&bevy_kbve_net::PlayerId>,
    skill_profiles: Query<&SkillProfile>,
    mut xp_writer: MessageWriter<GrantXpMsg>,
    legacy: Res<LegacyBroadcastFlag>,
    mut multi: ServerMultiMessageSender<With<Connected>>,
    servers: Query<&Server>,
    mut legacy_senders: Query<&mut MessageSender<ObjectRemoved>, With<Connected>>,
    mut inv_senders: Query<&mut MessageSender<InventoryUpdate>, With<Connected>>,
    mut xp_senders: Query<&mut MessageSender<SkillXpGrant>, With<Connected>>,
) {
    for (client_entity, mut receiver) in &mut receivers {
        for msg in receiver.receive() {
            let tile = msg.tile;

            // Already collected?
            if collected.0.contains_key(&tile) {
                continue;
            }

            // Verify an object actually exists at this tile
            let Some(kind) = bevy_kbve_net::object_at_tile(tile.tx, tile.tz) else {
                tracing::warn!(
                    "[gameserver] no object at tile ({},{}) — ignoring collect",
                    tile.tx,
                    tile.tz
                );
                continue;
            };

            // Proximity check: player must be near the tile
            if let Some(&player_entity) = client_player_map.0.get(&client_entity) {
                if let Ok(pos) = positions.get(player_entity) {
                    let tile_world = Vec3::new(tile.tx as f32, pos.0.y, tile.tz as f32);
                    let dist = (pos.0 - tile_world).length();
                    if dist > MAX_COLLECT_DISTANCE {
                        tracing::warn!(
                            "[gameserver] player too far ({dist:.1}) from tile ({},{}) — ignoring collect",
                            tile.tx,
                            tile.tz
                        );
                        continue;
                    }
                }
            }

            // Resolve the candidate item ref + skilling metadata up-front so we
            // can gate the collect before marking the tile consumed.
            let candidate_item_ref = bevy_kbve_net::item_ref_at(tile.tx, tile.tz).unwrap_or("");
            let player_entity_opt = client_player_map.0.get(&client_entity).copied();
            let skilling_meta = if candidate_item_ref.is_empty() {
                None
            } else {
                ProtoItemKind::from_ref(candidate_item_ref)
                    .item()
                    .and_then(|i| i.skilling.as_ref())
            };

            // Skill-level gating: reject the collect if the item declares a
            // required skill level and the player hasn't reached it. Tile stays
            // un-collected so the world object is still interactable.
            if let (Some(player_entity), Some(skilling)) = (player_entity_opt, skilling_meta) {
                if let Some(skill_ref) = skilling_type_to_skill_ref(
                    bevy_items::SkillingType::try_from(skilling.skill)
                        .unwrap_or(bevy_items::SkillingType::SkillingUnspecified),
                ) {
                    let required = skilling.skill_level.unwrap_or(0).max(0) as u32;
                    if required > 0 {
                        if let Ok(profile) = skill_profiles.get(player_entity) {
                            let current = profile.level(SkillId::from_ref(skill_ref));
                            if current < required {
                                tracing::info!(
                                    "[gameserver] collect rejected for player {player_entity:?}: \
                                     {skill_ref} level {current} < required {required} \
                                     (item={candidate_item_ref})"
                                );
                                continue;
                            }
                        }
                    }
                }
            }

            // Track the collection with current elapsed time
            collected.0.insert(tile, time.elapsed_secs_f64());
            tracing::info!(
                "[gameserver] object collected: {kind:?} at ({},{})",
                tile.tx,
                tile.tz
            );

            // Roll the full drop table for this tile. Deterministic per coord
            // so reconnects + replays see the same loot. The first entry is
            // the canonical primary (drives the client-side fall/break anim
            // via ObjectRemoved); any remaining entries are bonus drops that
            // only show up as extra InventoryUpdate messages.
            let drops = bevy_kbve_net::roll_loot_at(tile.tx, tile.tz);

            // Broadcast ObjectRemoved to all connected clients.
            let collector_id = client_player_map
                .0
                .get(&client_entity)
                .and_then(|&pe| player_ids.get(pe).ok())
                .map(|pid| pid.0)
                .unwrap_or(0);
            let (primary_ref, primary_qty) = drops
                .first()
                .map(|(r, q)| ((*r).to_string(), *q))
                .unwrap_or_else(|| (String::new(), 0));
            let removal = ObjectRemoved {
                tile,
                kind,
                collector_id,
                item_ref: primary_ref,
                quantity: primary_qty,
            };
            if legacy.is_legacy() {
                // Suspenders: per-client clone loop (legacy path).
                for mut sender in &mut legacy_senders {
                    sender.send::<bevy_kbve_net::GameChannel>(removal.clone());
                }
            } else {
                // Belt: serialize once, fan out the bytes.
                for server in &servers {
                    let _ = multi
                        .send::<ObjectRemoved, bevy_kbve_net::GameChannel>(
                            &removal,
                            server,
                            &NetworkTarget::All,
                        )
                        .inspect_err(|e| {
                            tracing::error!("[gameserver] ObjectRemoved broadcast failed: {e}")
                        });
                }
            }

            // Server-authoritative inventory: grant every rolled drop into the
            // collecting player's inventory and push one InventoryUpdate per
            // mutated slot. XP is granted per-drop based on each item's own
            // SkillingInfo (a bonus "branches" drop also awards woodcutting XP).
            if let Some(&player_entity) = client_player_map.0.get(&client_entity) {
                for (drop_ref, drop_qty) in &drops {
                    if drop_ref.is_empty() || *drop_qty == 0 {
                        continue;
                    }
                    let kind = ProtoItemKind::from_ref(drop_ref);
                    let inv = inventories.get_or_init(player_entity);
                    let overflow = inv.add(kind, *drop_qty);
                    let granted = drop_qty - overflow;
                    if granted == 0 {
                        tracing::warn!(
                            "[gameserver] inventory full for player {player_entity:?} — \
                             dropping {drop_ref} x{drop_qty}"
                        );
                        continue;
                    }

                    if let Some((slot_index, stack)) = inv
                        .items
                        .iter()
                        .enumerate()
                        .rev()
                        .find(|(_, s)| s.kind == kind)
                    {
                        let update = InventoryUpdate {
                            player_id: collector_id,
                            slot: slot_to_state(slot_index as u32, stack),
                        };
                        if let Ok(mut sender) = inv_senders.get_mut(client_entity) {
                            sender.send::<bevy_kbve_net::GameChannel>(update);
                        }
                    }

                    // XP per-drop from the item's own skilling metadata.
                    if let Some(skilling) = kind.item().and_then(|i| i.skilling.as_ref()) {
                        if let Some(skill_ref) = skilling_type_to_skill_ref(
                            bevy_items::SkillingType::try_from(skilling.skill)
                                .unwrap_or(bevy_items::SkillingType::SkillingUnspecified),
                        ) {
                            let xp_per = skilling.xp_reward.unwrap_or(0.0).max(0.0);
                            if xp_per > 0.0 {
                                let amount = (xp_per * granted as f32).round() as u64;
                                if amount > 0 {
                                    xp_writer.write(GrantXpMsg {
                                        entity: player_entity,
                                        skill: SkillId::from_ref(skill_ref),
                                        amount,
                                    });
                                    if let Ok(mut sender) = xp_senders.get_mut(client_entity) {
                                        sender.send::<bevy_kbve_net::GameChannel>(SkillXpGrant {
                                            player_id: collector_id,
                                            skill_ref: skill_ref.to_string(),
                                            amount,
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/// Helper: build a full InventorySync payload from a player's current inventory.
fn build_inventory_sync(player_id: u64, inv: &Inventory<ProtoItemKind>) -> InventorySync {
    let slots = inv
        .items
        .iter()
        .enumerate()
        .map(|(idx, stack)| slot_to_state(idx as u32, stack))
        .collect::<Vec<_>>();
    InventorySync {
        player_id,
        slots,
        max_slots: inv.max_slots as u32,
    }
}

/// ── P2 Equipment ────────────────────────────────────────────────────
fn process_equip_requests(
    client_player_map: Res<ClientPlayerMap>,
    mut inventories: ResMut<PlayerInventories>,
    mut equipment: ResMut<PlayerEquipment>,
    player_ids: Query<&bevy_kbve_net::PlayerId>,
    mut receivers: Query<(Entity, &mut MessageReceiver<EquipRequest>), Without<PendingAuth>>,
    mut inv_sync_senders: Query<&mut MessageSender<InventorySync>, With<Connected>>,
    mut equip_senders: Query<&mut MessageSender<EquipmentUpdate>, With<Connected>>,
) {
    for (client_entity, mut receiver) in &mut receivers {
        for msg in receiver.receive() {
            let Some(&player_entity) = client_player_map.0.get(&client_entity) else {
                continue;
            };
            let player_id = player_ids.get(player_entity).map(|p| p.0).unwrap_or(0);
            let inv = inventories.get_or_init(player_entity);

            let idx = msg.inventory_slot as usize;
            let Some(stack) = inv.items.get(idx).cloned() else {
                continue;
            };

            // Item must declare EquipmentInfo with a real slot.
            let Some(equipment_info) = stack.kind.item().and_then(|i| i.equipment.as_ref()) else {
                continue;
            };
            let slot = equipment_info.slot;
            if slot == bevy_items::EquipSlot::Unspecified as i32 {
                continue;
            }

            // Pop one of the item from inventory.
            inv.remove(stack.kind, 1);

            // If something is already in that slot, return it to inventory.
            let player_slots = equipment.0.entry(player_entity).or_default();
            if let Some(prev) = player_slots.insert(slot, stack.kind) {
                inv.add(prev, 1);
            }

            // Sync the (potentially shifted) inventory + equipment slot to client.
            let sync = build_inventory_sync(player_id, inv);
            if let Ok(mut s) = inv_sync_senders.get_mut(client_entity) {
                s.send::<bevy_kbve_net::GameChannel>(sync);
            }
            let item_ref = stack
                .kind
                .item()
                .map(|i| i.r#ref.clone())
                .unwrap_or_default();
            if let Ok(mut s) = equip_senders.get_mut(client_entity) {
                s.send::<bevy_kbve_net::GameChannel>(EquipmentUpdate {
                    player_id,
                    equip_slot: slot,
                    item_ref,
                });
            }
        }
    }
}

fn process_unequip_requests(
    client_player_map: Res<ClientPlayerMap>,
    mut inventories: ResMut<PlayerInventories>,
    mut equipment: ResMut<PlayerEquipment>,
    player_ids: Query<&bevy_kbve_net::PlayerId>,
    mut receivers: Query<(Entity, &mut MessageReceiver<UnequipRequest>), Without<PendingAuth>>,
    mut inv_sync_senders: Query<&mut MessageSender<InventorySync>, With<Connected>>,
    mut equip_senders: Query<&mut MessageSender<EquipmentUpdate>, With<Connected>>,
) {
    for (client_entity, mut receiver) in &mut receivers {
        for msg in receiver.receive() {
            let Some(&player_entity) = client_player_map.0.get(&client_entity) else {
                continue;
            };
            let player_id = player_ids.get(player_entity).map(|p| p.0).unwrap_or(0);
            let player_slots = equipment.0.entry(player_entity).or_default();
            let Some(kind) = player_slots.remove(&msg.equip_slot) else {
                continue;
            };

            let inv = inventories.get_or_init(player_entity);
            let overflow = inv.add(kind, 1);
            if overflow > 0 {
                // Bag full — re-equip so the item isn't lost.
                player_slots.insert(msg.equip_slot, kind);
                continue;
            }

            let sync = build_inventory_sync(player_id, inv);
            if let Ok(mut s) = inv_sync_senders.get_mut(client_entity) {
                s.send::<bevy_kbve_net::GameChannel>(sync);
            }
            if let Ok(mut s) = equip_senders.get_mut(client_entity) {
                s.send::<bevy_kbve_net::GameChannel>(EquipmentUpdate {
                    player_id,
                    equip_slot: msg.equip_slot,
                    item_ref: String::new(),
                });
            }
        }
    }
}

/// ── P2 Crafting ────────────────────────────────────────────────────
const FACILITY_REACH: f32 = 5.0;

fn near_facility(player_pos: &Position, deployed: &DeployedItems, facility_type: &str) -> bool {
    for (tile, entry) in &deployed.0 {
        let kind = ProtoItemKind::from_ref(&entry.item_ref);
        let Some(item) = kind.item() else { continue };
        let Some(dep) = item.deployable.as_ref() else {
            continue;
        };
        let matches = dep
            .deployable_type
            .as_deref()
            .map(|t| t == facility_type)
            .unwrap_or(false);
        if !matches {
            continue;
        }
        let tile_world = Vec3::new(tile.tx as f32, player_pos.0.y, tile.tz as f32);
        if (player_pos.0 - tile_world).length() <= FACILITY_REACH {
            return true;
        }
    }
    false
}

#[allow(clippy::too_many_arguments)]
fn process_craft_requests(
    client_player_map: Res<ClientPlayerMap>,
    mut inventories: ResMut<PlayerInventories>,
    deployed: Res<DeployedItems>,
    positions: Query<&Position>,
    player_ids: Query<&bevy_kbve_net::PlayerId>,
    skill_profiles: Query<&SkillProfile>,
    mut xp_writer: MessageWriter<GrantXpMsg>,
    mut receivers: Query<(Entity, &mut MessageReceiver<CraftRequest>), Without<PendingAuth>>,
    mut inv_sync_senders: Query<&mut MessageSender<InventorySync>, With<Connected>>,
    mut craft_senders: Query<&mut MessageSender<CraftResult>, With<Connected>>,
    mut xp_senders: Query<&mut MessageSender<SkillXpGrant>, With<Connected>>,
) {
    for (client_entity, mut receiver) in &mut receivers {
        for msg in receiver.receive() {
            let Some(&player_entity) = client_player_map.0.get(&client_entity) else {
                continue;
            };
            let player_id = player_ids.get(player_entity).map(|p| p.0).unwrap_or(0);

            let kind = ProtoItemKind::from_ref(&msg.output_item_ref);
            let Some(item) = kind.item() else {
                if let Ok(mut s) = craft_senders.get_mut(client_entity) {
                    s.send::<bevy_kbve_net::GameChannel>(CraftResult {
                        player_id,
                        output_item_ref: msg.output_item_ref.clone(),
                        success: false,
                        failure_reason: Some(CraftFailureReason::UnknownItem),
                        produced: 0,
                    });
                }
                continue;
            };
            let Some(recipe) = item.recipes.get(msg.recipe_index as usize) else {
                if let Ok(mut s) = craft_senders.get_mut(client_entity) {
                    s.send::<bevy_kbve_net::GameChannel>(CraftResult {
                        player_id,
                        output_item_ref: msg.output_item_ref.clone(),
                        success: false,
                        failure_reason: Some(CraftFailureReason::InvalidRecipe),
                        produced: 0,
                    });
                }
                continue;
            };
            let batches = msg.batches.max(1);

            // Skill check (recipe.skill + recipe.skill_level)
            if let (Some(skill_slug), Some(required)) = (recipe.skill.as_ref(), recipe.skill_level)
            {
                if required > 0 {
                    if let Ok(profile) = skill_profiles.get(player_entity) {
                        let current = profile.level(SkillId::from_ref(skill_slug));
                        if current < required as u32 {
                            if let Ok(mut s) = craft_senders.get_mut(client_entity) {
                                s.send::<bevy_kbve_net::GameChannel>(CraftResult {
                                    player_id,
                                    output_item_ref: msg.output_item_ref.clone(),
                                    success: false,
                                    failure_reason: Some(CraftFailureReason::SkillTooLow),
                                    produced: 0,
                                });
                            }
                            continue;
                        }
                    }
                }
            }

            // Facility check (recipe.facility = "furnace", "workbench", etc.)
            // The player must be standing near a deployed item whose proto
            // DeployableInfo.deployable_type matches.
            if let Some(facility) = recipe.facility.as_deref() {
                let nearby = positions
                    .get(player_entity)
                    .map(|pos| near_facility(pos, &deployed, facility))
                    .unwrap_or(false);
                if !nearby {
                    if let Ok(mut s) = craft_senders.get_mut(client_entity) {
                        s.send::<bevy_kbve_net::GameChannel>(CraftResult {
                            player_id,
                            output_item_ref: msg.output_item_ref.clone(),
                            success: false,
                            failure_reason: Some(CraftFailureReason::MissingFacility),
                            produced: 0,
                        });
                    }
                    continue;
                }
            }

            let inv = inventories.get_or_init(player_entity);

            // Validate every consumed ingredient is available in the requested
            // batch count.
            let mut missing = false;
            for ing in &recipe.ingredients {
                if !ing.consumed.unwrap_or(true) {
                    continue;
                }
                let need = (ing.amount as u32).saturating_mul(batches);
                let ing_kind = ProtoItemKind::from_ref(&ing.item_ref);
                if inv.count(ing_kind) < need {
                    missing = true;
                    break;
                }
            }
            if missing {
                if let Ok(mut s) = craft_senders.get_mut(client_entity) {
                    s.send::<bevy_kbve_net::GameChannel>(CraftResult {
                        player_id,
                        output_item_ref: msg.output_item_ref.clone(),
                        success: false,
                        failure_reason: Some(CraftFailureReason::MissingIngredients),
                        produced: 0,
                    });
                }
                continue;
            }

            // Capacity sanity: if the output won't fit even partially, reject.
            let output_qty =
                (recipe.output_quantity.unwrap_or(1).max(1) as u32).saturating_mul(batches);
            if !inv.has_room_for(kind, 1) {
                if let Ok(mut s) = craft_senders.get_mut(client_entity) {
                    s.send::<bevy_kbve_net::GameChannel>(CraftResult {
                        player_id,
                        output_item_ref: msg.output_item_ref.clone(),
                        success: false,
                        failure_reason: Some(CraftFailureReason::InventoryFull),
                        produced: 0,
                    });
                }
                continue;
            }

            // Consume ingredients then add the output.
            for ing in &recipe.ingredients {
                if !ing.consumed.unwrap_or(true) {
                    continue;
                }
                let need = (ing.amount as u32).saturating_mul(batches);
                inv.remove(ProtoItemKind::from_ref(&ing.item_ref), need);
            }
            let overflow = inv.add(kind, output_qty);
            let produced = output_qty - overflow;

            // Craft XP.
            if let (Some(skill_slug), Some(xp_per)) = (recipe.skill.as_ref(), recipe.xp_reward) {
                if xp_per > 0.0 {
                    let amount = (xp_per * batches as f32).round() as u64;
                    if amount > 0 {
                        xp_writer.write(GrantXpMsg {
                            entity: player_entity,
                            skill: SkillId::from_ref(skill_slug),
                            amount,
                        });
                        if let Ok(mut s) = xp_senders.get_mut(client_entity) {
                            s.send::<bevy_kbve_net::GameChannel>(SkillXpGrant {
                                player_id,
                                skill_ref: skill_slug.clone(),
                                amount,
                            });
                        }
                    }
                }
            }

            let sync = build_inventory_sync(player_id, inv);
            if let Ok(mut s) = inv_sync_senders.get_mut(client_entity) {
                s.send::<bevy_kbve_net::GameChannel>(sync);
            }
            if let Ok(mut s) = craft_senders.get_mut(client_entity) {
                s.send::<bevy_kbve_net::GameChannel>(CraftResult {
                    player_id,
                    output_item_ref: msg.output_item_ref.clone(),
                    success: produced > 0,
                    failure_reason: None,
                    produced,
                });
            }
        }
    }
}

/// ── P3 Consumables ────────────────────────────────────────────────────
#[allow(clippy::too_many_arguments)]
fn process_use_item_requests(
    time: Res<Time>,
    client_player_map: Res<ClientPlayerMap>,
    mut inventories: ResMut<PlayerInventories>,
    mut cooldowns: ResMut<ConsumableCooldowns>,
    mut vitals: Query<&mut bevy_kbve_net::PlayerVitals>,
    player_ids: Query<&bevy_kbve_net::PlayerId>,
    mut receivers: Query<(Entity, &mut MessageReceiver<UseItemRequest>), Without<PendingAuth>>,
    mut inv_sync_senders: Query<&mut MessageSender<InventorySync>, With<Connected>>,
) {
    for (client_entity, mut receiver) in &mut receivers {
        for msg in receiver.receive() {
            let Some(&player_entity) = client_player_map.0.get(&client_entity) else {
                continue;
            };
            let player_id = player_ids.get(player_entity).map(|p| p.0).unwrap_or(0);
            let inv = inventories.get_or_init(player_entity);
            let idx = msg.inventory_slot as usize;
            let Some(stack) = inv.items.get(idx).cloned() else {
                continue;
            };
            let Some(item) = stack.kind.item() else {
                continue;
            };
            if !item.consumable.unwrap_or(false) {
                continue;
            }

            // Cooldown check (item.cooldown is in seconds).
            let now = time.elapsed_secs_f64();
            let key = (player_entity, stack.kind.id);
            if let Some(&ready_at) = cooldowns.0.get(&key) {
                if now < ready_at {
                    continue;
                }
            }

            // Apply use_effects. Only Heal is fully wired right now — other
            // effect types fall through silently until bevy_battle integration
            // lands.
            if let Ok(mut v) = vitals.get_mut(player_entity) {
                for eff in &item.use_effects {
                    match bevy_items::UseEffectType::try_from(eff.r#type) {
                        Ok(bevy_items::UseEffectType::UseEffectHeal) => {
                            let amount = eff.amount.unwrap_or(0).max(0) as f32;
                            v.health = (v.health + amount).min(v.max_health);
                        }
                        Ok(bevy_items::UseEffectType::UseEffectFullHeal) => {
                            v.health = v.max_health;
                        }
                        Ok(bevy_items::UseEffectType::UseEffectRemoveAllNegative) => {
                            // PlayerVitals has no status-effect list yet; this
                            // is a no-op until a StatusEffects component lands.
                            // Kept here so the proto enum arm is reachable.
                        }
                        _ => {}
                    }
                }
            }

            // Decrement stack by one, drop the slot when empty.
            if let Some(s) = inv.items.get_mut(idx) {
                s.quantity = s.quantity.saturating_sub(1);
                if s.quantity == 0 {
                    inv.items.remove(idx);
                }
            }

            if let Some(cd) = item.cooldown {
                if cd > 0 {
                    cooldowns.0.insert(key, now + cd as f64);
                }
            }

            let sync = build_inventory_sync(player_id, inv);
            if let Ok(mut s) = inv_sync_senders.get_mut(client_entity) {
                s.send::<bevy_kbve_net::GameChannel>(sync);
            }
        }
    }
}

/// ── P3 Deployables ────────────────────────────────────────────────────
#[allow(clippy::too_many_arguments)]
fn process_deploy_requests(
    client_player_map: Res<ClientPlayerMap>,
    mut inventories: ResMut<PlayerInventories>,
    mut deployed: ResMut<DeployedItems>,
    player_ids: Query<&bevy_kbve_net::PlayerId>,
    legacy: Res<LegacyBroadcastFlag>,
    mut multi: ServerMultiMessageSender<With<Connected>>,
    servers: Query<&Server>,
    mut receivers: Query<(Entity, &mut MessageReceiver<DeployRequest>), Without<PendingAuth>>,
    mut inv_sync_senders: Query<&mut MessageSender<InventorySync>, With<Connected>>,
    mut legacy_deploy_senders: Query<&mut MessageSender<ItemDeployed>, With<Connected>>,
) {
    for (client_entity, mut receiver) in &mut receivers {
        for msg in receiver.receive() {
            let Some(&player_entity) = client_player_map.0.get(&client_entity) else {
                continue;
            };
            let player_id = player_ids.get(player_entity).map(|p| p.0).unwrap_or(0);

            if deployed.0.contains_key(&msg.tile) {
                continue;
            }

            let inv = inventories.get_or_init(player_entity);
            let idx = msg.inventory_slot as usize;
            let Some(stack) = inv.items.get(idx).cloned() else {
                continue;
            };
            let Some(item) = stack.kind.item() else {
                continue;
            };
            if item.deployable.is_none() {
                continue;
            }

            // Remove one from inventory.
            if let Some(s) = inv.items.get_mut(idx) {
                s.quantity = s.quantity.saturating_sub(1);
                if s.quantity == 0 {
                    inv.items.remove(idx);
                }
            }

            let item_ref = item.r#ref.clone();
            deployed.0.insert(
                msg.tile,
                DeployedEntry {
                    owner_id: player_id,
                    item_ref: item_ref.clone(),
                },
            );

            let broadcast = ItemDeployed {
                owner_id: player_id,
                tile: msg.tile,
                item_ref,
            };
            if legacy.is_legacy() {
                for mut sender in &mut legacy_deploy_senders {
                    sender.send::<bevy_kbve_net::GameChannel>(broadcast.clone());
                }
            } else {
                for server in &servers {
                    let _ = multi
                        .send::<ItemDeployed, bevy_kbve_net::GameChannel>(
                            &broadcast,
                            server,
                            &NetworkTarget::All,
                        )
                        .inspect_err(|e| {
                            tracing::error!("[gameserver] ItemDeployed broadcast failed: {e}")
                        });
                }
            }

            let sync = build_inventory_sync(player_id, inv);
            if let Ok(mut s) = inv_sync_senders.get_mut(client_entity) {
                s.send::<bevy_kbve_net::GameChannel>(sync);
            }
        }
    }
}

/// Periodically check for collected objects whose respawn cooldown has elapsed.
fn tick_respawns(
    time: Res<Time>,
    mut collected: ResMut<CollectedObjects>,
    legacy: Res<LegacyBroadcastFlag>,
    mut multi: ServerMultiMessageSender<With<Connected>>,
    servers: Query<&Server>,
    mut legacy_senders: Query<&mut MessageSender<ObjectRespawned>, With<Connected>>,
) {
    let now = time.elapsed_secs_f64();
    let mut respawned = Vec::new();

    for (&tile, &collected_at) in collected.0.iter() {
        if now - collected_at >= RESPAWN_COOLDOWN_SECS {
            respawned.push(tile);
        }
    }

    for tile in respawned {
        collected.0.remove(&tile);

        if let Some(kind) = bevy_kbve_net::object_at_tile(tile.tx, tile.tz) {
            tracing::info!(
                "[gameserver] object respawned: {kind:?} at ({},{})",
                tile.tx,
                tile.tz
            );

            let msg = ObjectRespawned { tile, kind };
            if legacy.is_legacy() {
                for mut sender in &mut legacy_senders {
                    sender.send::<bevy_kbve_net::GameChannel>(msg.clone());
                }
            } else {
                for server in &servers {
                    let _ = multi
                        .send::<ObjectRespawned, bevy_kbve_net::GameChannel>(
                            &msg,
                            server,
                            &NetworkTarget::All,
                        )
                        .inspect_err(|e| {
                            tracing::error!("[gameserver] ObjectRespawned broadcast failed: {e}")
                        });
                }
            }
        }
    }
}

/// Process creature capture requests: validate against CreatureRegistry, track, broadcast.
#[allow(clippy::too_many_arguments)]
fn process_creature_captures(
    client_player_map: Res<ClientPlayerMap>,
    mut captured: ResMut<CapturedCreatures>,
    mut capture_log: ResMut<CapturedCreatureLog>,
    mut inventories: ResMut<PlayerInventories>,
    mut receivers: Query<
        (Entity, &mut MessageReceiver<CreatureCaptureRequest>),
        Without<PendingAuth>,
    >,
    player_ids: Query<&bevy_kbve_net::PlayerId>,
    legacy: Res<LegacyBroadcastFlag>,
    mut multi: ServerMultiMessageSender<With<Connected>>,
    servers: Query<&Server>,
    mut legacy_senders: Query<&mut MessageSender<CreatureCaptured>, With<Connected>>,
    mut inv_sync_senders: Query<&mut MessageSender<InventorySync>, With<Connected>>,
) {
    for (client_entity, mut receiver) in &mut receivers {
        for msg in receiver.receive() {
            // Already captured?
            if captured.is_captured(msg.creature_id) {
                tracing::warn!(
                    "[gameserver] creature {:?} (ulid={}) already captured — ignoring",
                    msg.kind,
                    msg.creature_id
                );
                continue;
            }

            // Track the capture
            captured.insert(msg.creature_id);

            let captor_id = client_player_map
                .0
                .get(&client_entity)
                .and_then(|&pe| player_ids.get(pe).ok())
                .map(|pid| pid.0)
                .unwrap_or(0);

            tracing::info!(
                "[gameserver] creature captured: {:?} (ulid={}) by player {captor_id}",
                msg.kind,
                msg.creature_id
            );

            // Broadcast to all connected clients and log for replay
            let broadcast = CreatureCaptured {
                creature_id: msg.creature_id,
                kind: msg.kind,
                captor_player_id: captor_id,
            };
            capture_log.0.push(CapturedCreatureEntry {
                creature_id: msg.creature_id,
                kind: msg.kind,
            });
            if legacy.is_legacy() {
                for mut sender in &mut legacy_senders {
                    sender.send::<GameChannel>(broadcast.clone());
                }
            } else {
                for server in &servers {
                    let _ = multi
                        .send::<CreatureCaptured, GameChannel>(
                            &broadcast,
                            server,
                            &NetworkTarget::All,
                        )
                        .inspect_err(|e| {
                            tracing::error!("[gameserver] CreatureCaptured broadcast failed: {e}")
                        });
                }
            }

            // Inventory bridge: grant a captured-{npc_ref} item if itemdb has
            // a matching entry. No-op when the item ref is unknown so we don't
            // silently fail on new creature kinds.
            if let Some(&player_entity) = client_player_map.0.get(&client_entity) {
                let captured_ref = format!("captured-{}", creature_kind_to_npc_ref(msg.kind));
                let kind = ProtoItemKind::from_ref(&captured_ref);
                if kind.item().is_some() {
                    let inv = inventories.get_or_init(player_entity);
                    let overflow = inv.add(kind, 1);
                    if overflow == 0 {
                        let sync = build_inventory_sync(captor_id, inv);
                        if let Ok(mut s) = inv_sync_senders.get_mut(client_entity) {
                            s.send::<bevy_kbve_net::GameChannel>(sync);
                        }
                    } else {
                        tracing::warn!(
                            "[gameserver] capture bag full for player {player_entity:?} \
                             — dropping {captured_ref}"
                        );
                    }
                } else {
                    tracing::debug!(
                        "[gameserver] no itemdb entry for {captured_ref} \
                         — capture broadcast only, no inventory grant"
                    );
                }
            }
        }
    }
}

/// When a new client authenticates, send them all currently collected objects
/// so they know which ones to skip when loading chunks, plus a full inventory
/// snapshot so their bag mirrors the server state.
#[allow(clippy::too_many_arguments)]
fn send_collected_state_to_new_clients(
    mut commands: Commands,
    collected: Res<CollectedObjects>,
    inventories: Res<PlayerInventories>,
    equipment: Res<PlayerEquipment>,
    deployed: Res<DeployedItems>,
    client_player_map: Res<ClientPlayerMap>,
    player_ids: Query<&bevy_kbve_net::PlayerId>,
    mut senders: Query<(Entity, &mut MessageSender<ObjectRemoved>), With<NeedsWorldSync>>,
    mut inv_sync_senders: Query<&mut MessageSender<InventorySync>, With<NeedsWorldSync>>,
    mut equip_sync_senders: Query<&mut MessageSender<EquipmentSync>, With<NeedsWorldSync>>,
    mut deployed_senders: Query<&mut MessageSender<ItemDeployed>, With<NeedsWorldSync>>,
) {
    for (entity, mut sender) in &mut senders {
        if !collected.0.is_empty() {
            tracing::info!(
                "[gameserver] sending {} collected objects to new client {entity:?}",
                collected.0.len()
            );

            for &tile in collected.0.keys() {
                if let Some(kind) = bevy_kbve_net::object_at_tile(tile.tx, tile.tz) {
                    // collector_id=0 for catch-up messages — new client just skips spawning,
                    // no loot is granted. item_ref/quantity stay empty for the same reason.
                    sender.send::<bevy_kbve_net::GameChannel>(ObjectRemoved {
                        tile,
                        kind,
                        collector_id: 0,
                        item_ref: String::new(),
                        quantity: 0,
                    });
                }
            }
        }

        // Push the player's current inventory snapshot. Empty inventories still
        // ship a sync with max_slots so the client sizes its local bag correctly.
        if let Some(&player_entity) = client_player_map.0.get(&entity) {
            let player_id = player_ids.get(player_entity).map(|p| p.0).unwrap_or(0);
            let (slots, max_slots) = match inventories.0.get(&player_entity) {
                Some(inv) => {
                    let slots = inv
                        .items
                        .iter()
                        .enumerate()
                        .map(|(idx, stack)| slot_to_state(idx as u32, stack))
                        .collect::<Vec<_>>();
                    (slots, inv.max_slots as u32)
                }
                None => (Vec::new(), PLAYER_INVENTORY_SLOTS as u32),
            };
            let sync = InventorySync {
                player_id,
                slots,
                max_slots,
            };
            if let Ok(mut s) = inv_sync_senders.get_mut(entity) {
                s.send::<bevy_kbve_net::GameChannel>(sync);
            }

            // Equipment snapshot — empty slots are omitted.
            let equip_slots: Vec<(i32, String)> = equipment
                .0
                .get(&player_entity)
                .map(|slots| {
                    slots
                        .iter()
                        .map(|(slot, kind)| {
                            let item_ref = kind.item().map(|i| i.r#ref.clone()).unwrap_or_default();
                            (*slot, item_ref)
                        })
                        .collect()
                })
                .unwrap_or_default();
            if let Ok(mut s) = equip_sync_senders.get_mut(entity) {
                s.send::<bevy_kbve_net::GameChannel>(EquipmentSync {
                    player_id,
                    slots: equip_slots,
                });
            }
        }

        // Replay every active deployable so the new client spawns their visuals.
        if !deployed.0.is_empty() {
            if let Ok(mut s) = deployed_senders.get_mut(entity) {
                for (tile, entry) in &deployed.0 {
                    s.send::<bevy_kbve_net::GameChannel>(ItemDeployed {
                        owner_id: entry.owner_id,
                        tile: *tile,
                        item_ref: entry.item_ref.clone(),
                    });
                }
            }
        }

        // Remove marker — world state has been sent.
        commands.entity(entity).remove::<NeedsWorldSync>();
    }
}

/// Poll the profile bridge receiver for completed username lookups / set-username results.
fn process_profile_responses(
    bridge_rx: Res<ProfileBridgeRx>,
    mut names: Query<&mut PlayerName>,
    mut senders: Query<&mut MessageSender<SetUsernameResponse>>,
) {
    let rx = bridge_rx.0.lock().unwrap();
    while let Ok(resp) = rx.try_recv() {
        match resp {
            ProfileResponse::Username {
                player_entity,
                username,
            } => {
                if let Ok(mut name) = names.get_mut(player_entity) {
                    tracing::info!(
                        "[gameserver] setting PlayerName for {player_entity:?} to '{username}'"
                    );
                    name.0 = username;
                }
            }
            ProfileResponse::SetUsernameResult {
                client_entity,
                player_entity,
                success,
                username,
                error,
            } => {
                // Update the replicated PlayerName component on success
                if success {
                    if let Ok(mut name) = names.get_mut(player_entity) {
                        name.0 = username.clone();
                    }
                }

                // Send response message to the requesting client
                if let Ok(mut sender) = senders.get_mut(client_entity) {
                    sender.send::<GameChannel>(SetUsernameResponse {
                        success,
                        username,
                        error,
                    });
                }
            }
        }
    }
}

/// Minimum seconds between successive `SetUsernameRequest`s from the same
/// client. Prevents a misbehaving client from spamming the profile service
/// with rename attempts.
const SET_USERNAME_COOLDOWN_SECS: f32 = 60.0;

#[derive(Resource, Default)]
struct SetUsernameLastAttempt(std::collections::HashMap<Entity, f32>);

/// Process SetUsernameRequest messages from clients.
fn process_set_username_requests(
    time: Res<Time>,
    client_player_map: Res<ClientPlayerMap>,
    authenticated: Res<AuthenticatedClients>,
    profile_tx: Res<ProfileBridgeTx>,
    mut last_attempt: ResMut<SetUsernameLastAttempt>,
    mut receivers: Query<(Entity, &mut MessageReceiver<SetUsernameRequest>), Without<PendingAuth>>,
) {
    let now = time.elapsed_secs();
    for (client_entity, mut receiver) in &mut receivers {
        for msg in receiver.receive() {
            let Some(&player_entity) = client_player_map.0.get(&client_entity) else {
                continue;
            };
            let Some(user_id) = authenticated.0.get(&client_entity) else {
                continue;
            };

            if let Some(&prev) = last_attempt.0.get(&client_entity) {
                if now - prev < SET_USERNAME_COOLDOWN_SECS {
                    tracing::warn!(
                        "[gameserver] dropping set-username from {client_entity:?} — cooldown ({:.1}s remaining)",
                        SET_USERNAME_COOLDOWN_SECS - (now - prev)
                    );
                    continue;
                }
            }
            last_attempt.0.insert(client_entity, now);

            tracing::info!(
                "[gameserver] set-username request from {client_entity:?}: '{}'",
                msg.username
            );

            let _ = profile_tx.0.send(ProfileRequest::SetUsername {
                client_entity,
                player_entity,
                user_id: user_id.clone(),
                username: msg.username,
            });
        }
    }
}

/// How long a client is allowed to stay in `PendingAuth` or `PendingAck`
/// before the server gives up and closes the connection.
const AUTH_HANDSHAKE_TIMEOUT_SECS: f32 = 15.0;

fn disconnect_stalled_auth(
    mut commands: Commands,
    time: Res<Time>,
    pending_auth: Query<(Entity, &ConnectedAt), With<PendingAuth>>,
    pending_ack: Query<(Entity, &ConnectedAt), With<PendingAck>>,
) {
    let now = time.elapsed_secs();
    for (entity, connected_at) in pending_auth.iter().chain(pending_ack.iter()) {
        if now - connected_at.0 > AUTH_HANDSHAKE_TIMEOUT_SECS {
            tracing::warn!(
                "[gameserver] dropping {entity:?} — handshake exceeded {:.1}s",
                AUTH_HANDSHAKE_TIMEOUT_SECS
            );
            commands.entity(entity).despawn();
        }
    }
}

// ---------------------------------------------------------------------------
// Day/night cycle & time sync systems
// ---------------------------------------------------------------------------

/// Advance the server-authoritative day/night clock each tick.
fn update_server_day_cycle(time: Res<Time>, mut day: ResMut<DayCycle>) {
    day.hour += day.speed * time.delta_secs();
    if day.hour >= 24.0 {
        day.hour -= 24.0;
    }
}

/// Sync the server's DayCycle + CreatureSeed into the shared GameTime resource
/// so creature simulation uses the authoritative clock.
fn sync_creature_game_time(
    day: Res<DayCycle>,
    seed: Res<CreatureSeed>,
    mut game_time: ResMut<bevy_kbve_net::creatures::common::GameTime>,
) {
    game_time.hour = day.hour;
    game_time.creature_seed = seed.0;
}

/// Populate the shared PlayerPositions resource from server player entities
/// so creature physics LOD and behavior trees can sense player proximity.
fn update_server_player_positions(
    player_q: Query<&Transform, With<bevy_kbve_net::PlayerId>>,
    mut positions: ResMut<bevy_kbve_net::creatures::types::PlayerPositions>,
) {
    positions.0.clear();
    positions.0.extend(player_q.iter().map(|t| t.translation));
}

/// Maximum distance from any player to include a creature in the sync broadcast.
const CREATURE_SYNC_RADIUS: f32 = 80.0;

/// Periodically broadcast server creature positions to all clients.
/// Only sends creatures within `CREATURE_SYNC_RADIUS` of at least one player.
fn broadcast_creature_sync(
    time: Res<Time>,
    mut timer: ResMut<CreatureSyncTimer>,
    creature_q: Query<(
        &bevy_kbve_net::creatures::types::Creature,
        &bevy_kbve_net::creatures::types::SpriteData,
        &bevy_kbve_net::creatures::types::SpriteCreatureMarker,
        &bevy_kbve_net::creatures::types::CreatureId,
    )>,
    ambient_q: Query<(
        &bevy_kbve_net::creatures::types::Creature,
        &bevy_kbve_net::creatures::ambient_types::AmbientCreatureMarker,
        &bevy_kbve_net::creatures::types::CreatureId,
    )>,
    types: Res<bevy_kbve_net::creatures::types::SpriteCreatureTypes>,
    player_positions: Res<bevy_kbve_net::creatures::types::PlayerPositions>,
    legacy: Res<LegacyBroadcastFlag>,
    mut multi: ServerMultiMessageSender<With<Connected>>,
    servers: Query<&Server>,
    mut legacy_senders: Query<&mut MessageSender<CreaturePositionSync>, With<Connected>>,
) {
    timer.0.tick(time.delta());
    if !timer.0.just_finished() {
        return;
    }

    // No players connected — nothing to sync
    if player_positions.0.is_empty() {
        return;
    }

    let sync_radius_sq = CREATURE_SYNC_RADIUS * CREATURE_SYNC_RADIUS;

    // --- Sprite creatures ---
    for ctype in &types.types {
        let mut snapshots = Vec::new();
        for (cr, sd, marker, cid) in &creature_q {
            if marker.type_key != ctype.npc_ref {
                continue;
            }
            let near_player = player_positions.0.iter().any(|p| {
                let dx = cr.anchor.x - p.x;
                let dz = cr.anchor.z - p.z;
                dx * dx + dz * dz <= sync_radius_sq
            });
            if !near_player {
                continue;
            }

            let hop_state = match sd.hop_state {
                bevy_kbve_net::creatures::types::SpriteHopState::Idle { .. } => 0,
                bevy_kbve_net::creatures::types::SpriteHopState::Emote { .. } => 1,
                bevy_kbve_net::creatures::types::SpriteHopState::JumpWindup { .. } => 2,
                bevy_kbve_net::creatures::types::SpriteHopState::Airborne { .. } => 3,
                bevy_kbve_net::creatures::types::SpriteHopState::Landing { .. } => 4,
            };
            snapshots.push(CreatureSnapshot {
                creature_id: cid.as_u128(),
                x: cr.anchor.x,
                y: cr.anchor.y,
                z: cr.anchor.z,
                hop_state,
                patrol_step: marker.patrol_step,
                facing_left: sd.facing_left,
            });
        }

        if !snapshots.is_empty() {
            let msg = CreaturePositionSync {
                npc_ref: ctype.npc_ref.to_string(),
                snapshots,
            };
            if legacy.is_legacy() {
                for mut sender in &mut legacy_senders {
                    sender.send::<CreatureSyncChannel>(msg.clone());
                }
            } else {
                for server in &servers {
                    let _ = multi
                        .send::<CreaturePositionSync, CreatureSyncChannel>(
                            &msg,
                            server,
                            &NetworkTarget::All,
                        )
                        .inspect_err(|e| {
                            tracing::error!(
                                "[gameserver] CreaturePositionSync (sprite) broadcast failed: {e}"
                            )
                        });
                }
            }
        }
    }

    // --- Ambient creatures (fireflies, butterflies) ---
    // Group by npc_ref
    let mut ambient_groups: std::collections::HashMap<&str, Vec<CreatureSnapshot>> =
        std::collections::HashMap::new();
    for (cr, marker, cid) in &ambient_q {
        if cr.state != bevy_kbve_net::creatures::types::CreatureState::Active {
            continue;
        }
        let near_player = player_positions.0.iter().any(|p| {
            let dx = cr.anchor.x - p.x;
            let dz = cr.anchor.z - p.z;
            dx * dx + dz * dz <= sync_radius_sq
        });
        if !near_player {
            continue;
        }
        ambient_groups
            .entry(marker.type_key)
            .or_default()
            .push(CreatureSnapshot {
                creature_id: cid.as_u128(),
                x: cr.anchor.x,
                y: cr.anchor.y,
                z: cr.anchor.z,
                hop_state: 0,
                patrol_step: 0,
                facing_left: false,
            });
    }
    for (npc_ref, snapshots) in ambient_groups {
        let msg = CreaturePositionSync {
            npc_ref: npc_ref.to_string(),
            snapshots,
        };
        if legacy.is_legacy() {
            for mut sender in &mut legacy_senders {
                sender.send::<CreatureSyncChannel>(msg.clone());
            }
        } else {
            for server in &servers {
                let _ = multi
                    .send::<CreaturePositionSync, CreatureSyncChannel>(
                        &msg,
                        server,
                        &NetworkTarget::All,
                    )
                    .inspect_err(|e| {
                        tracing::error!(
                            "[gameserver] CreaturePositionSync (ambient) broadcast failed: {e}"
                        )
                    });
            }
        }
    }
}

/// Every 5 seconds, broadcast the canonical game time to all connected clients.
fn broadcast_time_sync(
    time: Res<Time>,
    mut timer: ResMut<TimeSyncTimer>,
    day: Res<DayCycle>,
    seed: Res<CreatureSeed>,
    wind: Res<WindState>,
    legacy: Res<LegacyBroadcastFlag>,
    mut multi: ServerMultiMessageSender<With<Connected>>,
    servers: Query<&Server>,
    mut legacy_senders: Query<&mut MessageSender<TimeSyncMessage>, With<Connected>>,
) {
    timer.0.tick(time.delta());
    if !timer.0.just_finished() {
        return;
    }

    let msg = TimeSyncMessage {
        game_hour: day.hour,
        day_speed: day.speed,
        creature_seed: seed.0,
        wind_speed_mph: wind.speed_mph,
        wind_direction: wind.direction,
    };

    if legacy.is_legacy() {
        for mut sender in &mut legacy_senders {
            sender.send::<TimeChannel>(msg.clone());
        }
    } else {
        // Single serialize, multi-fan-out — was 1 clone per connected client every 5s.
        for server in &servers {
            let _ = multi
                .send::<TimeSyncMessage, TimeChannel>(&msg, server, &NetworkTarget::All)
                .inspect_err(|e| {
                    tracing::error!("[gameserver] TimeSyncMessage broadcast failed: {e}")
                });
        }
    }
}

/// Immediately send the current time sync to newly authenticated clients
/// so they don't have to wait up to 5 seconds for the first broadcast.
fn send_time_sync_to_new_clients(
    day: Res<DayCycle>,
    seed: Res<CreatureSeed>,
    wind: Res<WindState>,
    mut senders: Query<(Entity, &mut MessageSender<TimeSyncMessage>), With<NeedsWorldSync>>,
) {
    for (entity, mut sender) in &mut senders {
        let msg = TimeSyncMessage {
            game_hour: day.hour,
            day_speed: day.speed,
            creature_seed: seed.0,
            wind_speed_mph: wind.speed_mph,
            wind_direction: wind.direction,
        };

        sender.send::<TimeChannel>(msg);
        tracing::info!(
            "[gameserver] sent initial time sync to new client {entity:?} (hour={:.1})",
            day.hour
        );
    }
}

/// When a new client authenticates, send them all currently captured creatures
/// in a single batch so they know which ones are unavailable.
///
/// Replaces N per-creature `CreatureCaptured` sends with one
/// `CreatureCapturedBatch`, dropping join-time message volume from
/// O(captured) to O(1) per joining client.
fn send_captured_state_to_new_clients(
    capture_log: Res<CapturedCreatureLog>,
    mut senders: Query<(Entity, &mut MessageSender<CreatureCapturedBatch>), With<NeedsWorldSync>>,
) {
    if capture_log.0.is_empty() {
        return;
    }

    for (entity, mut sender) in &mut senders {
        tracing::info!(
            "[gameserver] sending {} captured creatures (batched) to new client {entity:?}",
            capture_log.0.len()
        );

        sender.send::<GameChannel>(CreatureCapturedBatch {
            entries: capture_log.0.clone(),
        });
    }
}

// ---------------------------------------------------------------------------
// PendingAuth timeout
// ---------------------------------------------------------------------------

/// Maximum seconds a client can remain in PendingAuth before being disconnected.
const PENDING_AUTH_TIMEOUT_SECS: f32 = 10.0;

/// Timestamp when a client connected (for PendingAuth timeout).
#[derive(Component)]
struct ConnectedAt(f32);

/// Despawn clients that have been pending auth for too long.
fn timeout_pending_auth(
    mut commands: Commands,
    time: Res<Time>,
    query: Query<(Entity, &ConnectedAt), With<PendingAuth>>,
) {
    let now = time.elapsed_secs();
    for (entity, connected_at) in &query {
        if now - connected_at.0 > PENDING_AUTH_TIMEOUT_SECS {
            tracing::warn!(
                "[gameserver] client {entity:?} timed out waiting for auth — disconnecting"
            );
            commands.entity(entity).despawn();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::LegacyBroadcastFlag;

    /// `LegacyBroadcastFlag` defaults to the optimized path.
    #[test]
    fn legacy_flag_default_is_optimized() {
        let flag = LegacyBroadcastFlag::default();
        assert!(
            !flag.is_legacy(),
            "Default must be the optimized broadcast path"
        );
    }

    /// `LegacyBroadcastFlag::from_env` parses truthy values consistently.
    ///
    /// This test mutates the process-wide `KBVE_LEGACY_BROADCAST` env var
    /// inside a single test fn so set/clear pairs stay ordered. Other tests
    /// in this crate must not read the same var.
    #[test]
    fn legacy_flag_env_parsing() {
        // SAFETY: tests in this fn drive a single env var serially. No other
        // test reads `KBVE_LEGACY_BROADCAST`.
        for (val, expected) in [
            ("1", true),
            ("true", true),
            ("TRUE", true),
            ("yes", true),
            ("YES", true),
            ("0", false),
            ("false", false),
            ("anything-else", false),
        ] {
            // SAFETY: serial within this test; no concurrent readers.
            unsafe {
                std::env::set_var("KBVE_LEGACY_BROADCAST", val);
            }
            assert_eq!(
                LegacyBroadcastFlag::from_env().is_legacy(),
                expected,
                "KBVE_LEGACY_BROADCAST={val} should produce is_legacy={expected}"
            );
        }
        // SAFETY: cleanup, serial within this test.
        unsafe {
            std::env::remove_var("KBVE_LEGACY_BROADCAST");
        }
        assert!(
            !LegacyBroadcastFlag::from_env().is_legacy(),
            "Unset → false"
        );
    }
}
