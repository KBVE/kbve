//! Lightyear client-side networking plugin.
//!
//! Adds `ClientPlugins` (lightyear transport + replication) and the shared
//! `ProtocolPlugin` so the game can connect to the authoritative server.
//!
//! Connection is NOT established automatically — the player triggers it
//! via the "Go Online" UI button, which calls the `go_online` WASM export.

use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use avian3d::prelude::*;
use bevy::prelude::*;
use lightyear::prelude::client::*;
use lightyear::prelude::*;

use bevy_kbve_net::{
    AuthMessage, AuthResponse, CollectRequest, DamageEvent, DamageSource, GameChannel,
    ObjectRemoved, ObjectRespawned, PlayerColor, PlayerId, PlayerName, PlayerVitals,
    PositionUpdate, ProtocolPlugin, SetUsernameRequest, SetUsernameResponse, TileKey,
};

use super::actions::{ChoppingTree, CollectingForageable, MiningRock};
use super::inventory::{ItemKind, LootEvent};
use super::player::{FallDamageEvent, Player};
use super::scene_objects::CollectEvent;
use super::state::PlayerState;
use super::tilemap::{CollectedTiles, TileCoord};

/// Default server address (localhost for development).
const DEFAULT_SERVER_ADDR: SocketAddr = SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), 5000);

/// Tick rate matching the server (20 Hz).
const TICK_DURATION: Duration = Duration::from_millis(50);

/// Atomic flag set by JS `go_online()` call, consumed by Bevy system.
static GO_ONLINE_REQUESTED: AtomicBool = AtomicBool::new(false);

/// Optional server address override from JS (e.g. "1.2.3.4:5000").
static SERVER_ADDR_OVERRIDE: Mutex<Option<String>> = Mutex::new(None);

/// JWT token passed from JS for server authentication.
static AUTH_JWT: Mutex<Option<String>> = Mutex::new(None);

/// Atomic flag indicating whether we are currently connected.
static IS_CONNECTED: AtomicBool = AtomicBool::new(false);

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
/// `server_addr` can be empty to use the default, or "host:port" format.
/// `jwt` is the Supabase access token for authentication.
pub fn request_go_online(server_addr: &str, jwt: &str) {
    if !server_addr.is_empty() {
        if let Ok(mut guard) = SERVER_ADDR_OVERRIDE.lock() {
            *guard = Some(server_addr.to_owned());
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

/// Bevy resource holding the resolved game server address.
#[derive(Resource)]
pub struct GameServerAddr(pub SocketAddr);

impl Default for GameServerAddr {
    fn default() -> Self {
        let override_addr = SERVER_ADDR_OVERRIDE
            .lock()
            .ok()
            .and_then(|g| g.as_ref().and_then(|s| s.parse().ok()));

        let addr = override_addr
            .or_else(|| {
                std::env::var("GAME_SERVER_ADDR")
                    .ok()
                    .and_then(|s| s.parse().ok())
            })
            .unwrap_or(DEFAULT_SERVER_ADDR);
        Self(addr)
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

pub struct NetPlugin;

impl Plugin for NetPlugin {
    fn build(&self, app: &mut App) {
        info!("[net] NetPlugin::build — registering lightyear client plugins");

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

        // Watch for go-online requests from JS
        app.add_systems(Update, poll_go_online_request);

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
        app.add_systems(PostUpdate, update_remote_transforms);

        // Sync replicated PlayerVitals from our own player entity into local PlayerState
        app.add_systems(Update, sync_vitals_to_local_state);

        // Receive ObjectRemoved / ObjectRespawned messages from server
        app.add_systems(Update, receive_object_removed);
        app.add_systems(Update, receive_object_respawned);

        // Username display systems
        app.add_systems(Update, update_player_name_labels);
        app.add_systems(Update, billboard_name_labels);
        app.add_systems(Update, poll_set_username_request);
        app.add_systems(Update, receive_set_username_response);

        // Immediately hide any replicated entity with PlayerId — prevents
        // ghost flicker before spawn_remote_player_visuals decides visibility.
        app.add_observer(hide_new_replicated_player);

        // Forward fall damage / collect events to server via observers
        app.add_observer(forward_fall_damage_to_server);
        app.add_observer(forward_collect_to_server);

        // --- Debug observers for connection lifecycle ---
        // Lightyear-level states
        app.add_observer(on_connecting);
        app.add_observer(on_connected);
        app.add_observer(on_disconnected);
        // Link-level states (aeronet ↔ lightyear bridge)
        app.add_observer(on_linking);
        app.add_observer(on_linked);
        app.add_observer(on_unlinked);
        // Aeronet session endpoint (fires when aeronet spawns the session entity)
        app.add_observer(on_session_endpoint);

        // Periodic connection-state heartbeat (logs every ~2 seconds)
        app.add_systems(Update, debug_connection_heartbeat);

        info!("[net] NetPlugin::build — all systems registered");
    }
}

/// Debug: link layer — Linking added (WebSocket connection attempt started).
fn on_linking(trigger: On<Add, lightyear::prelude::Linking>) {
    let entity = trigger.entity;
    info!("[net][link] LINKING — entity {entity:?} transport connection starting");
}

/// When the link layer connects, promote to lightyear Connected state.
/// This replaces RawConnectionPlugin::on_linked which requires LocalAddr
/// (not available on WASM WebSocket).
fn on_linked(
    trigger: On<Add, lightyear::prelude::Linked>,
    query: Query<Entity, With<Client>>,
    mut commands: Commands,
) {
    let entity = trigger.entity;
    info!("[net][link] LINKED — entity {entity:?} transport connected!");

    // Only promote our Client entity, not other linked entities
    if query.get(entity).is_ok() {
        use lightyear::prelude::*;
        info!("[net][link] promoting entity {entity:?} to Connected (raw connection bridge)");
        commands.entity(entity).insert((
            Connected,
            lightyear::prelude::LocalId(lightyear::prelude::PeerId::Raw(
                std::net::SocketAddr::new(std::net::IpAddr::V4(std::net::Ipv4Addr::LOCALHOST), 0),
            )),
            lightyear::prelude::RemoteId(lightyear::prelude::PeerId::Server),
        ));
    }
}

/// Debug: link layer — Unlinked added (transport failed or closed).
fn on_unlinked(trigger: On<Add, lightyear::prelude::Unlinked>) {
    let entity = trigger.entity;
    warn!("[net][link] UNLINKED — entity {entity:?} transport failed or closed");
}

/// Debug: fires when LinkStart is triggered (our trigger → lightyear processes it).
fn on_session_endpoint(trigger: On<lightyear::prelude::LinkStart>) {
    let entity = trigger.entity;
    info!("[net][link] LINKSTART triggered — entity {entity:?}");
}

/// Debug: lightyear Connecting added.
fn on_connecting(trigger: On<Add, Connecting>) {
    let entity = trigger.entity;
    info!("[net][lifecycle] CONNECTING — entity {entity:?} lightyear handshake in progress");
}

/// Debug: lightyear Connected added.
fn on_connected(trigger: On<Add, Connected>) {
    let entity = trigger.entity;
    info!("[net][lifecycle] CONNECTED — entity {entity:?} fully connected!");
}

/// When we lose connection, reset all networking state so the player can reconnect.
/// Remote player entities are despawned since we won't receive further updates.
fn on_disconnected(
    trigger: On<Add, Disconnected>,
    mut commands: Commands,
    mut my_player_id: ResMut<MyPlayerId>,
    mut pending_auth: ResMut<PendingAuth>,
    remote_players: Query<Entity, With<RemotePlayer>>,
) {
    let entity = trigger.entity;
    warn!("[net][lifecycle] DISCONNECTED — entity {entity:?} lost connection");

    // Reset connection state
    IS_CONNECTED.store(false, Ordering::Release);
    my_player_id.0 = None;
    pending_auth.jwt = None;
    pending_auth.sent = false;

    // Despawn all remote player visuals
    let mut count = 0u32;
    for remote_entity in &remote_players {
        commands.entity(remote_entity).despawn();
        count += 1;
    }
    if count > 0 {
        info!("[net] despawned {count} remote player entities after disconnect");
    }

    info!("[net] connection state reset — ready for reconnection");
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
}

/// Bevy system that checks the atomic flag each frame and connects when requested.
fn poll_go_online_request(
    mut commands: Commands,
    addr: Res<GameServerAddr>,
    mut pending_auth: ResMut<PendingAuth>,
) {
    if !GO_ONLINE_REQUESTED.swap(false, Ordering::AcqRel) {
        return;
    }

    info!("[net] go-online request detected!");

    if IS_CONNECTED.load(Ordering::Relaxed) {
        info!("[net] already connected — ignoring go-online request");
        return;
    }

    // Grab the JWT before connecting
    let jwt = AUTH_JWT.lock().ok().and_then(|mut g| g.take());
    let has_jwt = jwt.is_some();
    pending_auth.jwt = jwt;
    pending_auth.sent = false;

    info!(
        "[net] resolved server address: {} | has_jwt: {has_jwt}",
        addr.0
    );
    connect_to_server(&mut commands, &addr);
}

/// Send AuthMessage to server once the connection is established.
/// Polls every frame until MessageSender is available (may take a few frames
/// after Connected is inserted for lightyear to register message components).
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
        IS_CONNECTED.store(true, Ordering::Release);
        info!("[net] auth message sent, IS_CONNECTED=true");
        break;
    }
}

/// Receive AuthResponse from the server and store our player ID.
/// Once set, `spawn_remote_player_visuals` will categorise all pending
/// replicated entities (marking ours as `OwnReplicatedPlayer` + hidden).
fn receive_auth_response(
    mut my_player_id: ResMut<MyPlayerId>,
    mut query: Query<(Entity, &mut MessageReceiver<AuthResponse>)>,
) {
    for (entity, mut receiver) in &mut query {
        for msg in receiver.receive() {
            if msg.success {
                my_player_id.0 = Some(msg.player_id);
                info!(
                    "[net] AUTH SUCCESS from entity {entity:?} — user='{}' player_id={}",
                    msg.user_id, msg.player_id
                );
            } else {
                warn!("[net] AUTH FAILED from entity {entity:?}");
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
                    bevy_kbve_net::WorldObjectKind::Tree => (ItemKind::Log, 1),
                    bevy_kbve_net::WorldObjectKind::Rock => (ItemKind::Stone, 1),
                    bevy_kbve_net::WorldObjectKind::Flower => (ItemKind::Wildflower, 1),
                    bevy_kbve_net::WorldObjectKind::Mushroom => (ItemKind::Porcini, 1),
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
                                loot_item: ItemKind::Stone,
                            });
                        }
                        bevy_kbve_net::WorldObjectKind::Flower => {
                            commands.entity(obj_entity).insert(CollectingForageable {
                                timer: Timer::from_seconds(0.5, TimerMode::Once),
                                original_scale: Vec3::ONE,
                                loot_dropped: true,
                                loot_item: ItemKind::Wildflower,
                            });
                        }
                        bevy_kbve_net::WorldObjectKind::Mushroom => {
                            commands.entity(obj_entity).insert(CollectingForageable {
                                timer: Timer::from_seconds(0.5, TimerMode::Once),
                                original_scale: Vec3::ONE,
                                loot_dropped: true,
                                loot_item: ItemKind::Porcini,
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

/// Initiate a WebSocket connection to the game server.
fn connect_to_server(commands: &mut Commands, addr: &GameServerAddr) {
    use lightyear::websocket::prelude::client::*;

    let server_addr = addr.0;

    info!("[net] connect_to_server — spawning client entity for ws://{server_addr}");

    let ws_io = WebSocketClientIo::from_addr(ClientConfig::default(), WebSocketScheme::Plain);
    info!("[net] WebSocketClientIo created (scheme=Plain)");

    let client_entity = commands
        .spawn((
            Client::default(),
            PeerAddr(server_addr),
            ws_io,
            ReplicationReceiver::default(),
        ))
        .id();

    info!("[net] client entity spawned: {client_entity:?} — triggering Connect (entity-targeted)");

    // Trigger Connect + LinkStart to initiate the connection
    commands.trigger(Connect {
        entity: client_entity,
    });
    commands.trigger(lightyear::prelude::LinkStart {
        entity: client_entity,
    });
    info!("[net] Connect trigger dispatched — waiting for Connecting → Connected lifecycle");
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
