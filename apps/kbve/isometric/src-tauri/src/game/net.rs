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
    AuthMessage, AuthResponse, GameChannel, PlayerColor, PlayerId, PositionUpdate, ProtocolPlugin,
};

use super::player::Player;

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

pub struct NetPlugin;

impl Plugin for NetPlugin {
    fn build(&self, app: &mut App) {
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

        // Spawn visuals for remote players when their replicated entities arrive
        app.add_systems(Update, spawn_remote_player_visuals);

        // Update remote player transforms from replicated Position each frame
        app.add_systems(PostUpdate, update_remote_transforms);
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

    if IS_CONNECTED.load(Ordering::Relaxed) {
        info!("already connected — ignoring go-online request");
        return;
    }

    // Grab the JWT before connecting
    let jwt = AUTH_JWT.lock().ok().and_then(|mut g| g.take());
    pending_auth.jwt = jwt;
    pending_auth.sent = false;

    connect_to_server(&mut commands, &addr);
}

/// Send AuthMessage to server once the connection is established.
/// Sends empty JWT for guest connections.
fn send_auth_on_connect(
    mut pending_auth: ResMut<PendingAuth>,
    mut query: Query<&mut MessageSender<AuthMessage>, Added<Connected>>,
) {
    if pending_auth.sent {
        return;
    }

    for mut sender in &mut query {
        let jwt = pending_auth.jwt.take().unwrap_or_default();
        sender.send::<GameChannel>(AuthMessage { jwt });
        pending_auth.sent = true;
        info!("sent auth message to server");
        break;
    }
}

/// Receive AuthResponse from the server and store our player ID.
fn receive_auth_response(
    mut my_player_id: ResMut<MyPlayerId>,
    mut query: Query<&mut MessageReceiver<AuthResponse>>,
) {
    for mut receiver in &mut query {
        for msg in receiver.receive() {
            if msg.success {
                my_player_id.0 = Some(msg.player_id);
                info!(
                    "authenticated as '{}' — player_id={}",
                    msg.user_id, msg.player_id
                );
            } else {
                warn!("authentication failed");
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

/// When a replicated entity with PlayerId arrives, spawn a mesh for remote players.
fn spawn_remote_player_visuals(
    mut commands: Commands,
    my_player_id: Res<MyPlayerId>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    query: Query<(Entity, &PlayerId, &PlayerColor), Added<PlayerId>>,
) {
    for (entity, player_id, color) in &query {
        // Skip our own player — we already have a locally-spawned entity
        if my_player_id.0 == Some(player_id.0) {
            info!("skipping visual spawn for own player entity {entity:?}");
            continue;
        }

        info!(
            "spawning remote player visual for player_id={} entity={entity:?}",
            player_id.0
        );

        commands.entity(entity).insert((
            Mesh3d(meshes.add(Cuboid::new(0.6, 1.2, 0.6))),
            MeshMaterial3d(materials.add(StandardMaterial {
                base_color: color.0,
                ..default()
            })),
            Transform::from_xyz(2.0, 2.0, 2.0),
            RemotePlayer,
        ));
    }
}

/// Sync remote player transforms from their replicated Position component.
fn update_remote_transforms(mut query: Query<(&Position, &mut Transform), With<RemotePlayer>>) {
    for (position, mut transform) in &mut query {
        transform.translation = position.0;
    }
}

/// Initiate a WebSocket connection to the game server.
fn connect_to_server(commands: &mut Commands, addr: &GameServerAddr) {
    use lightyear::websocket::prelude::client::*;

    let server_addr = addr.0;

    let client_entity = commands
        .spawn((
            Client::default(),
            PeerAddr(server_addr),
            WebSocketClientIo::from_addr(ClientConfig::default(), WebSocketScheme::Plain),
        ))
        .id();

    commands.trigger(Connect {
        entity: client_entity,
    });
    IS_CONNECTED.store(true, Ordering::Release);
    info!("connecting to game server at ws://{server_addr}");
}
