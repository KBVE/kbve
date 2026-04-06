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
use bevy::prelude::*;
use lightyear::prelude::server::*;
use lightyear::prelude::*;

use bevy_kbve_net::npcdb::{self, CreatureRegistry, ProtoNpcId, creature::CapturedCreatures};
use bevy_kbve_net::{
    AuthAck, AuthMessage, AuthResponse, CollectRequest, CreatureCaptureRequest, CreatureCaptured,
    CreatureKind, CreaturePositionSync, CreatureSnapshot, CreatureSyncChannel, DamageEvent,
    GameChannel, ObjectRemoved, ObjectRespawned, PlayerName, PositionUpdate, ProtocolPlugin,
    SetUsernameRequest, SetUsernameResponse, TileKey, TimeChannel, TimeSyncMessage,
};

/// Server tick rate: 20 Hz (matching client).
const TICK_DURATION: Duration = Duration::from_millis(50);

/// Replication send interval — how often the server sends entity updates.
const REPLICATION_SEND_INTERVAL: Duration = Duration::from_millis(100);

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

/// Marker: client has not yet sent a valid AuthMessage.
#[derive(Component)]
struct PendingAuth;

/// Marker: client authenticated but hasn't completed the 4-step handshake.
/// Stores the server_time challenge that the client must echo back in AuthAck.
#[derive(Component)]
struct PendingAck {
    server_time: u64,
}

/// How long (in seconds) before a collected object respawns.
const RESPAWN_COOLDOWN_SECS: f64 = 300.0; // 5 minutes

/// Maximum distance (world units) a player can be from an object to collect it.
const MAX_COLLECT_DISTANCE: f32 = 3.0;

/// Tracks collected world objects with the time they were collected.
/// When enough time passes, the object respawns (entry removed).
#[derive(Resource, Default)]
struct CollectedObjects(HashMap<TileKey, f64>);

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
        Self(0x4B_BE_F0_2026)
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
fn creature_kind_to_npc_ref(kind: CreatureKind) -> &'static str {
    match kind {
        CreatureKind::Firefly => "meadow-firefly",
        CreatureKind::Butterfly => "woodland-butterfly",
        CreatureKind::Frog => "green-toad",
    }
}

/// Map a protocol `CreatureKind` to a `ProtoNpcId`.
fn creature_kind_to_npc_id(kind: CreatureKind) -> ProtoNpcId {
    ProtoNpcId::from_ref(creature_kind_to_npc_ref(kind))
}

/// Map a `ProtoNpcId` back to a protocol `CreatureKind` (for wire messages).
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
                let username = if let Some(svc) = profile_service {
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

                let _ = tx.send(ProfileResponse::SetUsernameResult {
                    client_entity,
                    player_entity,
                    success,
                    username: canonical,
                    error,
                });
            }
        }
    }
    tracing::info!("[profile_bridge] bridge task exiting");
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
    app.add_plugins(MinimalPlugins);
    app.add_plugins(bevy::transform::TransformPlugin::default());

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
    app.init_resource::<CollectedObjects>();
    app.init_resource::<DayCycle>();
    app.init_resource::<CreatureSeed>();
    app.init_resource::<WindState>();
    app.init_resource::<CapturedCreatures>();
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
    if let Some(identity) = wt_identity {
        app.insert_resource(PendingWtIdentity(Some(identity)));
    } else {
        app.insert_resource(PendingWtIdentity(None));
    }
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

    // Debug observers for connection lifecycle
    app.add_observer(on_server_connecting);
    app.add_observer(on_server_connected);
    app.add_observer(on_server_disconnected);

    // Debug observers for link/transport lifecycle — traces the path from
    // WebSocket accept → per-client Link → Linked → Netcode processing
    app.add_observer(debug_on_linking_added);
    app.add_observer(debug_on_linked_added);
    app.add_observer(debug_on_unlinked_added);

    // Diagnostic: track LinkOf creation and Session addition
    app.add_observer(|trigger: On<Add, LinkOf>| {
        let entity = trigger.entity;
        tracing::info!("[diag] LinkOf ADDED on entity {entity:?}");
    });
    // aeronet_io::Session observer removed — crate not a direct dependency.
    // Session tracking is handled internally by lightyear.
    app.add_observer(|trigger: On<Add, ReplicationSender>| {
        let entity = trigger.entity;
        tracing::info!("[diag] ReplicationSender ADDED on entity {entity:?}");
    });

    // Diagnostic: log Link buffer states every tick to trace packet flow
    app.add_systems(Update, debug_link_packet_flow);
    // Diagnostic: log ALL Link entities (even orphaned ones not in Server collection)
    app.add_systems(Update, debug_all_links);

    // Process auth messages from clients (steps 2-3 of handshake)
    app.add_systems(Update, process_auth_messages);
    // Verify AuthAck echo (step 4 of handshake)
    app.add_systems(Update, verify_auth_ack);

    // Receive position updates from clients and apply to their player entities
    app.add_systems(Update, process_position_updates);

    // Process damage events from clients
    app.add_systems(Update, process_damage_events);

    // Process collect requests from clients
    app.add_systems(Update, process_collect_requests);

    // Tick respawn timer for collected objects
    app.add_systems(Update, tick_respawns);

    // Send collected objects state to newly connected clients
    app.add_systems(Update, send_collected_state_to_new_clients);

    // Process profile bridge responses (username lookups, set-username results)
    app.add_systems(Update, process_profile_responses);

    // Process set-username requests from clients
    app.add_systems(Update, process_set_username_requests);

    // Advance server day/night cycle
    app.add_systems(Update, update_server_day_cycle);

    // Broadcast time sync to all connected clients periodically
    app.add_systems(Update, broadcast_time_sync);

    // Send time sync immediately to newly authenticated clients
    app.add_systems(Update, send_time_sync_to_new_clients);

    // Process creature capture requests from clients
    app.add_systems(Update, process_creature_captures);

    // Send captured creatures state to newly connected clients
    app.add_systems(Update, send_captured_state_to_new_clients);

    // --- Server creature simulation (same logic as client) ---
    app.add_systems(Update, sync_creature_game_time);
    app.add_systems(Update, update_server_player_positions);
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

    // Periodic debug heartbeat
    app.add_systems(Update, server_debug_heartbeat);
    app.add_systems(Update, server_debug_link_buffers);
    app.add_systems(Update, server_debug_netcode_collection);

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
fn on_server_disconnected(
    trigger: On<Add, Disconnected>,
    mut commands: Commands,
    mut authenticated: ResMut<AuthenticatedClients>,
    mut client_player_map: ResMut<ClientPlayerMap>,
) {
    let client_entity = trigger.entity;
    let user_id = authenticated.0.remove(&client_entity);
    let player_entity = client_player_map.0.remove(&client_entity);

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
    commands.entity(link_entity).insert(ReplicationSender::new(
        REPLICATION_SEND_INTERVAL,
        SendUpdatesMode::SinceLastAck,
        false,
    ));
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
        ReplicationSender::new(
            REPLICATION_SEND_INTERVAL,
            SendUpdatesMode::SinceLastAck,
            false,
        ),
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
    for (entity, mut receiver, mut sender) in &mut query {
        for msg in receiver.receive() {
            let server_time = game_time_challenge(&day);

            // --- Guest path: empty JWT → anonymous session ---
            if msg.jwt.is_empty() || msg.jwt.trim().is_empty() {
                let guest_idx = PLAYER_COUNTER.load(std::sync::atomic::Ordering::Relaxed);
                let guest_user_id = format!("guest_{guest_idx}");
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
                let anon_idx = PLAYER_COUNTER.load(std::sync::atomic::Ordering::Relaxed);
                let anon_user_id = format!("anon_{anon_idx}");
                tracing::warn!(
                    "SUPABASE_JWT_SECRET not set — accepting {entity:?} as {anon_user_id} (challenge={server_time})"
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

            match crate::auth::validate_token(&msg.jwt, &jwt_secret.0) {
                Ok(token_data) => {
                    let user_id = token_data.claims.sub.clone();
                    tracing::info!(
                        "client {entity:?} authenticated as user {user_id} (challenge={server_time})"
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

                    let _ = profile_tx.0.send(ProfileRequest::LookupUsername {
                        player_entity,
                        user_id,
                    });
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
                commands.entity(entity).remove::<PendingAck>();
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
            // Target a specific server entity — avoids .single() failure when
            // multiple Server entities exist (WS + WT).
            Replicate::new(lightyear::prelude::ReplicationMode::Server(
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
fn process_collect_requests(
    time: Res<Time>,
    client_player_map: Res<ClientPlayerMap>,
    mut collected: ResMut<CollectedObjects>,
    mut receivers: Query<(Entity, &mut MessageReceiver<CollectRequest>), Without<PendingAuth>>,
    positions: Query<&Position>,
    player_ids: Query<&bevy_kbve_net::PlayerId>,
    mut senders: Query<&mut MessageSender<ObjectRemoved>, With<Connected>>,
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

            // Track the collection with current elapsed time
            collected.0.insert(tile, time.elapsed_secs_f64());
            tracing::info!(
                "[gameserver] object collected: {kind:?} at ({},{})",
                tile.tx,
                tile.tz
            );

            // Broadcast ObjectRemoved to all connected clients
            let collector_id = client_player_map
                .0
                .get(&client_entity)
                .and_then(|&pe| player_ids.get(pe).ok())
                .map(|pid| pid.0)
                .unwrap_or(0);
            let removal = ObjectRemoved {
                tile,
                kind,
                collector_id,
            };
            for mut sender in &mut senders {
                sender.send::<bevy_kbve_net::GameChannel>(removal.clone());
            }
        }
    }
}

/// Periodically check for collected objects whose respawn cooldown has elapsed.
fn tick_respawns(
    time: Res<Time>,
    mut collected: ResMut<CollectedObjects>,
    mut senders: Query<&mut MessageSender<ObjectRespawned>, With<Connected>>,
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
            for mut sender in &mut senders {
                sender.send::<bevy_kbve_net::GameChannel>(msg.clone());
            }
        }
    }
}

/// Process creature capture requests: validate against CreatureRegistry, track, broadcast.
fn process_creature_captures(
    registry: Res<CreatureRegistry>,
    client_player_map: Res<ClientPlayerMap>,
    mut captured: ResMut<CapturedCreatures>,
    mut receivers: Query<
        (Entity, &mut MessageReceiver<CreatureCaptureRequest>),
        Without<PendingAuth>,
    >,
    player_ids: Query<&bevy_kbve_net::PlayerId>,
    mut senders: Query<&mut MessageSender<CreatureCaptured>, With<Connected>>,
) {
    for (client_entity, mut receiver) in &mut receivers {
        for msg in receiver.receive() {
            let npc_id = creature_kind_to_npc_id(msg.kind);

            // Already captured?
            if captured.is_captured(npc_id, msg.creature_index) {
                tracing::warn!(
                    "[gameserver] creature {:?} #{} already captured — ignoring",
                    msg.kind,
                    msg.creature_index
                );
                continue;
            }

            // Validate creature_index against registry pool_size
            let npc_ref = creature_kind_to_npc_ref(msg.kind);
            if let Some(config) = registry.config_by_ref(npc_ref) {
                if msg.creature_index as usize >= config.pool_size {
                    tracing::warn!(
                        "[gameserver] invalid creature_index {} for {:?} (pool_size={})",
                        msg.creature_index,
                        msg.kind,
                        config.pool_size
                    );
                    continue;
                }
            } else {
                tracing::warn!(
                    "[gameserver] unknown creature ref '{npc_ref}' for {:?}",
                    msg.kind
                );
                continue;
            }

            // Track the capture
            captured.insert(npc_id, msg.creature_index);

            let captor_id = client_player_map
                .0
                .get(&client_entity)
                .and_then(|&pe| player_ids.get(pe).ok())
                .map(|pid| pid.0)
                .unwrap_or(0);

            tracing::info!(
                "[gameserver] creature captured: {:?} #{} by player {captor_id}",
                msg.kind,
                msg.creature_index
            );

            // Broadcast to all connected clients
            let broadcast = CreatureCaptured {
                kind: msg.kind,
                creature_index: msg.creature_index,
                captor_player_id: captor_id,
            };
            for mut sender in &mut senders {
                sender.send::<GameChannel>(broadcast.clone());
            }
        }
    }
}

/// When a new client authenticates, send them all currently collected objects
/// so they know which ones to skip when loading chunks.
fn send_collected_state_to_new_clients(
    authenticated: Res<AuthenticatedClients>,
    collected: Res<CollectedObjects>,
    mut senders: Query<(Entity, &mut MessageSender<ObjectRemoved>), Added<ReplicationSender>>,
) {
    if collected.0.is_empty() {
        return;
    }

    for (entity, mut sender) in &mut senders {
        if !authenticated.0.contains_key(&entity) {
            continue;
        }

        tracing::info!(
            "[gameserver] sending {} collected objects to new client {entity:?}",
            collected.0.len()
        );

        for &tile in collected.0.keys() {
            if let Some(kind) = bevy_kbve_net::object_at_tile(tile.tx, tile.tz) {
                // collector_id=0 for catch-up messages — new client just skips spawning,
                // no loot is granted.
                sender.send::<bevy_kbve_net::GameChannel>(ObjectRemoved {
                    tile,
                    kind,
                    collector_id: 0,
                });
            }
        }
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

/// Process SetUsernameRequest messages from clients.
fn process_set_username_requests(
    client_player_map: Res<ClientPlayerMap>,
    authenticated: Res<AuthenticatedClients>,
    profile_tx: Res<ProfileBridgeTx>,
    mut receivers: Query<(Entity, &mut MessageReceiver<SetUsernameRequest>), Without<PendingAuth>>,
) {
    for (client_entity, mut receiver) in &mut receivers {
        for msg in receiver.receive() {
            let Some(&player_entity) = client_player_map.0.get(&client_entity) else {
                continue;
            };
            let Some(user_id) = authenticated.0.get(&client_entity) else {
                continue;
            };

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
        &bevy_kbve_net::creatures::types::CreaturePoolIndex,
        &bevy_kbve_net::creatures::types::SpriteCreatureMarker,
        &bevy_kbve_net::creatures::types::CreatureId,
    )>,
    ambient_q: Query<(
        &bevy_kbve_net::creatures::types::Creature,
        &bevy_kbve_net::creatures::types::CreaturePoolIndex,
        &bevy_kbve_net::creatures::ambient_types::AmbientCreatureMarker,
        &bevy_kbve_net::creatures::types::CreatureId,
    )>,
    types: Res<bevy_kbve_net::creatures::types::SpriteCreatureTypes>,
    player_positions: Res<bevy_kbve_net::creatures::types::PlayerPositions>,
    mut senders: Query<&mut MessageSender<CreaturePositionSync>, With<Connected>>,
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
        for (cr, sd, pool_idx, marker, cid) in &creature_q {
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
                index: pool_idx.0 as u32,
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
            for mut sender in &mut senders {
                sender.send::<CreatureSyncChannel>(msg.clone());
            }
        }
    }

    // --- Ambient creatures (fireflies, butterflies) ---
    // Group by npc_ref
    let mut ambient_groups: std::collections::HashMap<&str, Vec<CreatureSnapshot>> =
        std::collections::HashMap::new();
    for (cr, pool_idx, marker, cid) in &ambient_q {
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
                index: pool_idx.0 as u32,
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
        for mut sender in &mut senders {
            sender.send::<CreatureSyncChannel>(msg.clone());
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
    mut senders: Query<&mut MessageSender<TimeSyncMessage>, With<Connected>>,
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

    for mut sender in &mut senders {
        sender.send::<TimeChannel>(msg.clone());
    }
}

/// Immediately send the current time sync to newly authenticated clients
/// so they don't have to wait up to 5 seconds for the first broadcast.
fn send_time_sync_to_new_clients(
    authenticated: Res<AuthenticatedClients>,
    day: Res<DayCycle>,
    seed: Res<CreatureSeed>,
    wind: Res<WindState>,
    mut senders: Query<(Entity, &mut MessageSender<TimeSyncMessage>), Added<ReplicationSender>>,
) {
    for (entity, mut sender) in &mut senders {
        if !authenticated.0.contains_key(&entity) {
            continue;
        }

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
/// so they know which ones are unavailable.
fn send_captured_state_to_new_clients(
    authenticated: Res<AuthenticatedClients>,
    captured: Res<CapturedCreatures>,
    mut senders: Query<(Entity, &mut MessageSender<CreatureCaptured>), Added<ReplicationSender>>,
) {
    if captured.is_empty() {
        return;
    }

    for (entity, mut sender) in &mut senders {
        if !authenticated.0.contains_key(&entity) {
            continue;
        }

        tracing::info!(
            "[gameserver] sending {} captured creatures to new client {entity:?}",
            captured.len()
        );

        for &(npc_id, creature_index) in captured.iter() {
            let Some(kind) = npc_id_to_creature_kind(npc_id) else {
                continue;
            };
            sender.send::<GameChannel>(CreatureCaptured {
                kind,
                creature_index,
                captor_player_id: 0,
            });
        }
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
