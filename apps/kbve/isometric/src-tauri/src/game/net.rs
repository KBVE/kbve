//! Lightyear client-side networking plugin.
//!
//! Adds `ClientPlugins` (lightyear transport + replication) and the shared
//! `ProtocolPlugin` so the game can connect to the authoritative server.
//!
//! Connection is NOT established automatically — the player triggers it
//! via the "Go Online" UI button, which calls the `go_online` WASM export.

use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use avian3d::prelude::*;
use bevy::prelude::*;
use lightyear::netcode::ConnectToken;
use lightyear::prelude::client::*;
use lightyear::prelude::*;

use bevy_kbve_net::{
    AuthAck, AuthMessage, AuthResponse, CollectRequest, CreatureCaptureRequest, CreatureCaptured,
    CreatureKind, DamageEvent, DamageSource, GameChannel, ObjectRemoved, ObjectRespawned,
    PlayerColor, PlayerId, PlayerName, PlayerVitals, PositionUpdate, ProtocolPlugin,
    SetUsernameRequest, SetUsernameResponse, TileKey, TimeSyncMessage,
};

use super::actions::{ChoppingTree, CollectingForageable, MiningRock};
use super::creatures::{Creature, CreaturePoolIndex, CreatureState, RenderKind};
use super::inventory::{ITEM_LOG, ITEM_PORCINI, ITEM_STONE, ITEM_WILDFLOWER, ItemKind, LootEvent};
use super::player::{FallDamageEvent, Player};
use super::scene_objects::CollectEvent;
use super::state::PlayerState;
use super::tilemap::{CollectedTiles, TileCoord};
use bevy_kbve_net::npcdb::ProtoNpcId;
use bevy_kbve_net::npcdb::creature::CapturedCreatures;

/// Default WebSocket URL — only set for native (desktop) dev builds.
/// On WASM the URL MUST come from JS via `request_go_online()`.
#[cfg(not(target_arch = "wasm32"))]
const DEFAULT_WS_URL: &str = "wss://127.0.0.1:5000";

/// Tick rate matching the server (20 Hz).
const TICK_DURATION: Duration = Duration::from_millis(50);

/// Atomic flag set by JS `go_online()` call, consumed by Bevy system.
static GO_ONLINE_REQUESTED: AtomicBool = AtomicBool::new(false);

/// Optional WebSocket URL override from JS (e.g. "wss://kbve.com/ws").
static SERVER_URL_OVERRIDE: Mutex<Option<String>> = Mutex::new(None);

/// JWT token passed from JS for server authentication.
static AUTH_JWT: Mutex<Option<String>> = Mutex::new(None);

/// Atomic flag indicating whether we are currently connected.
static IS_CONNECTED: AtomicBool = AtomicBool::new(false);

/// Pending token fetch result from async WASM HTTP request.
static PENDING_TOKEN_RESULT: Mutex<Option<TokenFetchResult>> = Mutex::new(None);

/// Pending set-username request from JS, consumed by Bevy system.
static SET_USERNAME_REQUEST: Mutex<Option<String>> = Mutex::new(None);

/// Called from JS/WASM to request setting a username.
pub fn request_set_username(username: &str) {
    if let Ok(mut guard) = SET_USERNAME_REQUEST.lock() {
        *guard = Some(username.to_owned());
    }
}

/// Marker component for the floating name label above a player.
#[derive(Component)]
struct PlayerNameLabel;

/// Called from JS/WASM to request a connection to the game server.
/// `server_url` can be empty to use the default, or a full WebSocket URL
/// (e.g. "wss://kbve.com/ws").
/// `jwt` is the Supabase access token for authentication.
pub fn request_go_online(server_url: &str, jwt: &str) {
    if !server_url.is_empty() {
        if let Ok(mut guard) = SERVER_URL_OVERRIDE.lock() {
            *guard = Some(server_url.to_owned());
        }
    }
    if !jwt.is_empty() {
        if let Ok(mut guard) = AUTH_JWT.lock() {
            *guard = Some(jwt.to_owned());
        }
    }
    GO_ONLINE_REQUESTED.store(true, Ordering::Release);
}

/// Returns whether the client is currently connected to a game server.
pub fn is_online() -> bool {
    IS_CONNECTED.load(Ordering::Relaxed)
}

/// Bevy resource holding the resolved game server WebSocket URL.
#[derive(Resource)]
pub struct GameServerAddr(pub String);

impl Default for GameServerAddr {
    fn default() -> Self {
        let url = SERVER_URL_OVERRIDE
            .lock()
            .ok()
            .and_then(|g| g.clone())
            .or_else(|| std::env::var("GAME_SERVER_URL").ok())
            .unwrap_or_else(|| {
                #[cfg(not(target_arch = "wasm32"))]
                {
                    DEFAULT_WS_URL.to_owned()
                }
                #[cfg(target_arch = "wasm32")]
                {
                    // On WASM, endpoints come from ClientProfile (localStorage).
                    // Return empty — poll_go_online_request will read from profile.
                    String::new()
                }
            });
        Self(url)
    }
}

/// Tracks pending JWT that needs to be sent after connection is established.
#[derive(Resource, Default)]
struct PendingAuth {
    jwt: Option<String>,
    sent: bool,
}

/// Stores the local player's server-assigned player ID so we can distinguish
/// our own replicated entity from remote players.
#[derive(Resource, Default)]
struct MyPlayerId(Option<u64>);

/// Marker component for remote player entities (replicated from server).
#[derive(Component)]
struct RemotePlayer;

/// Marker for our own replicated entity so we don't re-process it every frame.
#[derive(Component)]
struct OwnReplicatedPlayer;

/// Server-authoritative time received via TimeSyncMessage.
/// When present and `active` is true, weather.rs defers to this instead of local DayCycle.
#[derive(Resource)]
pub struct ServerTime {
    pub game_hour: f32,
    pub day_speed: f32,
    pub creature_seed: u64,
    pub wind_speed_mph: f32,
    pub wind_direction: (f32, f32),
    /// True once we've received at least one sync from the server.
    pub active: bool,
}

impl Default for ServerTime {
    fn default() -> Self {
        Self {
            game_hour: 10.0,
            day_speed: 1.0 / 60.0,
            creature_seed: 0,
            wind_speed_mph: 5.0,
            wind_direction: (0.7, 0.7),
            active: false,
        }
    }
}

/// Result of an async token fetch (WASM path).
struct TokenFetchResult {
    token_bytes: [u8; 2048],
    server_url: String,
    /// WebTransport URL (empty if server doesn't offer WT).
    server_wt_url: String,
    /// SHA-256 cert digest for self-signed WebTransport certs.
    cert_digest: String,
    /// "trusted" or "self-signed" — controls whether hash pinning is used.
    cert_type: String,
}

/// Resource tracking whether a WASM token fetch is in flight.
#[derive(Resource, Default)]
struct PendingTokenFetch {
    in_flight: bool,
}

/// Attached to a WebTransport client entity so that if the WT link fails
/// before the netcode handshake completes, `on_unlinked` can swap the
/// transport IO component to WebSocket on the **same entity** instead of
/// tearing everything down and respawning.
#[derive(Component)]
struct WsFallback {
    /// WebSocket URL to fall back to.
    ws_url: String,
    /// Token bytes for creating a new NetcodeClient on the fresh WS entity.
    token_bytes: [u8; 2048],
}

/// Marker inserted by `on_unlinked` when a WT→WS transport swap is needed.
/// `on_disconnected` checks for this marker and performs the swap instead of
/// the normal cleanup / title-screen return.
#[derive(Component)]
struct TransportSwapPending;

pub struct NetPlugin;

impl Plugin for NetPlugin {
    fn build(&self, app: &mut App) {
        info!("[net] NetPlugin::build — registering lightyear client plugins");

        // Read browser capabilities probed by JS (localStorage).
        // Must be inserted before any system that checks transport support.
        let profile = super::client_profile::ClientProfile::from_local_storage();
        info!(
            "[net] ClientProfile: secure={} wt={} sab={} cores={} api={} ws={} wt_url={}",
            profile.secure_context,
            profile.has_webtransport,
            profile.has_shared_array_buffer,
            profile.hardware_concurrency,
            profile.api_base,
            profile.ws_url,
            profile.wt_url,
        );
        app.insert_resource(profile);

        // Lightyear client transport + replication machinery
        app.add_plugins(ClientPlugins {
            tick_duration: TICK_DURATION,
        });

        // Shared protocol: replicated components, inputs, channels
        app.add_plugins(ProtocolPlugin);

        // Store resolved server address
        app.init_resource::<GameServerAddr>();
        app.init_resource::<PendingAuth>();
        app.init_resource::<MyPlayerId>();
        app.init_resource::<ServerTime>();
        app.init_resource::<CapturedCreatures>();
        app.init_resource::<PendingTokenFetch>();

        // Watch for go-online requests from JS / poll async token results
        app.add_systems(Update, poll_go_online_request);
        app.add_systems(Update, poll_token_fetch_result);

        // Send auth message once connected
        app.add_systems(Update, send_auth_on_connect.after(poll_go_online_request));

        // Receive auth response from server
        app.add_systems(Update, receive_auth_response.after(send_auth_on_connect));

        // Send local player position to server (throttled to FixedUpdate = tick rate)
        app.add_systems(FixedUpdate, send_position_updates);

        // Spawn visuals for remote players when their replicated entities arrive.
        // Must run after receive_auth_response so we know our own player ID and
        // don't accidentally spawn a ghost visual for ourselves.
        app.add_systems(
            Update,
            spawn_remote_player_visuals.after(receive_auth_response),
        );

        // Update remote player transforms from replicated Position each frame
        app.add_systems(
            PostUpdate,
            update_remote_transforms.run_if(any_with_component::<RemotePlayer>),
        );

        // Sync replicated PlayerVitals from our own player entity into local PlayerState
        app.add_systems(Update, sync_vitals_to_local_state);

        // Receive ObjectRemoved / ObjectRespawned messages from server
        app.add_systems(Update, receive_object_removed);
        app.add_systems(Update, receive_object_respawned);

        // Receive time sync from server
        app.add_systems(Update, receive_time_sync);

        // Receive creature capture broadcasts from server
        app.add_systems(Update, receive_creature_captured);

        // Username display systems
        app.add_systems(
            Update,
            update_player_name_labels.run_if(any_with_component::<PlayerNameLabel>),
        );
        app.add_systems(
            Update,
            billboard_name_labels.run_if(any_with_component::<PlayerNameLabel>),
        );
        app.add_systems(Update, poll_set_username_request);
        app.add_systems(Update, receive_set_username_response);

        // Immediately hide any replicated entity with PlayerId — prevents
        // ghost flicker before spawn_remote_player_visuals decides visibility.
        app.add_observer(hide_new_replicated_player);

        // Forward fall damage / collect / capture events to server via observers
        app.add_observer(forward_fall_damage_to_server);
        app.add_observer(forward_collect_to_server);
        app.add_observer(forward_creature_capture_to_server);

        // --- Debug observers for connection lifecycle ---
        app.add_observer(on_connecting);
        app.add_observer(on_connected);
        app.add_observer(on_disconnected);
        app.add_observer(on_linking);
        app.add_observer(on_unlinked);

        // WASM: use hostname URL for WebTransport (cert validation needs hostname, not IP)
        #[cfg(target_arch = "wasm32")]
        app.add_observer(bevy_kbve_net::client::wasm_wt_hostname_link);

        // WASM: custom WebSocket transport systems (bypasses aeronet's broken send_loop)
        #[cfg(target_arch = "wasm32")]
        {
            use bevy_kbve_net::wasm_ws;
            app.add_systems(
                PreUpdate,
                wasm_ws::wasm_ws_recv.in_set(lightyear::prelude::LinkSystems::Receive),
            );
            app.add_systems(
                PostUpdate,
                wasm_ws::wasm_ws_send.in_set(lightyear::prelude::LinkSystems::Send),
            );
            app.add_systems(Update, wasm_ws::wasm_ws_lifecycle);
        }

        // Safety net: abort if the handshake doesn't complete within HANDSHAKE_TIMEOUT_SECS
        app.add_systems(Update, check_handshake_timeout);

        // Periodic connection-state heartbeat + PostUpdate netcode diagnostic
        // disabled for now — too noisy. Re-enable by uncommenting:
        // app.add_systems(Update, debug_connection_heartbeat);
        // app.add_systems(
        //     PostUpdate,
        //     debug_post_netcode_send
        //         .after(lightyear::prelude::ConnectionSystems::Send)
        //         .before(lightyear::prelude::LinkSystems::Send),
        // );

        // Deferred cleanup of disconnected client entities (one frame delay)
        app.add_systems(Last, cleanup_pending_despawn);

        info!("[net] NetPlugin::build — all systems registered");
    }
}

/// Debug: link layer — Linking added (WebSocket connection attempt started).
fn on_linking(trigger: On<Add, lightyear::prelude::Linking>) {
    let entity = trigger.entity;
    info!("[net][link] LINKING — entity {entity:?} transport connection starting");
}

/// Link layer — Unlinked added (transport failed or closed).
/// If the entity carries a `WsFallback` component (WebTransport was attempted
/// and a WebSocket URL is available), mark it for an in-place transport swap.
/// Lightyear will automatically add `Disconnected` next, and our
/// `on_disconnected` observer will perform the actual swap.
fn on_unlinked(
    trigger: On<Add, lightyear::prelude::Unlinked>,
    mut commands: Commands,
    was_connected_q: Query<(), With<WasConnected>>,
    fallback_q: Query<(), With<WsFallback>>,
) {
    let entity = trigger.entity;
    warn!("[net][link] UNLINKED — entity {entity:?} transport failed or closed");

    // Only attempt fallback if we never reached Connected and a WsFallback is present.
    if was_connected_q.get(entity).is_err() && fallback_q.get(entity).is_ok() {
        warn!("[net] WebTransport failed — marking entity for WS transport swap");
        super::telemetry::report_warn("WebTransport failed, falling back to WebSocket");
        commands.entity(entity).insert(TransportSwapPending);
    }
}

/// Marker added when a connection attempt begins (Connecting state).
/// Distinguishes "initial spawn Disconnected" from "connection failed Disconnected".
#[derive(Component)]
struct ConnectionAttempted;

/// Tracks when the Connecting state began so we can time out stale handshakes.
/// Stores `Time::elapsed_secs_f64()` instead of `std::time::Instant` because
/// `Instant` panics on `wasm32-unknown-unknown` (no OS clock).
#[derive(Component)]
struct HandshakeStartedAt(f64);

/// Maximum time to wait for the Netcode handshake before aborting.
const HANDSHAKE_TIMEOUT_SECS: f64 = 10.0;

/// Lightyear Connecting added — mark entity so we know a connection was attempted.
fn on_connecting(trigger: On<Add, Connecting>, mut commands: Commands, time: Res<Time>) {
    let entity = trigger.entity;
    commands.entity(entity).insert((
        ConnectionAttempted,
        HandshakeStartedAt(time.elapsed_secs_f64()),
    ));
    info!("[net][lifecycle] CONNECTING — entity {entity:?} lightyear handshake in progress");
}

/// Lightyear Connected added — mark entity so on_disconnected knows this was real.
/// Also strips any leftover fallback components since the connection succeeded.
fn on_connected(trigger: On<Add, Connected>, mut commands: Commands) {
    let entity = trigger.entity;
    commands.entity(entity).insert(WasConnected);
    // Connection succeeded — no need for WS fallback
    commands
        .entity(entity)
        .remove::<(WsFallback, TransportSwapPending)>();
    info!("[net][lifecycle] CONNECTED — entity {entity:?} fully connected!");
}

/// Marker for client entities that should be despawned next frame.
/// We defer despawn by one frame so lightyear's deferred commands (PeerAddr
/// insert, etc.) can flush without panicking on a despawned entity.
#[derive(Component)]
struct PendingDespawn;

/// Marker added after a real connection is established, so we can distinguish
/// "initial Disconnected from #[require]" vs "actual disconnection after being online".
#[derive(Component)]
struct WasConnected;

/// When we lose connection, reset all networking state so the player can reconnect.
/// Remote player entities are despawned since we won't receive further updates.
/// The disconnected Client entity is marked `PendingDespawn` and cleaned up next frame.
///
/// IMPORTANT: `NetcodeClient` has `#[require(Disconnected)]`, so this observer
/// fires on initial spawn too. We skip cleanup if no connection was ever attempted.
fn on_disconnected(
    trigger: On<Add, Disconnected>,
    mut commands: Commands,
    mut my_player_id: ResMut<MyPlayerId>,
    mut pending_auth: ResMut<PendingAuth>,
    mut server_time: ResMut<ServerTime>,
    mut captured_creatures: ResMut<CapturedCreatures>,
    mut next_phase: ResMut<NextState<super::phase::GamePhase>>,
    play_mode: Res<super::phase::PlayMode>,
    remote_players: Query<Entity, With<RemotePlayer>>,
    own_replicated: Query<Entity, With<OwnReplicatedPlayer>>,
    attempted_q: Query<(), With<ConnectionAttempted>>,
    swap_q: Query<&WsFallback, With<TransportSwapPending>>,
) {
    let entity = trigger.entity;

    // NetcodeClient spawns with Disconnected as a required component.
    // Only run cleanup if a connection was actually attempted (Connecting was reached).
    if attempted_q.get(entity).is_err() {
        info!("[net][lifecycle] DISCONNECTED (initial state) — entity {entity:?}, ignoring");
        return;
    }

    // ── WT → WS fallback ───────────────────────────────────────────
    // If on_unlinked marked this entity for a WS fallback, despawn the
    // failed WT entity and spawn a fresh WS connection with a new entity.
    if let Ok(fallback) = swap_q.get(entity) {
        let ws_url = fallback.ws_url.clone();
        let token_bytes = fallback.token_bytes;
        info!("[net] WT failed — despawning {entity:?}, spawning fresh WS to {ws_url}");

        commands.entity(entity).insert(PendingDespawn);

        let transport = ClientTransport::WebSocket { url: ws_url };
        connect_to_server(&mut commands, &transport, &token_bytes);
        super::telemetry::report_warn("WebTransport failed, falling back to WebSocket");
        return;
    }

    // ── Normal disconnect cleanup ────────────────────────────────────
    warn!("[net][lifecycle] DISCONNECTED — entity {entity:?} lost connection");
    super::telemetry::report_warn(&format!("client disconnected entity={entity:?}"));

    // Reset connection state
    IS_CONNECTED.store(false, Ordering::Release);
    my_player_id.0 = None;
    pending_auth.jwt = None;
    pending_auth.sent = false;
    server_time.active = false;
    captured_creatures.clear();

    // Despawn all remote player visuals.
    // Use try_despawn — lightyear may already despawn replicated entities
    // when the connection drops, so the entity could be gone by the time
    // our deferred commands execute.
    let mut count = 0u32;
    for remote_entity in &remote_players {
        commands.entity(remote_entity).try_despawn();
        count += 1;
    }
    if count > 0 {
        info!("[net] despawned {count} remote player entities after disconnect");
    }

    // Despawn our own replicated entity so it doesn't block categorisation
    // of the new replicated entity on reconnect.
    for own_entity in &own_replicated {
        commands.entity(own_entity).try_despawn();
        info!("[net] despawned own replicated entity {own_entity:?} after disconnect");
    }

    // Mark the disconnected Client entity for deferred despawn (next frame).
    // Despawning it immediately inside this observer causes panics because
    // lightyear's deferred commands (PeerAddr insert, etc.) still target it.
    commands.entity(entity).insert(PendingDespawn);
    info!("[net] marked disconnected client entity {entity:?} for deferred despawn");

    // If the player chose "Play Online", return to the title screen on disconnect
    // so they can retry or switch to offline mode.
    if *play_mode == super::phase::PlayMode::Online {
        info!("[net] online mode — returning to title screen after disconnect");
        next_phase.set(super::phase::GamePhase::Title);
    }

    info!("[net] connection state reset — ready for reconnection");
}

/// Safety net: if the Netcode handshake doesn't complete within HANDSHAKE_TIMEOUT_SECS,
/// abort the connection and return to the title screen instead of spinning forever.
fn check_handshake_timeout(
    mut commands: Commands,
    mut next_phase: ResMut<NextState<super::phase::GamePhase>>,
    time: Res<Time>,
    query: Query<(Entity, &HandshakeStartedAt), (With<Connecting>, Without<Connected>)>,
) {
    for (entity, started) in &query {
        let elapsed = time.elapsed_secs_f64() - started.0;
        if elapsed >= HANDSHAKE_TIMEOUT_SECS {
            warn!(
                "[net] handshake timeout after {elapsed:.1}s — aborting connection for entity {entity:?}"
            );
            super::telemetry::report_error(&format!(
                "handshake timeout after {elapsed:.1}s — server did not complete Netcode handshake"
            ));
            commands.entity(entity).insert(PendingDespawn);
            next_phase.set(super::phase::GamePhase::Title);
        }
    }
}

/// Deferred cleanup: despawn entities marked `PendingDespawn` after one frame
/// so lightyear's deferred commands have had time to flush.
fn cleanup_pending_despawn(mut commands: Commands, query: Query<Entity, With<PendingDespawn>>) {
    for entity in &query {
        commands.entity(entity).despawn();
        info!("[net] deferred despawn of client entity {entity:?}");
    }
}

/// Timer resource for throttling heartbeat logs.
#[derive(Resource)]
struct HeartbeatTimer(Timer);

impl Default for HeartbeatTimer {
    fn default() -> Self {
        Self(Timer::from_seconds(2.0, TimerMode::Repeating))
    }
}

/// Periodic system that logs connection state every ~2 seconds for debugging.
fn debug_connection_heartbeat(
    time: Res<Time>,
    mut timer: Local<HeartbeatTimer>,
    connecting_q: Query<Entity, With<Connecting>>,
    connected_q: Query<Entity, With<Connected>>,
    disconnected_q: Query<Entity, With<Disconnected>>,
    link_q: Query<(
        Entity,
        &lightyear::prelude::Link,
        Has<lightyear::prelude::Linked>,
        Has<lightyear::prelude::Linking>,
    )>,
) {
    timer.0.tick(time.delta());
    if !timer.0.just_finished() {
        return;
    }

    let connecting: Vec<_> = connecting_q.iter().collect();
    let connected: Vec<_> = connected_q.iter().collect();
    let disconnected: Vec<_> = disconnected_q.iter().collect();

    if !connecting.is_empty() || !connected.is_empty() || !disconnected.is_empty() {
        info!(
            "[net][heartbeat] connecting={connecting:?} connected={connected:?} disconnected={disconnected:?} is_online={}",
            IS_CONNECTED.load(Ordering::Relaxed)
        );
    }

    // Log link buffer states to diagnose packet flow
    for (entity, link, is_linked, is_linking) in &link_q {
        let send_len = link.send.len();
        let recv_len = link.recv.len();
        if send_len > 0 || recv_len > 0 || is_linked || is_linking {
            info!(
                "[net][heartbeat] link entity={entity:?} send={send_len} recv={recv_len} linked={is_linked} linking={is_linking} link_state={:?}",
                link.state
            );
        }
    }
}

/// PostUpdate diagnostic: logs link.send AFTER netcode writes packets but BEFORE
/// aeronet drains them to the WebSocket. Kept as dead code for future debugging;
/// register in plugin build() when needed.
fn debug_post_netcode_send(
    query: Query<
        (
            Entity,
            &lightyear::prelude::Link,
            &NetcodeClient,
            Has<lightyear::prelude::Linked>,
            Has<Connecting>,
            Has<Disconnected>,
        ),
        Without<Connected>,
    >,
) {
    for (entity, link, client, is_linked, is_connecting, is_disconnected) in &query {
        let send_len = link.send.len();
        let recv_len = link.recv.len();
        let pending = client.inner.is_pending();
        let error = client.inner.is_error();
        if is_connecting || is_linked {
            info!(
                "[net][post-send] entity={entity:?} send={send_len} recv={recv_len} \
                 linked={is_linked} connecting={is_connecting} disconnected={is_disconnected} \
                 netcode_pending={pending} netcode_error={error}"
            );
        }
    }
}

/// Bevy system that checks the atomic flag each frame and initiates token acquisition.
///
/// **Desktop**: generates a token locally (shared dev key, no HTTP roundtrip).
/// **WASM**: fires an async fetch to `/api/v1/auth/game-token`, result polled by `poll_token_fetch_result`.
fn poll_go_online_request(
    mut commands: Commands,
    addr: Res<GameServerAddr>,
    profile: Res<super::client_profile::ClientProfile>,
    mut pending_auth: ResMut<PendingAuth>,
    mut pending_token: ResMut<PendingTokenFetch>,
) {
    if !GO_ONLINE_REQUESTED.swap(false, Ordering::AcqRel) {
        return;
    }

    info!("[net] go-online request detected!");

    if IS_CONNECTED.load(Ordering::Relaxed) {
        info!("[net] already connected — ignoring go-online request");
        return;
    }

    if pending_token.in_flight {
        info!("[net] token fetch already in flight — ignoring duplicate request");
        return;
    }

    // Grab the JWT before connecting
    let jwt = AUTH_JWT.lock().ok().and_then(|mut g| g.take());
    let has_jwt = jwt.is_some();
    pending_auth.jwt = jwt.clone();
    pending_auth.sent = false;

    // Re-resolve address: check JS override first, then resource, then ClientProfile.
    let resolved_ws = SERVER_URL_OVERRIDE
        .lock()
        .ok()
        .and_then(|g| g.clone())
        .or_else(|| {
            let a = &addr.0;
            if a.is_empty() { None } else { Some(a.clone()) }
        })
        .unwrap_or_else(|| {
            // Fallback: read from ClientProfile (JS-resolved endpoints).
            if !profile.ws_url.is_empty() {
                return profile.ws_url.clone();
            }
            #[cfg(not(target_arch = "wasm32"))]
            {
                DEFAULT_WS_URL.to_owned()
            }
            #[cfg(target_arch = "wasm32")]
            {
                String::new()
            }
        });

    info!(
        "[net] resolved server address: {resolved_ws} | has_jwt: {has_jwt} | transport: {}",
        profile.preferred_transport()
    );

    // --- Pre-flight validation (reads ClientProfile, no JS interop) ---
    if resolved_ws.is_empty() {
        warn!("[net] no server URL configured — cannot connect");
        super::telemetry::report_error("go-online failed: no server URL configured");
        return;
    }
    if !resolved_ws.starts_with("ws://") && !resolved_ws.starts_with("wss://") {
        warn!("[net] invalid server URL scheme (expected ws:// or wss://): {resolved_ws}");
        super::telemetry::report_error(&format!(
            "go-online failed: invalid URL scheme: {resolved_ws}"
        ));
        return;
    }
    // Browsers block insecure WebSockets from a secure page (mixed content).
    if resolved_ws.starts_with("ws://") && profile.would_block_insecure_ws() {
        warn!("[net] mixed content blocked: page is HTTPS but server URL is ws:// — use wss://");
        super::telemetry::report_error(
            "go-online failed: mixed content — ws:// from https:// page",
        );
        return;
    }

    // --- Desktop path: generate token locally or fetch from remote ---
    #[cfg(not(target_arch = "wasm32"))]
    {
        use bevy_kbve_net::net_config;

        // Determine if this is a remote server (hostname, not IP:port).
        // Remote servers require fetching the ConnectToken from the API
        // so the embedded addresses match the production topology.
        let stripped = resolved_ws
            .trim_start_matches("ws://")
            .trim_start_matches("wss://");
        let is_remote = stripped.contains("kbve.com")
            || stripped.contains("chuckrpg.com")
            || (!stripped.starts_with("127.0.0.1")
                && !stripped.starts_with("localhost")
                && stripped.parse::<std::net::SocketAddr>().is_err());

        if is_remote {
            // Fetch token from the server's API endpoint
            let api_base = resolved_ws
                .replace("ws://", "http://")
                .replace("wss://", "https://")
                .trim_end_matches("/ws")
                .to_string();
            let token_url = format!("{api_base}/api/v1/auth/game-token");
            let jwt_body = jwt.clone().unwrap_or_default();
            // Force websocket transport for now — WebTransport (QUIC) needs
            // additional work for production routing through Cilium/Cloudflare.
            let transport_hint = "websocket";

            info!("[net] desktop: fetching token from {token_url} (remote server)");
            match ureq::post(&token_url)
                .header("Content-Type", "application/json")
                .send_json(&serde_json::json!({
                    "jwt": jwt_body,
                    "transport": transport_hint,
                })) {
                Ok(mut resp) => {
                    let body: serde_json::Value = resp.body_mut().read_json().unwrap_or_default();
                    let token_b64 = body["token"].as_str().unwrap_or("");
                    let server_url = body["server_url"].as_str().unwrap_or(&resolved_ws);
                    let server_wt_url = body["server_wt_url"].as_str().unwrap_or("");
                    let cert_digest = body["cert_digest"].as_str().unwrap_or("");
                    let cert_type = body["cert_type"].as_str().unwrap_or("");

                    if token_b64.is_empty() {
                        warn!("[net] desktop: server returned empty token — cannot connect");
                        return;
                    }

                    let token_bytes = net_config::base64_to_token_bytes(token_b64)
                        .expect("base64_to_token_bytes failed");

                    info!(
                        "[net] desktop: token received — ws={server_url} wt={server_wt_url} cert_type={cert_type}"
                    );

                    // Build transport based on the hint we sent.
                    // The server may return both WS and WT URLs, but we pick
                    // exactly the transport we asked for.
                    let transport = if transport_hint == "webtransport" && !server_wt_url.is_empty()
                    {
                        ClientTransport::WebTransport {
                            url: server_wt_url.to_string(),
                            cert_digest: cert_digest.to_string(),
                            cert_type: cert_type.to_string(),
                            ws_fallback_url: if server_url.is_empty() {
                                None
                            } else {
                                Some(server_url.to_string())
                            },
                        }
                    } else {
                        ClientTransport::WebSocket {
                            url: server_url.to_string(),
                        }
                    };

                    connect_to_server(&mut commands, &transport, &token_bytes);
                    info!("[net] desktop: remote connection initiated");
                    return;
                }
                Err(e) => {
                    warn!("[net] desktop: token fetch failed: {e} — falling back to local token");
                    // Fall through to local token generation
                }
            }
        }

        let private_key = net_config::load_private_key();
        let protocol_id = net_config::KBVE_PROTOCOL_ID;
        let client_id = rand::random::<u64>().max(1);

        // Parse the WS address for the token (needs a SocketAddr for local servers)
        let socket_addr: std::net::SocketAddr = stripped
            .parse()
            .unwrap_or_else(|_| "127.0.0.1:5000".parse().unwrap());

        let user_data = match &jwt {
            Some(j) if !j.is_empty() => {
                // In desktop dev mode, pack a placeholder user_data
                net_config::pack_user_data("desktop-dev-user")
            }
            _ => [0u8; 256],
        };

        let token = lightyear::netcode::ConnectToken::build(
            socket_addr,
            protocol_id,
            client_id,
            private_key,
        )
        .user_data(user_data)
        .expire_seconds(120)
        .timeout_seconds(15)
        .generate()
        .expect("ConnectToken generation failed");

        let token_b64 = net_config::token_to_base64(token).expect("token_to_base64 failed");
        let token_bytes =
            net_config::base64_to_token_bytes(&token_b64).expect("base64_to_token_bytes failed");

        // Check for local WebTransport cert digest
        let cert_digest_path = std::env::var("GAME_WT_DIGEST")
            .unwrap_or_else(|_| "apps/kbve/isometric/certificates/digest.txt".to_string());
        let (wt_url, cert_digest) = match std::fs::read_to_string(&cert_digest_path) {
            Ok(digest) => {
                let digest = digest.trim().to_owned();
                // Derive WT address from WS address (port + 1)
                let wt_port = socket_addr.port() + 1;
                let wt_addr = format!("https://{}:{wt_port}", socket_addr.ip());
                (wt_addr, digest)
            }
            Err(_) => (String::new(), String::new()),
        };

        let transport = if !wt_url.is_empty() {
            ClientTransport::WebTransport {
                url: wt_url,
                cert_digest,
                cert_type: "self-signed".to_string(),
                ws_fallback_url: Some(resolved_ws.clone()),
            }
        } else {
            ClientTransport::WebSocket {
                url: resolved_ws.clone(),
            }
        };

        info!("[net] desktop: generated ConnectToken locally, connecting...");
        connect_to_server(&mut commands, &transport, &token_bytes);
    }

    // --- WASM path: fetch token from auth endpoint ---
    #[cfg(target_arch = "wasm32")]
    {
        pending_token.in_flight = true;

        let jwt_for_fetch = jwt.unwrap_or_default();
        let ws_url = resolved_ws.clone();
        let prefers_wt = profile.has_webtransport;

        // API base comes from ClientProfile — resolved once by JS at page load.
        let api_base = profile.api_base.clone();

        wasm_bindgen_futures::spawn_local(async move {
            match fetch_game_token(&api_base, &jwt_for_fetch, prefers_wt).await {
                Ok(result) => {
                    let ws = if result.server_url.is_empty() {
                        ws_url
                    } else {
                        result.server_url
                    };
                    if let Ok(mut guard) = PENDING_TOKEN_RESULT.lock() {
                        *guard = Some(TokenFetchResult {
                            token_bytes: result.token_bytes,
                            server_url: ws,
                            server_wt_url: result.server_wt_url,
                            cert_digest: result.cert_digest,
                            cert_type: result.cert_type,
                        });
                    }
                }
                Err(e) => {
                    log::error!("[net] WASM token fetch failed: {e}");
                    crate::game::telemetry::report_error(&format!("token fetch failed: {e}"));
                    // Reset in_flight so user can retry
                    // (PendingTokenFetch is a Bevy resource, can't access from async;
                    //  poll_token_fetch_result handles the reset when it sees no result)
                }
            }
        });

        info!("[net] WASM: async token fetch dispatched");
    }
}

/// System that polls for completed WASM token fetch results and initiates connection.
fn poll_token_fetch_result(
    mut commands: Commands,
    profile: Res<super::client_profile::ClientProfile>,
    mut pending_token: ResMut<PendingTokenFetch>,
) {
    if !pending_token.in_flight {
        return;
    }

    let result = PENDING_TOKEN_RESULT.lock().ok().and_then(|mut g| g.take());
    let Some(result) = result else {
        return;
    };

    pending_token.in_flight = false;

    // Use the server URL directly — WebSocket connections are NOT subject
    // to COEP restrictions, so cross-origin WS to a different port works.
    // The Vite proxy approach caused Netcode handshake failures due to
    // frame buffering/rewriting by http-proxy.
    let ws_url = result.server_url.clone();

    // Use the server's WT URL if the browser supports WebTransport.
    // The token endpoint returns the correct production hostname.
    let wt_url = if !result.server_wt_url.is_empty() && profile.has_webtransport {
        result.server_wt_url.clone()
    } else {
        if !result.server_wt_url.is_empty() {
            info!(
                "[net] WebTransport URL provided but browser lacks WebTransport API — falling back to WebSocket"
            );
        }
        String::new()
    };

    let transport = if !wt_url.is_empty() {
        ClientTransport::WebTransport {
            url: wt_url,
            cert_digest: result.cert_digest.clone(),
            cert_type: result.cert_type.clone(),
            ws_fallback_url: if ws_url.is_empty() {
                None
            } else {
                Some(ws_url.clone())
            },
        }
    } else {
        ClientTransport::WebSocket { url: ws_url }
    };

    let (transport_name, transport_url) = match &transport {
        ClientTransport::WebTransport { url, .. } => ("WebTransport", url.as_str()),
        ClientTransport::WebSocket { url } => ("WebSocket", url.as_str()),
    };
    info!("[net] WASM token fetch complete, connecting via {transport_name} to {transport_url}");
    connect_to_server(&mut commands, &transport, &result.token_bytes);
}

/// Check if the browser supports the WebTransport API.
/// Safari does not support WebTransport — returns false so the client falls back to WebSocket.
#[cfg(target_arch = "wasm32")]
fn has_webtransport_support() -> bool {
    use wasm_bindgen::prelude::*;

    let global = js_sys::global();
    let wt = js_sys::Reflect::get(&global, &JsValue::from_str("WebTransport"));
    matches!(wt, Ok(val) if !val.is_undefined())
}

#[cfg(not(target_arch = "wasm32"))]
fn has_webtransport_support() -> bool {
    // Desktop: WebTransport is handled natively by lightyear, always supported
    true
}

/// Result from the game-token API.
#[cfg(target_arch = "wasm32")]
struct GameTokenResult {
    token_bytes: [u8; 2048],
    server_url: String,
    server_wt_url: String,
    cert_digest: String,
    cert_type: String,
}

/// Fetch a ConnectToken from the auth API (WASM only).
///
/// `prefers_wt` tells the server whether the browser supports WebTransport.
/// The server uses this to order the addresses in the ConnectToken so the
/// netcode handshake tries the right transport's port first, avoiding a
/// wasted timeout on the wrong port (critical for Safari which only has WS).
#[cfg(target_arch = "wasm32")]
async fn fetch_game_token(
    api_base: &str,
    jwt: &str,
    prefers_wt: bool,
) -> Result<GameTokenResult, String> {
    use wasm_bindgen::JsCast;
    use wasm_bindgen_futures::JsFuture;
    use web_sys::{Request, RequestInit, RequestMode, Response};

    let url = format!("{api_base}/api/v1/auth/game-token");
    let transport = if prefers_wt {
        "webtransport"
    } else {
        "websocket"
    };
    let body = serde_json::json!({ "jwt": jwt, "transport": transport }).to_string();

    let mut opts = RequestInit::new();
    opts.method("POST");
    opts.mode(RequestMode::Cors);
    opts.body(Some(&wasm_bindgen::JsValue::from_str(&body)));

    let request = Request::new_with_str_and_init(&url, &opts)
        .map_err(|e| format!("Request::new failed: {e:?}"))?;
    request
        .headers()
        .set("Content-Type", "application/json")
        .map_err(|e| format!("set header failed: {e:?}"))?;

    let window = web_sys::window().ok_or("no window")?;
    let resp_value = JsFuture::from(window.fetch_with_request(&request))
        .await
        .map_err(|e| format!("fetch failed: {e:?}"))?;

    let resp: Response = resp_value.dyn_into().map_err(|_| "response cast failed")?;
    if !resp.ok() {
        return Err(format!("HTTP {}", resp.status()));
    }

    let json_value = JsFuture::from(resp.json().map_err(|e| format!("json() failed: {e:?}"))?)
        .await
        .map_err(|e| format!("json parse failed: {e:?}"))?;

    let token_resp: serde_json::Value = serde_wasm_bindgen::from_value(json_value)
        .map_err(|e| format!("deserialize failed: {e}"))?;

    let token_b64 = token_resp["token"]
        .as_str()
        .ok_or("missing 'token' field")?;
    let server_url = token_resp["server_url"].as_str().unwrap_or("").to_owned();
    let server_wt_url = token_resp["server_wt_url"]
        .as_str()
        .unwrap_or("")
        .to_owned();
    let cert_digest = token_resp["cert_digest"].as_str().unwrap_or("").to_owned();
    let cert_type = token_resp["cert_type"].as_str().unwrap_or("").to_owned();

    let token_bytes = bevy_kbve_net::net_config::base64_to_token_bytes(token_b64)?;
    Ok(GameTokenResult {
        token_bytes,
        server_url,
        server_wt_url,
        cert_digest,
        cert_type,
    })
}

/// Send AuthMessage to server once the connection is established.
/// Polls every frame until MessageSender is available (may take a few frames
/// after Connected is inserted for lightyear to register message components).
///
/// NOTE: IS_CONNECTED is NOT set here — it is deferred until we receive a
/// successful AuthResponse.  Setting it prematurely caused two bugs:
///   1. If auth failed the flag stayed true forever, blocking reconnect.
///   2. The UI showed "Online" before the player was actually authenticated.
fn send_auth_on_connect(
    mut pending_auth: ResMut<PendingAuth>,
    mut query: Query<(Entity, &mut MessageSender<AuthMessage>), With<Connected>>,
) {
    if pending_auth.sent {
        return;
    }

    for (entity, mut sender) in &mut query {
        let jwt = pending_auth.jwt.take().unwrap_or_default();
        let jwt_len = jwt.len();
        info!(
            "[net] Connected + MessageSender ready on entity {entity:?} — sending AuthMessage (jwt_len={jwt_len})"
        );
        sender.send::<GameChannel>(AuthMessage { jwt });
        pending_auth.sent = true;
        info!("[net] auth message sent, waiting for AuthResponse before setting IS_CONNECTED");
        break;
    }
}

/// Receive AuthResponse from the server and store our player ID.
/// Once set, `spawn_remote_player_visuals` will categorise all pending
/// replicated entities (marking ours as `OwnReplicatedPlayer` + hidden).
///
/// On success: sets IS_CONNECTED=true so the UI transitions to "Online".
/// On failure: disconnects the client entity so the user can retry.
fn receive_auth_response(
    mut commands: Commands,
    mut my_player_id: ResMut<MyPlayerId>,
    mut next_phase: ResMut<NextState<super::phase::GamePhase>>,
    phase: Res<State<super::phase::GamePhase>>,
    mut query: Query<(
        Entity,
        &mut MessageReceiver<AuthResponse>,
        &mut MessageSender<AuthAck>,
    )>,
) {
    for (entity, mut receiver, mut ack_sender) in &mut query {
        for msg in receiver.receive() {
            if msg.success {
                my_player_id.0 = Some(msg.player_id);
                IS_CONNECTED.store(true, Ordering::Release);
                info!(
                    "[net] AUTH SUCCESS from entity {entity:?} — user='{}' player_id={} server_time={} IS_CONNECTED=true",
                    msg.user_id, msg.player_id, msg.server_time
                );

                // Step 4: echo server_time back to complete the 4-step handshake
                ack_sender.send::<GameChannel>(AuthAck {
                    server_time: msg.server_time,
                });
                info!(
                    "[net] AuthAck sent — echoed server_time={}",
                    msg.server_time
                );

                // Don't transition to Playing yet — wait for first TimeSyncMessage
                // so the world has correct time-of-day before the player sees it.
                if **phase == super::phase::GamePhase::Connecting {
                    info!("[net] auth complete — waiting for first time sync before Playing");
                }
            } else {
                warn!("[net] AUTH FAILED from entity {entity:?} — triggering Disconnect to reset");
                super::telemetry::report_error("server auth failed — disconnecting");
                // Trigger a graceful disconnect so on_disconnected cleans up
                // and the user can retry (e.g. after refreshing their JWT).
                commands.trigger(Disconnect { entity });
            }
        }
    }
}

/// Send the local player's position to the server each fixed tick.
fn send_position_updates(
    my_player_id: Res<MyPlayerId>,
    player_query: Query<&Transform, With<Player>>,
    mut sender_query: Query<&mut MessageSender<PositionUpdate>, With<Connected>>,
) {
    // Only send if we're authenticated
    if my_player_id.0.is_none() {
        return;
    }

    let Ok(transform) = player_query.single() else {
        return;
    };
    let pos = transform.translation;

    for mut sender in &mut sender_query {
        sender.send::<GameChannel>(PositionUpdate {
            x: pos.x,
            y: pos.y,
            z: pos.z,
        });
    }
}

/// Process replicated player entities that haven't been categorised yet.
/// Defers until `MyPlayerId` is known so we never accidentally spawn a ghost
/// visual for our own player.

/// Observer: immediately hide any replicated player entity the instant PlayerId
/// is added. This prevents a visible "ghost" frame before spawn_remote_player_visuals
/// runs and decides whether to show it or mark it as own.
fn hide_new_replicated_player(trigger: On<Add, PlayerId>, mut commands: Commands) {
    let entity = trigger.entity;
    info!("[net] hiding new replicated player entity {entity:?} until categorised");
    commands.entity(entity).insert(Visibility::Hidden);
}

fn spawn_remote_player_visuals(
    mut commands: Commands,
    my_player_id: Res<MyPlayerId>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    query: Query<
        (Entity, &PlayerId, &PlayerColor, Option<&Position>),
        (Without<RemotePlayer>, Without<OwnReplicatedPlayer>),
    >,
) {
    // Don't process anything until we know who we are.
    let Some(my_id) = my_player_id.0 else {
        return;
    };

    for (entity, player_id, color, maybe_pos) in &query {
        if player_id.0 == my_id {
            // This is our own replicated entity — mark it and strip anything
            // that could render (collider/rigidbody from server replication,
            // plus hide visibility). We keep PlayerId/PlayerVitals for syncing.
            info!(
                "marking own replicated entity {entity:?} (player_id={})",
                my_id
            );
            commands
                .entity(entity)
                .remove::<(Collider, RigidBody, LinearVelocity)>();
            commands
                .entity(entity)
                .insert((OwnReplicatedPlayer, Visibility::Hidden));
            continue;
        }

        // Remote player — spawn a visible mesh.
        let initial_pos = maybe_pos.map(|p| p.0).unwrap_or(Vec3::new(2.0, 2.0, 2.0));
        info!(
            "spawning remote player visual for player_id={} entity={entity:?} at {initial_pos}",
            player_id.0
        );

        commands
            .entity(entity)
            .insert((
                Mesh3d(meshes.add(Cuboid::new(0.6, 1.2, 0.6))),
                MeshMaterial3d(materials.add(StandardMaterial {
                    base_color: color.0,
                    ..default()
                })),
                Transform::from_translation(initial_pos),
                Visibility::Visible,
                RemotePlayer,
            ))
            .with_child((
                Text2d::new(""),
                TextFont {
                    font_size: 24.0,
                    ..default()
                },
                TextColor(Color::WHITE),
                Transform::from_translation(Vec3::new(0.0, 1.6, 0.0)).with_scale(Vec3::splat(0.01)),
                PlayerNameLabel,
            ));
    }
}

/// Smoothly interpolate remote player transforms toward their replicated Position.
/// Uses exponential smoothing so movement looks fluid despite 100ms update intervals.
const REMOTE_LERP_SPEED: f32 = 12.0;

fn update_remote_transforms(
    time: Res<Time>,
    mut query: Query<(&Position, &mut Transform), With<RemotePlayer>>,
) {
    let t = (REMOTE_LERP_SPEED * time.delta_secs()).min(1.0);
    for (position, mut transform) in &mut query {
        transform.translation = transform.translation.lerp(position.0, t);
    }
}

/// Sync replicated PlayerVitals from our own player entity into local PlayerState.
fn sync_vitals_to_local_state(
    my_player_id: Res<MyPlayerId>,
    vitals_query: Query<(&PlayerId, &PlayerVitals), Changed<PlayerVitals>>,
    mut player_state: ResMut<PlayerState>,
) {
    let Some(my_id) = my_player_id.0 else {
        return;
    };

    for (pid, vitals) in &vitals_query {
        if pid.0 == my_id {
            player_state.health = vitals.health;
            player_state.max_health = vitals.max_health;
            player_state.mana = vitals.mana;
            player_state.max_mana = vitals.max_mana;
            player_state.energy = vitals.energy;
            player_state.max_energy = vitals.max_energy;
        }
    }
}

/// Forward CollectEvent to the server as a CollectRequest.
fn forward_collect_to_server(
    trigger: On<CollectEvent>,
    mut senders: Query<&mut MessageSender<CollectRequest>, With<Connected>>,
) {
    let event = &*trigger;
    let tile = TileKey {
        tx: event.tx,
        tz: event.tz,
    };
    info!(
        "[net] sending collect request for {:?} at ({},{})",
        event.kind, event.tx, event.tz
    );
    for mut sender in &mut senders {
        sender.send::<GameChannel>(CollectRequest { tile });
    }
}

// Re-export the shared CreatureCaptureEvent so game code can trigger captures
// without depending on bevy_npc directly.
pub use bevy_kbve_net::npcdb::creature::CreatureCaptureEvent;

/// Map a `ProtoNpcId` to the protocol's `CreatureKind` for wire messages.
/// This is the bridge between the game-agnostic `ProtoNpcId` and the
/// hardcoded protocol enum (to be removed when protocol migrates to ProtoNpcId).
fn npc_id_to_creature_kind(npc_id: ProtoNpcId) -> Option<CreatureKind> {
    // Compare against known NPC ref hashes
    let firefly_id = ProtoNpcId::from_ref("meadow-firefly");
    let butterfly_id = ProtoNpcId::from_ref("woodland-butterfly");
    let frog_id = ProtoNpcId::from_ref("green-toad");

    if npc_id == firefly_id {
        Some(CreatureKind::Firefly)
    } else if npc_id == butterfly_id {
        Some(CreatureKind::Butterfly)
    } else if npc_id == frog_id {
        Some(CreatureKind::Frog)
    } else {
        None
    }
}

/// Forward a local creature capture attempt to the server.
/// Bridges the game-agnostic `CreatureCaptureEvent` (ProtoNpcId-based) to
/// the wire protocol's `CreatureCaptureRequest` (CreatureKind-based).
fn forward_creature_capture_to_server(
    trigger: On<CreatureCaptureEvent>,
    mut senders: Query<&mut MessageSender<CreatureCaptureRequest>, With<Connected>>,
) {
    let event = &*trigger;
    let Some(kind) = npc_id_to_creature_kind(event.npc_id) else {
        warn!(
            "[net] cannot send capture request: unknown npc_id {:?}",
            event.npc_id
        );
        return;
    };
    info!(
        "[net] sending creature capture request: {:?} index={}",
        kind, event.creature_index
    );
    for mut sender in &mut senders {
        sender.send::<GameChannel>(CreatureCaptureRequest {
            kind,
            creature_index: event.creature_index,
        });
    }
}

/// Forward local FallDamageEvent to the server as a DamageEvent.
fn forward_fall_damage_to_server(
    trigger: On<FallDamageEvent>,
    mut senders: Query<&mut MessageSender<DamageEvent>, With<Connected>>,
) {
    let event = &*trigger;
    for mut sender in &mut senders {
        sender.send::<GameChannel>(DamageEvent {
            amount: event.amount,
            source: DamageSource::Fall,
        });
    }
}

/// Receive ObjectRemoved messages from the server.
/// For entities not already animating locally, attach the appropriate animation
/// component. If we are the collector, grant loot (server-confirmed).
fn receive_object_removed(
    mut commands: Commands,
    my_player_id: Res<MyPlayerId>,
    mut collected_tiles: ResMut<CollectedTiles>,
    mut query: Query<(Entity, &mut MessageReceiver<ObjectRemoved>)>,
    tile_entities: Query<
        (Entity, &TileCoord),
        (
            Without<ChoppingTree>,
            Without<MiningRock>,
            Without<CollectingForageable>,
        ),
    >,
) {
    for (_entity, mut receiver) in &mut query {
        for msg in receiver.receive() {
            let (tx, tz) = (msg.tile.tx, msg.tile.tz);
            collected_tiles.0.insert((tx, tz));

            let is_mine = my_player_id.0 == Some(msg.collector_id) && msg.collector_id != 0;

            // Grant loot to the collecting player (server-confirmed)
            if is_mine {
                let (kind, qty) = match msg.kind {
                    bevy_kbve_net::WorldObjectKind::Tree => (ItemKind::from_ref(ITEM_LOG), 1),
                    bevy_kbve_net::WorldObjectKind::Rock => (ItemKind::from_ref(ITEM_STONE), 1),
                    bevy_kbve_net::WorldObjectKind::Flower => {
                        (ItemKind::from_ref(ITEM_WILDFLOWER), 1)
                    }
                    bevy_kbve_net::WorldObjectKind::Mushroom => {
                        (ItemKind::from_ref(ITEM_PORCINI), 1)
                    }
                };
                commands.trigger(LootEvent {
                    kind,
                    quantity: qty,
                });
                info!(
                    "[net] server confirmed loot: {:?} x{qty} at ({tx},{tz})",
                    kind
                );
            }

            // Start removal animation for entities not already animating.
            // If we started a local animation (via action button), the
            // Without<ChoppingTree/MiningRock/CollectingForageable> filter
            // skips it automatically.
            for (obj_entity, coord) in &tile_entities {
                if coord.tx == tx && coord.tz == tz {
                    info!("[net] animating removal at ({tx},{tz}) — {:?}", msg.kind);

                    // Strip physics + interactability so it can't be clicked again
                    commands.entity(obj_entity).remove::<(
                        avian3d::prelude::RigidBody,
                        avian3d::prelude::Collider,
                        super::scene_objects::Interactable,
                        super::scene_objects::HoverOutline,
                    )>();

                    // Insert animation — loot_dropped=true since loot is handled above
                    match msg.kind {
                        bevy_kbve_net::WorldObjectKind::Tree => {
                            let angle = (tx as f32 * 1.618 + tz as f32 * 2.71)
                                % (2.0 * std::f32::consts::PI);
                            let fall_axis = Vec3::new(angle.cos(), 0.0, angle.sin()).normalize();
                            commands.entity(obj_entity).insert(ChoppingTree {
                                timer: Timer::from_seconds(1.0, TimerMode::Once),
                                fall_axis,
                                original_rotation: Quat::IDENTITY,
                                smoke_spawned: false,
                                loot_dropped: true,
                            });
                        }
                        bevy_kbve_net::WorldObjectKind::Rock => {
                            commands.entity(obj_entity).insert(MiningRock {
                                timer: Timer::from_seconds(1.2, TimerMode::Once),
                                original_translation: Vec3::ZERO,
                                original_scale: Vec3::ONE,
                                smoke_spawned: false,
                                loot_dropped: true,
                                loot_item: ItemKind::from_ref(ITEM_STONE),
                            });
                        }
                        bevy_kbve_net::WorldObjectKind::Flower => {
                            commands.entity(obj_entity).insert(CollectingForageable {
                                timer: Timer::from_seconds(0.5, TimerMode::Once),
                                original_scale: Vec3::ONE,
                                loot_dropped: true,
                                loot_item: ItemKind::from_ref(ITEM_WILDFLOWER),
                            });
                        }
                        bevy_kbve_net::WorldObjectKind::Mushroom => {
                            commands.entity(obj_entity).insert(CollectingForageable {
                                timer: Timer::from_seconds(0.5, TimerMode::Once),
                                original_scale: Vec3::ONE,
                                loot_dropped: true,
                                loot_item: ItemKind::from_ref(ITEM_PORCINI),
                            });
                        }
                    }
                }
            }
        }
    }
}

/// Receive ObjectRespawned messages from the server.
fn receive_object_respawned(
    mut collected_tiles: ResMut<CollectedTiles>,
    mut query: Query<(Entity, &mut MessageReceiver<ObjectRespawned>)>,
) {
    for (_entity, mut receiver) in &mut query {
        for msg in receiver.receive() {
            let (tx, tz) = (msg.tile.tx, msg.tile.tz);
            collected_tiles.0.remove(&(tx, tz));
            info!("[net] object respawned at ({tx},{tz}) — {:?}", msg.kind);
        }
    }
}

/// Transport selection — each variant is fully self-contained.
/// Follows lightyear's example pattern: one enum, one IO component per entity.
enum ClientTransport {
    WebSocket {
        url: String,
    },
    WebTransport {
        url: String,
        cert_digest: String,
        cert_type: String,
        /// Optional WS URL for in-place fallback if WT fails.
        ws_fallback_url: Option<String>,
    },
}

/// Initiate a Netcode connection to the game server.
fn connect_to_server(commands: &mut Commands, transport: &ClientTransport, token_bytes: &[u8]) {
    use lightyear::netcode::prelude::client::*;

    let transport_url = match transport {
        ClientTransport::WebSocket { url } => url.as_str(),
        ClientTransport::WebTransport { url, .. } => url.as_str(),
    };

    if transport_url.is_empty() {
        warn!("[net] connect_to_server called with empty URL — aborting");
        return;
    }

    // Safety: on WASM release builds, block localhost game-server connections
    // UNLESS the page itself is served from localhost (local dev via quick script).
    #[cfg(target_arch = "wasm32")]
    {
        let is_local_target =
            transport_url.contains("127.0.0.1") || transport_url.contains("localhost");
        let page_is_local = web_sys::window()
            .and_then(|w| w.location().hostname().ok())
            .map(|h| h == "localhost" || h == "127.0.0.1")
            .unwrap_or(false);
        if is_local_target && !page_is_local {
            warn!(
                "[net] BLOCKED localhost connection on WASM: {transport_url} — page is not localhost"
            );
            return;
        }
    }

    let token = ConnectToken::try_from_bytes(token_bytes).expect("invalid ConnectToken bytes");
    let netcode = NetcodeClient::new(Authentication::Token(token), NetcodeConfig::default())
        .expect("NetcodeClient init failed");

    match transport {
        ClientTransport::WebTransport {
            url,
            cert_digest,
            cert_type,
            ws_fallback_url,
        } => {
            use lightyear::webtransport::prelude::client::*;

            let is_trusted = cert_type == "trusted";
            info!(
                "[net] connect_to_server — using WebTransport: {url} (cert_type={cert_type}, digest={}...)",
                if cert_digest.len() >= 16 {
                    &cert_digest[..16]
                } else {
                    cert_digest
                }
            );

            let addr_str = url
                .trim_start_matches("https://")
                .trim_start_matches("http://");

            // Resolve to SocketAddr — on WASM use dummy since we connect via hostname
            let server_addr: std::net::SocketAddr =
                if addr_str.parse::<std::net::SocketAddr>().is_ok() {
                    addr_str.parse().unwrap()
                } else {
                    #[cfg(not(target_arch = "wasm32"))]
                    {
                        use std::net::ToSocketAddrs;
                        addr_str
                            .to_socket_addrs()
                            .ok()
                            .and_then(|mut addrs| addrs.find(|a| a.is_ipv4()))
                            .unwrap_or_else(|| "127.0.0.1:5001".parse().unwrap())
                    }
                    #[cfg(target_arch = "wasm32")]
                    {
                        // WASM: can't DNS resolve. Use dummy — our wasm_wt_hostname_link
                        // observer uses WtHostnameUrl for the real connection.
                        let port = addr_str
                            .rsplit(':')
                            .next()
                            .and_then(|p| p.parse::<u16>().ok())
                            .unwrap_or(5001);
                        std::net::SocketAddr::new(
                            std::net::IpAddr::V4(std::net::Ipv4Addr::UNSPECIFIED),
                            port,
                        )
                    }
                };

            let digest = if is_trusted {
                info!("[net] trusted cert — no hash pinning, browser will validate via CA chain");
                String::new()
            } else {
                info!("[net] self-signed cert — using hash pinning with cert_digest");
                cert_digest.clone()
            };

            let mut entity_commands = commands.spawn((
                netcode,
                PeerAddr(server_addr),
                WebTransportClientIo {
                    certificate_digest: digest,
                },
                ReplicationReceiver::default(),
            ));

            // WASM: store hostname URL for our LinkStart observer
            #[cfg(target_arch = "wasm32")]
            {
                let full_url = if url.starts_with("https://") {
                    url.clone()
                } else {
                    format!("https://{url}")
                };
                entity_commands.insert(bevy_kbve_net::client::WtHostnameUrl(full_url));
            }

            if let Some(ws_url) = ws_fallback_url {
                let mut tb = [0u8; 2048];
                tb.copy_from_slice(token_bytes);
                entity_commands.insert(WsFallback {
                    ws_url: ws_url.clone(),
                    token_bytes: tb,
                });
            }

            let client_entity = entity_commands.id();
            info!(
                "[net] NetcodeClient+WebTransport entity spawned: {client_entity:?} addr={server_addr}"
            );
            commands.trigger(Connect {
                entity: client_entity,
            });
            info!("[net] Connect trigger dispatched — Netcode+WebTransport handshake starting");
        }
        ClientTransport::WebSocket { url } => {
            info!("[net] connect_to_server — using WebSocket: {url}");

            // WASM: use our custom WasmWsSocket (bypasses aeronet's broken send_loop)
            #[cfg(target_arch = "wasm32")]
            {
                match bevy_kbve_net::wasm_ws::open_wasm_ws(&url) {
                    Ok(ws_socket) => {
                        let client_entity = commands
                            .spawn((
                                netcode,
                                lightyear::prelude::Link::new(None),
                                ws_socket,
                                ReplicationReceiver::default(),
                            ))
                            .id();

                        // Insert Linking — our wasm_ws_lifecycle system will
                        // upgrade to Linked when on_open fires
                        commands
                            .entity(client_entity)
                            .insert(lightyear::prelude::Linking);

                        info!("[net] NetcodeClient+WasmWsSocket entity spawned: {client_entity:?}");
                        commands.trigger(Connect {
                            entity: client_entity,
                        });
                        info!("[net] Connect trigger dispatched — WASM WS handshake starting");
                    }
                    Err(e) => {
                        warn!("[net] Failed to create WASM WebSocket: {:?}", e);
                    }
                }
            }

            // Native: use aeronet's WebSocketClientIo (works fine with tokio)
            #[cfg(not(target_arch = "wasm32"))]
            {
                use lightyear::websocket::prelude::client::*;

                let ws_config = ClientConfig::builder().with_no_cert_validation();
                let ws_io = WebSocketClientIo::from_url(ws_config, url.clone());

                let client_entity = commands
                    .spawn((netcode, ws_io, ReplicationReceiver::default()))
                    .id();

                info!("[net] NetcodeClient+WebSocket entity spawned: {client_entity:?}");
                commands.trigger(Connect {
                    entity: client_entity,
                });
                info!("[net] Connect trigger dispatched — Netcode+WebSocket handshake starting");
            }
        }
    }
}

/// Update PlayerNameLabel text to match the parent entity's replicated PlayerName.
fn update_player_name_labels(
    parents: Query<(&PlayerName, &Children), (With<RemotePlayer>, Changed<PlayerName>)>,
    mut labels: Query<&mut Text2d, With<PlayerNameLabel>>,
) {
    for (name, children) in &parents {
        for child in children.iter() {
            if let Ok(mut text) = labels.get_mut(child) {
                *text = Text2d::new(&name.0);
            }
        }
    }
}

/// Billboard: rotate name labels to always face the camera.
fn billboard_name_labels(
    camera_q: Query<&GlobalTransform, With<Camera3d>>,
    mut labels: Query<&mut Transform, With<PlayerNameLabel>>,
) {
    let Ok(cam_gt) = camera_q.single() else {
        return;
    };
    let cam_forward = cam_gt.forward().as_vec3();
    let look_rot = Quat::from_rotation_arc(Vec3::NEG_Z, -cam_forward);
    for mut transform in &mut labels {
        let scale = transform.scale;
        transform.rotation = look_rot;
        transform.scale = scale;
    }
}

/// Poll the static SET_USERNAME_REQUEST and send it to the server.
fn poll_set_username_request(
    mut senders: Query<&mut MessageSender<SetUsernameRequest>, With<Connected>>,
) {
    let username = {
        let Ok(mut guard) = SET_USERNAME_REQUEST.lock() else {
            return;
        };
        guard.take()
    };

    let Some(username) = username else {
        return;
    };

    info!("[net] sending SetUsernameRequest: '{username}'");
    for mut sender in &mut senders {
        sender.send::<GameChannel>(SetUsernameRequest {
            username: username.clone(),
        });
    }
}

/// Receive TimeSyncMessage from the server and update ServerTime resource.
fn receive_time_sync(
    mut server_time: ResMut<ServerTime>,
    mut next_phase: ResMut<NextState<super::phase::GamePhase>>,
    phase: Res<State<super::phase::GamePhase>>,
    mut query: Query<(Entity, &mut MessageReceiver<TimeSyncMessage>)>,
) {
    for (_entity, mut receiver) in &mut query {
        for msg in receiver.receive() {
            server_time.game_hour = msg.game_hour;
            server_time.day_speed = msg.day_speed;
            server_time.creature_seed = msg.creature_seed;
            server_time.wind_speed_mph = msg.wind_speed_mph;
            server_time.wind_direction = msg.wind_direction;
            if !server_time.active {
                info!(
                    "[net] first time sync from server: hour={:.1} speed={:.4} seed={}",
                    msg.game_hour, msg.day_speed, msg.creature_seed
                );
                server_time.active = true;

                // Now that we have the world time, transition to Playing
                if **phase == super::phase::GamePhase::Connecting {
                    info!("[net] time sync received — transitioning Connecting → Playing");
                    next_phase.set(super::phase::GamePhase::Playing);
                }
            }
        }
    }
}

/// Map a protocol `CreatureKind` to a client `RenderKind` for entity matching.
fn creature_kind_to_render_kind(kind: CreatureKind) -> RenderKind {
    match kind {
        CreatureKind::Firefly => RenderKind::Emissive,
        CreatureKind::Butterfly => RenderKind::Billboard,
        CreatureKind::Frog => RenderKind::Sprite,
    }
}

/// Map a protocol `CreatureKind` to a `ProtoNpcId` for the shared capture tracker.
fn creature_kind_to_npc_id(kind: CreatureKind) -> ProtoNpcId {
    match kind {
        CreatureKind::Firefly => ProtoNpcId::from_ref("meadow-firefly"),
        CreatureKind::Butterfly => ProtoNpcId::from_ref("woodland-butterfly"),
        CreatureKind::Frog => ProtoNpcId::from_ref("green-toad"),
    }
}

/// Receive CreatureCaptured messages from the server and mark matching pool entities.
fn receive_creature_captured(
    mut captured: ResMut<CapturedCreatures>,
    mut query: Query<(Entity, &mut MessageReceiver<CreatureCaptured>)>,
    mut creatures: Query<(&mut Creature, &CreaturePoolIndex, &mut Visibility)>,
) {
    for (_entity, mut receiver) in &mut query {
        for msg in receiver.receive() {
            let render_kind = creature_kind_to_render_kind(msg.kind);
            let npc_id = creature_kind_to_npc_id(msg.kind);

            // Record in shared capture tracker
            captured.insert(npc_id, msg.creature_index);

            // Find the matching pool entity and mark as captured
            let mut found = false;
            for (mut creature, pool_idx, mut vis) in &mut creatures {
                if creature.render_kind == render_kind && pool_idx.0 == msg.creature_index {
                    creature.state = CreatureState::Captured;
                    creature.assigned_slot = None;
                    *vis = Visibility::Hidden;
                    found = true;
                    info!(
                        "[net] creature captured: {:?} index={} by player={}",
                        msg.kind, msg.creature_index, msg.captor_player_id
                    );
                    break;
                }
            }

            if !found {
                warn!(
                    "[net] received CreatureCaptured for {:?} index={} but no matching pool entity found",
                    msg.kind, msg.creature_index
                );
            }
        }
    }
}

/// Receive SetUsernameResponse from the server and log result.
fn receive_set_username_response(
    mut query: Query<(Entity, &mut MessageReceiver<SetUsernameResponse>)>,
) {
    for (entity, mut receiver) in &mut query {
        for msg in receiver.receive() {
            if msg.success {
                info!(
                    "[net] username set successfully: '{}' (from entity {entity:?})",
                    msg.username
                );
            } else {
                warn!(
                    "[net] set-username failed: '{}' (from entity {entity:?})",
                    msg.error
                );
            }
        }
    }
}
